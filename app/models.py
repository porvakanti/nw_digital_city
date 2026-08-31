"""What can this key actually call?

Model names go stale. Google retired gemini-2.0-flash while this was being
built, and the only symptom was thirty-two identical 404s. This asks the
provider what it has instead of guessing, so the answer takes ten seconds
rather than an afternoon.

    run.cmd models        (Windows)
    ./run.sh models       (macOS, Linux)
"""

from __future__ import annotations

import os
import sys
import time

from . import env, providers

env.load()


def main() -> int:
    provider = os.environ.get("NW_PROVIDER", "mock").strip().lower()
    configured = os.environ.get("NW_MODEL", "").strip()
    default = providers.DEFAULT_MODELS.get(provider, "")

    print(f"provider: {provider}")
    print(f"model:    {configured or default or '(none)'}"
          f"{'' if configured else '   (the default; set NW_MODEL to pin one)'}\n")

    if provider == "mock":
        print("The mock provider needs no model. Set NW_PROVIDER=gemini in .env")
        print("to use your Google AI Studio key.")
        return 0

    if provider != "gemini":
        print(f"Listing is only implemented for gemini. For {provider}, see that")
        print("platform's own model list.")
        return 0

    key = os.environ.get("NW_API_KEY", "").strip()
    if not key:
        print("NW_API_KEY is not set in .env, so there is nothing to ask.")
        return 1

    print("Asking Google what this key can call...")
    started = time.monotonic()
    try:
        available = providers.gemini_models(key)
    except providers.ProviderError as exc:
        print(f"\n{exc}")
        return 1
    except Exception as exc:  # noqa: BLE001 - the message matters more than the class
        took = time.monotonic() - started
        status = getattr(getattr(exc, "response", None), "status_code", None)
        print(f"\nFailed after {took:.1f}s: {type(exc).__name__}: {exc}\n")
        if status in (400, 401, 403):
            print("  That is the key being refused, not the network. Check that")
            print("  NW_API_KEY in .env is a Google AI Studio key, pasted whole,")
            print("  with no quotes and no trailing spaces.")
        else:
            print("  The network reached Google and Google said no. The status")
            print("  above is the thing to search for.")
        return 1
    took = time.monotonic() - started
    print(f"Answered in {took:.1f}s.\n")

    if not available:
        print("This key can see no models that support generateContent.")
        return 1

    wanted = configured or default
    print(f"{len(available)} models this key can call. Suggested first:\n")
    for name in providers.GEMINI_PREFERENCE:
        if name in available:
            print(f"  * {name}")
    print()
    for name in sorted(available):
        print(f"    {name}")

    if wanted and wanted not in available:
        print(f"\n{wanted} is NOT in that list. Either clear NW_MODEL in .env and")
        print("one will be chosen for you, or set it to one of the starred names.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

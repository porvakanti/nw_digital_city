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

    try:
        available = providers.gemini_models(key)
    except Exception as exc:  # noqa: BLE001 - the message matters more than the class
        print(f"Could not list models: {type(exc).__name__}: {exc}")
        return 1

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

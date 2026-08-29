"""The pre-stage check for the agent.

Runs the questions people are likely to ask against whichever provider is
configured, and reports what each one decided. Use it against the mock while
building, and against the real endpoint before the all-hands.

    NW_PROVIDER=mock   python3 -m app.eval
    NW_PROVIDER=gemini NW_API_KEY=... python3 -m app.eval
"""

from __future__ import annotations

import json
import os
import pathlib
import sys

from . import plan as planning
from . import providers

CITY = pathlib.Path(__file__).resolve().parent.parent / "data" / "city.json"

# question, expected intent, expected target ("" means anywhere is acceptable)
CASES: list[tuple[str, str, str]] = [
    ("A221", "focus", "A221"),
    ("show me A311", "focus", "A311"),
    ("batteries", "focus", "D504"),
    ("field maintenance", "focus", "A311"),
    ("Spring 2/R", "focus", "A221"),
    ("how is Energy doing", "district", "Energy"),
    ("tell me about Software and Core", "district", "Software and Core"),
    ("what is happening in Leased Lines", "district", "Leased Lines"),
    ("packet switching", "focus", ""),
    ("Germany", "focus", "Germany"),
    ("how are we doing in Turkey", "focus", "Turkey"),
    ("where are the biggest gaps", "gaps", ""),
    ("show me the empty lots", "gaps", ""),
    ("which categories have no blueprint", "gaps", ""),
    ("what could we build", "could_be", ""),
    ("show me the potential", "could_be", ""),
    ("what is the upside here", "could_be", ""),
    ("show me AI readiness", "night", ""),
    ("which categories are AI ready", "night", ""),
    ("turn the lights off", "night", ""),
    ("how many blueprints do we have", "summary", ""),
    ("give me an overview of Energy", "summary", "Energy"),
    ("what is the worst category in Software and Core", "rank", "Software and Core"),
    ("which category leads on spend", "rank", ""),
    ("biggest category by value", "rank", ""),
    ("back to the whole city", "reset", ""),
    ("zoom out", "reset", ""),
    ("banana bread", "unknown", ""),
    ("what is the weather", "unknown", ""),
]


def vocabulary_from_city() -> dict[str, list[str]]:
    city = json.loads(CITY.read_text(encoding="utf-8"))
    return {
        "categories": [f"{c['code']} {c['name']}" for c in city["categories"]],
        "districts": sorted({c["district"] for c in city["categories"]}),
        "plots": sorted({c["plot"] for c in city["categories"]}),
        "markets": city["meta"]["markets"],
    }


def main() -> int:
    names = vocabulary_from_city()
    system = planning.SYSTEM_PROMPT + "\n\n" + planning.vocabulary(names)
    provider = os.environ.get("NW_PROVIDER", "mock")
    print(f"provider: {provider}   cases: {len(CASES)}\n")

    passed = 0
    for question, want_intent, want_target in CASES:
        try:
            raw, source = providers.complete(system, question, names)
            got = planning.parse(raw, names, source)
        except Exception as exc:  # noqa: BLE001 - report, do not stop the run
            print(f"  ERROR  {question!r}: {type(exc).__name__}: {exc}")
            continue

        intent_ok = got.intent == want_intent
        target_ok = not want_target or got.value == want_target
        ok = intent_ok and target_ok
        passed += ok
        mark = "  ok  " if ok else "FAIL  "
        detail = f"{got.intent}"
        if got.value:
            detail += f" -> {got.value}"
        if not ok:
            detail += f"   (wanted {want_intent}" + (f" -> {want_target}" if want_target else "") + ")"
        print(f"{mark}{question:44s} {detail}")

    print(f"\n{passed}/{len(CASES)} as expected")
    return 0 if passed == len(CASES) else 1


if __name__ == "__main__":
    sys.exit(main())

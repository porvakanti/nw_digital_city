"""The pre-stage check for the agent.

Runs the questions people are likely to ask against whichever provider is
configured, and reports what each one decided.

    run.cmd eval          six questions, one per intent
    run.cmd eval all      all 32

Six by default because of arithmetic, not caution. A free Gemini key allows
about 5 requests a minute and 20 a day; 32 questions cannot finish inside that
however patiently they are paced. The sample covers every intent the agent can
choose, which is what the check is actually for. Against the mock, or Vertex,
or a key with billing on it, run `all`.
"""

from __future__ import annotations

import json
import os
import pathlib
import sys
import time

from . import env
from . import plan as planning
from . import providers

env.load()

CITY = pathlib.Path(__file__).resolve().parent.parent / "data" / "city.json"

# question, expected intent, expected target
#
# The target column reads three ways. A name means it has to land exactly
# there. "" means any target is acceptable, including none. "-" means it must
# carry no target at all, which is the check that catches "what could we
# build" answered for Germany: right intent, and a number about one market
# over a picture of the whole city.
#
# An intent may list alternatives separated by "|" where two are genuinely
# both right. "How is Energy doing" is the case in point: `district` flies
# there and summarises, `summary` flies there and summarises with one more
# figure. Marking one of those wrong tests my preference, not the agent.
NOWHERE = "-"
CASES: list[tuple[str, str, str]] = [
    ("A221", "focus", "A221"),
    ("show me A311", "focus", "A311"),
    ("batteries", "focus", "D504"),
    ("field maintenance", "focus", "A311"),
    ("Spring 2/R", "focus", "A221"),
    ("how is Energy doing", "district|summary", "Energy"),
    ("tell me about Software and Core", "district|summary", "Software and Core"),
    ("what is happening in Leased Lines", "district|summary", "Leased Lines"),
    ("packet switching", "focus", ""),
    ("Germany", "focus", "Germany"),
    ("how are we doing in Turkey", "focus", "Turkey"),
    ("where are the biggest gaps", "gaps", ""),
    ("show me the empty lots", "gaps", ""),
    ("which categories have no blueprint", "gaps", ""),
    ("what could we build", "could_be", NOWHERE),
    ("show me the potential", "could_be", NOWHERE),
    ("what is the upside here", "could_be", NOWHERE),
    ("show me AI readiness", "night", NOWHERE),
    ("which categories are AI ready", "night", NOWHERE),
    ("turn the lights off", "night", NOWHERE),
    ("how many blueprints do we have", "summary", ""),
    ("give me an overview of Energy", "summary|district", "Energy"),
    ("what is the worst category in Software and Core", "rank", "Software and Core"),
    ("which category leads on spend", "rank", ""),
    ("biggest category by value", "rank", ""),
    ("what are we asking people to do", "asks", NOWHERE),
    ("what should we do next", "asks", NOWHERE),
    ("show me the takeaways", "asks", NOWHERE),
    ("back to the whole city", "reset", NOWHERE),
    ("zoom out", "reset", NOWHERE),
    ("banana bread", "unknown", NOWHERE),
    ("what is the weather", "unknown", NOWHERE),
]


# One per intent, plus the two ways a category is named. Enough to catch a
# model that has started routing questions somewhere silly, which is the only
# thing this check exists to catch.
SAMPLE = (
    "batteries",
    "how is Energy doing",
    "where are the biggest gaps",
    "what could we build",
    "show me AI readiness",
    "banana bread",
)


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
    provider = os.environ.get("NW_PROVIDER", "mock").strip().lower()

    everything = "all" in sys.argv[1:]
    cases = CASES if everything else [c for c in CASES if c[0] in SAMPLE]

    # Requests a minute. A free Gemini key allows five, and going over is how
    # a run turns into a wall of 429s. The mock has no such problem.
    rpm = float(os.environ.get("NW_RPM", "0" if provider == "mock" else "5"))
    gap = 60.0 / rpm if rpm > 0 else 0.0

    print(f"provider: {provider}   cases: {len(cases)}"
          + (f"   paced at {rpm:.0f}/min" if gap else "")
          + ("" if everything else "   (sample; `eval all` for all 32)") + "\n")

    passed = 0
    errors = 0
    advice = ""
    last = 0.0
    # Which model actually answered each question. With a ladder underneath,
    # "provider: gemini" is no longer the whole story: a run can start on one
    # model and finish on another, and a result you cannot attribute to a
    # model is not much of a result.
    answered: dict[str, int] = {}
    for question, want_intent, want_target in cases:
        wait = gap - (time.monotonic() - last)
        if last and wait > 0:
            time.sleep(wait)
        last = time.monotonic()
        try:
            raw, source = providers.complete(system, question, names)
            got = planning.parse(raw, names, source, question)
        except Exception as exc:  # noqa: BLE001 - report, do not stop the run
            # One line per case. The full explanation is printed once at the
            # end: the same twenty-line message three times over is how you
            # hide the one line that says which question failed.
            first = str(exc).strip().splitlines()[0] if str(exc).strip() else ""
            print(f"  ERROR  {question:44s} {type(exc).__name__}: {first}")
            advice = str(exc)
            errors += 1
            # Three of these in a row is the endpoint, not the questions.
            # Printing the same failure thirty-two times buries the one line
            # that says what to do about it.
            if errors == 3:
                print("\n  Three in a row, so this is the provider rather than")
                print("  the questions. Stopping here.\n")
                if "\n" in advice:
                    print(advice)
                else:
                    print("  Run `run.cmd models`. It makes one small request and")
                    print("  says which of these it is: over the rate limit,")
                    print("  unable to reach Google, a key that is refused, or a")
                    print("  model name that no longer exists.")
                return 1
            continue

        answered[got.source] = answered.get(got.source, 0) + 1
        intent_ok = got.intent in want_intent.split("|")
        if want_target == NOWHERE:
            target_ok = not got.value
        else:
            target_ok = not want_target or got.value == want_target
        ok = intent_ok and target_ok
        passed += ok
        mark = "  ok  " if ok else "FAIL  "
        detail = f"{got.intent}"
        if got.value:
            detail += f" -> {got.value}"
        if not ok:
            wanted = want_intent.replace("|", " or ")
            where = ""
            if want_target == NOWHERE:
                where = " with no target"
            elif want_target:
                where = f" -> {want_target}"
            detail += f"   (wanted {wanted}{where})"
        print(f"{mark}{question:44s} {detail}")
        # A plan that arrived and was then cut down says so in its notes.
        # Without this, "focus" with no target looks like the model failing
        # when it is the validation refusing what the model actually said.
        if not ok:
            for note in got.notes:
                print(f"        {note}")

    print(f"\n{passed}/{len(cases)} as expected")
    if answered:
        by = ", ".join(f"{name} ({count})" for name, count in sorted(answered.items()))
        print(f"answered by: {by}")
    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    sys.exit(main())

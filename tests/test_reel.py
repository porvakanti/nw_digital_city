"""The reel's narration and timeline, checked against the data.

The picture reads every figure it shows from city.json when it renders, so a
refreshed extract moves them. The narration cannot: it is spoken, and a
synthesised voice saying last quarter's number over this quarter's picture is
the failure nobody would catch without sitting through it. So each figure the
narration speaks is listed here with where it comes from, and checked.

Nothing here renders, synthesises or encodes anything.
"""

from __future__ import annotations

import json
import pathlib
import re
import unittest

REPO = pathlib.Path(__file__).resolve().parent.parent
REEL = REPO / "film" / "reel"


def words(n: int) -> str:
    """An integer below a thousand as the narration writes it."""
    ones = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
            "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
            "seventeen", "eighteen", "nineteen"]
    tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
    if n < 20:
        return ones[n]
    if n < 100:
        return tens[n // 10] + ("" if n % 10 == 0 else "-" + ones[n % 10])
    rest = n % 100
    head = ones[n // 100] + " hundred"
    return head if rest == 0 else f"{head} and {words(rest)}"


class TestReel(unittest.TestCase):
    maxDiff = None

    @classmethod
    def setUpClass(cls):
        cls.cues = json.loads((REEL / "cues.json").read_text(encoding="utf-8"))
        cls.city = json.loads((REPO / "data" / "city.json").read_text(encoding="utf-8"))
        cls.said = " ".join(line["text"] for line in cls.cues["lines"]).lower()
        cls.director = (REEL / "director.js").read_text(encoding="utf-8")

    # ------------------------------------------------------------- figures

    def spoken(self, n: int, phrase: str):
        text = phrase.format(words(n))
        self.assertIn(text.lower(), self.said,
                      f"the narration should say {text!r}; city.json now gives {n}")

    def test_the_estate_is_the_size_the_narration_says(self):
        self.spoken(self.city["totals"]["categories"], "{} categories")

    def test_the_spend_is_the_spend(self):
        self.spoken(round(self.city["totals"]["spend_eur"] / 1e6), "{} million euros of spend")

    def test_blueprints_written_and_used(self):
        self.spoken(self.city["totals"]["active"], "written {} blueprints")
        used = self.city["totals"]["in_use"]
        self.assertIn(f"{words(used)}. only {words(used)} have ever been used", self.said)

    def test_the_biggest_gap(self):
        bare = sorted((c for c in self.city["categories"]
                       if c["blueprint_state"] == "none" and (c["metrics"]["spend_eur"] or 0) > 0),
                      key=lambda c: -c["metrics"]["spend_eur"])
        top = bare[0]
        self.assertIn(top["name"].lower(), self.said)
        self.spoken(round(top["metrics"]["spend_eur"] / 1e6), "{} million euros of spend, and no blueprint")
        self.spoken(len(bare), "{} categories like it")
        total = round(sum(c["metrics"]["spend_eur"] for c in bare) / 1e6)
        # "a hundred and seventy-six", not "one hundred and ...", in speech.
        self.assertIn(words(total).replace("one hundred", "a hundred") + " million", self.said)

    def test_the_score(self):
        self.spoken(round(self.city["totals"]["journey"]["total"]), "scores {} out of a hundred")

    # ------------------------------------------------------------- timeline

    def test_the_narration_is_in_order_and_inside_the_reel(self):
        at = [line["at"] for line in self.cues["lines"]]
        self.assertEqual(at, sorted(at))
        self.assertGreaterEqual(at[0], 0)
        self.assertLess(at[-1], self.cues["length"] - 3)

    def test_the_marks_are_in_order_and_inside_the_reel(self):
        order = ["reveal", "title", "grammar", "tower", "hotel", "roof", "written", "lightsOff",
                 "four", "gap", "gapWide", "agent", "agentOut", "potential", "potentialOn",
                 "score", "lift", "ask1", "ask2", "ask3", "ask4", "finale", "end"]
        marks = self.cues["marks"]
        self.assertEqual(sorted(marks), sorted(order))
        values = [marks[k] for k in order]
        self.assertEqual(values, sorted(values))
        self.assertLess(values[-1], self.cues["length"])

    def test_every_lot_the_director_names_exists(self):
        codes = {c["code"] for c in self.city["categories"]}
        named = set(re.findall(r"'([A-Z]\d{3})'", self.director))
        self.assertTrue(named)
        self.assertEqual(named - codes, set(), "director.js names a lot city.json no longer has")


if __name__ == "__main__":
    unittest.main()

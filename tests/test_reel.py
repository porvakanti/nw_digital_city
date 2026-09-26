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
        self.spoken(self.city["totals"]["categories"], "{} of them")

    def test_the_spend_is_the_spend(self):
        self.spoken(round(self.city["totals"]["spend_eur"] / 1e6), "{} million euros of spend")

    def test_blueprints_written_and_used(self):
        self.spoken(self.city["totals"]["active"], "written {} blueprints")
        used = self.city["totals"]["in_use"]
        self.assertIn(f"{words(used)}. only {words(used)} have ever been used", self.said)

    def test_the_score(self):
        self.spoken(round(self.city["totals"]["journey"]["total"]), "scores {} out of a hundred")

    def test_the_one_category_at_the_top_is_the_one_named(self):
        ranked = sorted(self.city["categories"], key=lambda c: -c["journey"]["total"])
        top, second = ranked[0], ranked[1]
        self.assertEqual(top["journey"]["total"], 100)
        self.assertLess(second["journey"]["total"], 100, "the narration says only one has made the whole climb")
        self.assertIn(top["name"].lower(), self.said)

    def test_the_agent_is_called_what_the_city_calls_it(self):
        config = (REPO / "config" / "metrics.yaml").read_text(encoding="utf-8")
        name = re.search(r"agent_name:\s*(\w+)", config).group(1)
        self.assertIn(f"ask {name.lower()}", self.said)

    # ------------------------------------------------------------- the climb

    def test_each_lot_on_the_climb_stands_on_its_rung(self):
        """One lot per rung, in order, as the narration describes them."""
        codes = re.search(r"const CLIMB = \[([^\]]+)\]", self.director).group(1)
        codes = re.findall(r"'([A-Z]\d{3})'", codes)
        by_code = {c["code"]: c for c in self.city["categories"]}
        empty, draft, live, used = (by_code[c]["journey"] for c in codes)
        self.assertEqual(empty["total"], 0, "the climb starts on empty ground")
        self.assertEqual((draft["blueprint"], draft["usage"], draft["ai"]), (10, 0, 0), "then a draft")
        self.assertEqual((live["blueprint"], live["usage"], live["ai"]), (40, 0, 0), "then live across markets")
        self.assertGreater(used["usage"], 0, "then in use")
        self.assertGreater(used["ai"], 0, "and with AI")
        totals = [by_code[c]["journey"]["total"] for c in codes]
        self.assertEqual(totals, sorted(totals))
        # Side by side on one row, so one camera move passes them in order.
        self.assertEqual(len({by_code[c]["plot"] for c in codes}), 1)

    # ------------------------------------------------------------- timeline

    def test_the_narration_is_in_order_and_inside_the_reel(self):
        at = [line["at"] for line in self.cues["lines"]]
        self.assertEqual(at, sorted(at))
        self.assertGreaterEqual(at[0], 0)
        self.assertLess(at[-1], self.cues["length"] - 3)

    def test_the_marks_are_in_order_and_inside_the_reel(self):
        order = ["reveal", "title", "climb", "stop0", "stop1", "stop2", "stop3", "stop4", "hero",
                 "challenge", "lightsOff", "four", "score", "agent", "agentOut", "potential",
                 "potentialOn", "lift", "cta1", "cta2", "cta3", "finale", "end"]
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

"""Every figure the documentation quotes, checked against the data.

The documents are read by people who then say these numbers out loud, so a
stale figure in one of them is worse than a stale figure in the code: nothing
breaks, the error is not surfaced, and the figure is repeated.

This module holds the check that catches that. Each assertion builds the exact
string the document has to contain out of `city.json`, so a refreshed extract
fails here and the failure names the document and the line to change. Six
figures across two documents were wrong when it was written, left over from
before the category manager cells were parsed properly.

Rounding is deliberately the browser's. `Math.round(6.5)` is 7 and Python's
`round(6.5)` is 6, and the documents quote what the panel shows.
"""

from __future__ import annotations

import json
import math
import pathlib
import statistics
import unittest

import yaml

REPO = pathlib.Path(__file__).resolve().parent.parent
DOCS = REPO / "docs"


def shown(value: float) -> int:
    """Round the way the browser does, because that is what a reader saw."""
    return math.floor(value + 0.5)


def load(name: str) -> str:
    return (DOCS / name).read_text(encoding="utf-8")


def flat(text: str) -> str:
    """One space for any run of whitespace.

    Prose in these documents is wrapped at 79 columns, so a sentence quoting
    eight category codes is split across two lines and a literal match would
    fail on the newline rather than on the figures. Collapsing whitespace
    compares what the sentence says instead of how it happens to be wrapped.
    """
    return " ".join(text.split())


class DocumentFigures(unittest.TestCase):
    """Assert a document contains a string assembled from the data."""

    maxDiff = None

    @classmethod
    def setUpClass(cls):
        cls.city = json.loads((REPO / "data" / "city.json").read_text(encoding="utf-8"))
        cls.config = yaml.safe_load((REPO / "config" / "metrics.yaml").read_text(encoding="utf-8"))
        cls.cats = cls.city["categories"]

    def quotes(self, doc: str, text: str, why: str = ""):
        if flat(text) in flat(load(doc)):
            return
        self.fail(
            f"docs/{doc} no longer says what the data says.\n"
            f"  it must contain: {text!r}\n"
            + (f"  {why}\n" if why else "")
            + "  Update the document, or the data changed and the document is now wrong."
        )


class TestTheHeadlineFigures(DocumentFigures):
    def test_the_counts_every_document_opens_with(self):
        t = self.city["totals"]
        c = self.city["meta"]["counts"]
        for doc in ("READING-THE-CITY.md", "TESTING.md"):
            self.quotes(doc, f"{c['categories']} categories")
        self.quotes("TESTING.md", f"{t['with_blueprint']} developed / {t['empty_lots']} empty lots")
        self.quotes("DEMO.md", f"{t['with_blueprint']} developed, {t['empty_lots']} empty lots")

    def test_the_figure_the_whole_thing_is_for(self):
        """Blueprints written against blueprints ever used."""
        t = self.city["totals"]
        self.quotes(
            "READING-THE-CITY.md",
            f"**We have written {t['active']} blueprints. Four of them have ever been used.**",
            "the sharpest line in the project",
        )
        self.quotes("TESTING.md", f"reads **{t['in_use']}** blueprints in use")

    def test_the_journey_score_and_its_split(self):
        j = self.city["totals"]["journey"]
        total = shown(j["total"])
        self.quotes("JOURNEY-SCORE.md", f"**Networks scores {total} out of 100.**")
        self.quotes("READING-THE-CITY.md", f"Networks scores **{total} out of 100**")
        # The three components, as percentages of what each is worth.
        weights = self.config["score"]["weights"]
        written = shown(j["blueprint"] / weights["blueprint"] * 100)
        used = shown(j["usage"] / weights["usage"] * 100)
        self.quotes(
            "JOURNEY-SCORE.md",
            f"> We are {written}% of the way through writing the blueprints and {used}% of the way",
        )

    def test_how_much_money_is_on_the_map(self):
        spend = self.city["totals"]["spend_eur"]
        for doc in ("READING-THE-CITY.md", "TESTING.md", "DEMO.md"):
            self.quotes(doc, f"€{shown(spend / 1e6)}m")

    def test_the_ai_column_is_quoted_as_measured(self):
        t = self.city["totals"]
        lit = sorted(c["code"] for c in self.cats if c["metrics"]["ai_rfps"] > 0)
        self.quotes("READING-THE-CITY.md", f"**{t['ai_started']} of 145 rooftops are lit**")
        self.quotes("TESTING.md", f"Eight, and only eight: {', '.join(lit)}")


class TestTheDistrictTables(DocumentFigures):
    """Two documents tabulate all eight districts. Neither may drift."""

    def test_reading_the_city_tabulates_lots_built_and_spend(self):
        for d in self.city["districts"]:
            t = d["totals"]
            self.quotes(
                "READING-THE-CITY.md",
                f"| {d['name']} | {t['categories']} | {t['with_blueprint']} | "
                f"€{shown(t['spend_eur'] / 1e6)}m |",
            )

    def test_the_journey_score_tabulates_all_four_components(self):
        """Including the component columns.

        Fixed sits on 6.5 for usage, which the panel shows as 7 and Python
        would round to 6. A check using Python's rounding would have demanded
        the document print a figure the screen never shows.
        """
        for d in self.city["districts"]:
            t = d["totals"]
            j = t["journey"]
            self.quotes(
                "JOURNEY-SCORE.md",
                f"| {d['name']} | {shown(j['total'])} | {shown(j['blueprint'])} | "
                f"{shown(j['usage'])} | {shown(j['ai'])} | "
                f"{t['empty_lots']} of {t['categories']} |",
            )

    def test_the_tables_are_ordered_the_way_they_claim(self):
        body = flat(load("JOURNEY-SCORE.md"))
        order = [d["name"] for d in
                 sorted(self.city["districts"],
                        key=lambda d: -d["totals"]["journey"]["total"])]
        seen = sorted(order, key=lambda name: body.index(f"| {name} | "))
        self.assertEqual(order, seen, "the district table is no longer highest first")


class TestThePeopleFigures(DocumentFigures):
    """The leaderboard numbers, which were the stale ones.

    They were written when the manager column was read as one person per
    category. Eight of the cells hold several people each with market
    annotations, so parsing them properly moved 35 people to 38 and 23
    qualifiers to 30, and the document kept the old pair.
    """

    def board(self):
        floor = self.config["score"]["minimum_categories"]
        held: dict[str, list] = {}
        for category in self.cats:
            for person in category.get("owners", []):
                held.setdefault(person, []).append(category)
        weight = lambda c: math.sqrt(max(c["metrics"]["spend_eur"], 1e6))  # noqa: E731

        def roll(members):
            total = sum(weight(c) for c in members) or 1
            return {k: sum(c["journey"][k] * weight(c) for c in members) / total
                    for k in ("total", "blueprint", "usage", "ai")}

        qualifying = [(len(m), roll(m)) for m in held.values() if len(m) >= floor]
        qualifying.sort(key=lambda row: -row[1]["total"])
        return held, qualifying, floor

    def test_how_many_people_there_are_and_how_many_qualify(self):
        held, qualifying, floor = self.board()
        median = shown(statistics.median([r[1]["total"] for r in qualifying]))
        top = shown(qualifying[0][1]["total"])
        self.quotes(
            "JOURNEY-SCORE.md",
            f"{len(qualifying)} of {len(held)} qualify at a three-category minimum. "
            f"Median {median}, top {top}.",
        )
        self.quotes("TESTING.md", f"{len(qualifying)} rows out of {len(held)} people")
        self.assertEqual(3, floor, "the documents all say three categories")

    def test_the_minimum_actually_withholds_somebody(self):
        held, qualifying, _ = self.board()
        self.assertLess(len(qualifying), len(held),
                        "a floor that excludes nobody is not a floor")

    def test_the_ranks_the_document_quotes(self):
        _, qualifying, _ = self.board()
        for rank in (1, 2, 3, 6, 9):
            count, j = qualifying[rank - 1]
            label = {1: "1st", 2: "2nd", 3: "3rd"}.get(rank, f"{rank}th")
            self.quotes(
                "JOURNEY-SCORE.md",
                f"| {label} | {count} | {shown(j['total'])} | {shown(j['blueprint'])} | "
                f"{shown(j['usage'])} | {shown(j['ai'])} |",
            )

    def test_how_many_qualifying_people_score_nothing(self):
        _, qualifying, _ = self.board()
        zero = sum(1 for _, j in qualifying if shown(j["total"]) == 0)
        words = {6: "Six", 7: "Seven", 8: "Eight", 9: "Nine", 5: "Five"}[zero]
        self.quotes(
            "JOURNEY-SCORE.md",
            f"**{words} of the {len(qualifying)} qualifying managers score zero**",
            "this is the sentence that decides whether the board can go public",
        )


class TestWhatYouActuallySee(DocumentFigures):
    """Counts describing the screen, which are not the same as counts in the
    data. A building stands wherever the blueprint reached a market, so the
    number of drained buildings is not the number of live blueprints."""

    def test_the_number_of_drained_buildings(self):
        standing = [c for c in self.cats if c["metrics"]["market_reach"] > 0]
        dark = sum(1 for c in standing if c["metrics"]["cbp_used"] == 0)
        self.quotes(
            "READING-THE-CITY.md",
            f"| Drained towards grey, dark windows | Built, and nobody has used it | {dark} |",
            "every building that is standing and unused, not every live blueprint",
        )

    def test_the_three_ground_states(self):
        t = self.city["totals"]
        for label, count in (("No blueprint", t["empty_lots"]),
                             ("Drafted", t["draft_only"]),
                             ("Active", t["active"])):
            self.quotes("READING-THE-CITY.md", f"| {label} | {count} |",
                        f"the ground table must say {count} for {label}")

    def test_the_hotels_are_listed_in_full(self):
        threshold = 50e6
        hotels = [c for c in self.cats if c["metrics"]["spend_eur"] > threshold]
        self.quotes("READING-THE-CITY.md", f"Six categories have a hotel")
        self.assertEqual(6, len(hotels))
        body = flat(load("READING-THE-CITY.md"))
        for hotel in hotels:
            self.assertIn(hotel["code"], body,
                          f"{hotel['code']} is a hotel and is not named")

    def test_the_tallest_building(self):
        """Named by the measure height actually encodes.

        This asserted the category with the most markets, which stopped being
        the tallest building when height moved to the composite score. A221
        is still the most-adopted blueprint and is now a five-floor block.
        """
        tallest = max(self.cats, key=lambda c: c["journey"]["total"])
        self.quotes("TESTING.md",
                    f"**{tallest['code']}**, the tallest thing in the city at "
                    f"{shown(tallest['journey']['total'])} out of 100")
        widest = max(self.cats, key=lambda c: c["metrics"]["market_reach"])
        self.quotes("READING-THE-CITY.md",
                    f"{widest['code']} is live in {widest['metrics']['market_reach']} markets")

    def test_the_landmark_table(self):
        """Every monument, its category and the market it came from.

        The threshold moved from blueprint reach to the composite score, which
        changed which categories hold a monument and which market each one
        draws from. The table is rebuilt from the data so it cannot describe
        the previous rule.
        """
        marked = [c for c in self.cats if c.get("landmark")]
        floor = self.config["landmarks"]["min_score"]
        self.quotes("TESTING.md",
                    f"{len(marked)} monuments, one per category scoring {floor} or more")
        for c in marked:
            self.quotes(
                "TESTING.md",
                f"| {c['code']} | {c['name']} | {c['landmark']['name']} | "
                f"{c['landmark']['market']}, score {shown(c['journey']['total'])} |",
            )


class TestTheDiagrams(DocumentFigures):
    """The diagrams are committed as images, not as diagram code.

    VS Code does not render mermaid in markdown preview without an extension,
    so a repository whose architecture is drawn in fenced mermaid shows a
    reader raw code. Committed SVG renders in VS Code, on GitHub, and in
    anything else that can show an image.
    """

    def test_no_diagram_needs_a_renderer_to_be_installed(self):
        # assertTrue rather than assertNotIn: the built-in message for a
        # missing substring prints the whole haystack, and a haystack here is
        # a 300-line document.
        for doc in sorted(DOCS.glob("*.md")):
            self.assertTrue(
                "```mermaid" not in doc.read_text(encoding="utf-8"),
                f"docs/{doc.name} draws a diagram in mermaid, which VS Code "
                "shows as raw code. Commit it to docs/diagrams as SVG instead.",
            )

    def test_every_referenced_diagram_exists(self):
        import re
        for doc in sorted(DOCS.glob("*.md")):
            body = doc.read_text(encoding="utf-8")
            for target in re.findall(r"!\[[^\]]*\]\(([^)]+)\)", body):
                if target.startswith(("http://", "https://")):
                    continue
                self.assertTrue(
                    (doc.parent / target).is_file(),
                    f"docs/{doc.name} shows {target}, which is not there",
                )

    def test_every_internal_link_resolves(self):
        """A reference to a document that was moved or renamed is a dead end."""
        import re
        for doc in sorted(DOCS.glob("*.md")) + [REPO / "README.md"]:
            body = doc.read_text(encoding="utf-8")
            for target in re.findall(r"(?<!!)\[[^\]]+\]\(([^)#]+)[^)]*\)", body):
                if target.startswith(("http://", "https://", "mailto:")):
                    continue
                self.assertTrue(
                    (doc.parent / target).exists(),
                    f"{doc.name} links to {target}, which is not there",
                )

    def test_every_committed_diagram_is_shown_somewhere(self):
        shown = " ".join(d.read_text(encoding="utf-8") for d in DOCS.glob("*.md"))
        for svg in sorted((DOCS / "diagrams").glob("*.svg")):
            self.assertIn(
                f"diagrams/{svg.name}", shown,
                f"{svg.name} is committed and never shown, so nobody will see it",
            )

    def test_the_diagrams_are_self_contained(self):
        """No external fetch, no script, nothing a viewer has to allow.

        GitHub and VS Code both render these inside an image element, which
        fetches nothing and runs nothing, so anything reaching outward is
        silently missing rather than broken. The namespace declaration is the
        one URL allowed, and is what makes the file render at all.
        """
        # Fetch-shaped rather than "any http", or the required
        # xmlns="http://www.w3.org/2000/svg" would fail its own file.
        forbidden = ("<script", "<image", "<foreignObject", "<use ",
                     'href="http', "url(http", "url(&#34;http", "@import")
        for svg in sorted((DOCS / "diagrams").glob("*.svg")):
            body = svg.read_text(encoding="utf-8")
            found = [token for token in forbidden if token in body]
            self.assertEqual([], found, f"{svg.name} reaches outward: {found}")
            self.assertTrue('xmlns="http://www.w3.org/2000/svg"' in body,
                            f"{svg.name} has no namespace, so it will not render")


class TestTheBiggestPlaceInTheCity(DocumentFigures):
    def test_the_largest_plot_is_named_with_its_spend(self):
        codes = {c["code"]: c for c in self.cats}
        plots = []
        for d in self.city["districts"]:
            for p in d["plots"]:
                plots.append((p["name"], sum(codes[k]["metrics"]["spend_eur"] for k in p["codes"])))
        name, spend = max(plots, key=lambda row: row[1])
        for doc in ("READING-THE-CITY.md", "TESTING.md"):
            self.quotes(doc, f"{name}", "the largest plot must be named")
            self.quotes(doc, f"€{shown(spend / 1e6)}m")


if __name__ == "__main__":
    unittest.main()

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


class TestTheWalkthroughScript(DocumentFigures):
    """The figures in PRESENTING.md, which are read out loud verbatim.

    A stale figure anywhere is bad. A stale figure in a line written to be
    spoken is worse, because it is said with confidence and nothing on screen
    contradicts it until somebody checks. Every number the script quotes is
    rebuilt here from the data.

    Several of the spoken lines spell a count as a word, because a sentence
    that opens on a digit reads badly. WORDS maps the derived count back to
    the word the script has to use, so the check still fails when the data
    moves rather than only when a digit does.
    """

    WORDS = {4: "Four", 5: "Five", 6: "Six", 8: "Eight", 12: "Twelve",
             16: "Sixteen", 20: "Twenty", 37: "Thirty seven",
             44: "Forty four", 52: "Fifty two", 56: "Fifty six",
             89: "Eighty nine"}

    DOC = "PRESENTING.md"

    def spoken(self) -> str:
        """The script with its blockquote markers dropped.

        The lines written to be said out loud are blockquoted and wrapped at
        79 columns, so a sentence that runs over a line carries a `>` in the
        middle of it. Comparing what the sentence says means removing the
        marker before collapsing the whitespace.
        """
        import re
        body = load(self.DOC).splitlines()
        return flat("\n".join(re.sub(r"^\s*>\s?", "", line) for line in body))

    def says(self, text: str, why: str = ""):
        if flat(text) in self.spoken():
            return
        self.fail(
            f"docs/{self.DOC} no longer says what the data says.\n"
            f"  it must contain: {text!r}\n"
            + (f"  {why}\n" if why else "")
            + "  Update the document, or the data changed and the document is now wrong."
        )

    def word(self, count: int) -> str:
        self.assertIn(count, self.WORDS,
                      f"{count} has no spelling in WORDS, so the script cannot "
                      "state it as a word. Add it, and say it in the script.")
        return self.WORDS[count]

    def test_the_counters_the_opening_beat_points_at(self):
        t = self.city["totals"]
        c = self.city["meta"]["counts"]
        self.says(
            f"Top left: {t['with_blueprint']} developed, {t['empty_lots']} "
            f"empty lots, {c['markets']} markets, "
            f"€{shown(t['spend_eur'] / 1e6)}m.",
            "the first figures said out loud, and the ones on screen beside them",
        )
        self.says(f"And {c['categories']} lots, one")
        self.assertEqual(8, c["districts"], "the opening line says eight districts")
        self.assertEqual(31, c["plots"], "the opening line says thirty one plots")

    def test_the_split_between_built_and_bare(self):
        t = self.city["totals"]
        c = self.city["meta"]["counts"]
        self.says(
            f"{self.word(t['with_blueprint'])} of those {c['categories']} lots "
            f"have a blueprint. {self.word(t['empty_lots'])} are bare ground."
        )
        self.says(
            f"{self.word(t['with_blueprint'])} lots have a blueprint record, "
            f"{t['active']} of them active, {t['draft_only']} draft only. "
            f"The {t['empty_lots']} are categories where"
        )

    def test_the_two_districts_the_script_singles_out(self):
        widest = max(self.city["districts"], key=lambda d: d["totals"]["categories"])
        self.says(f"{widest['name']} holds {widest['totals']['categories']} "
                  f"and is the largest.")
        richest = max(self.city["districts"], key=lambda d: d["totals"]["spend_eur"])
        share = shown(richest["totals"]["spend_eur"] / self.city["totals"]["spend_eur"] * 100)
        self.says(
            f"{richest['name']} has {richest['totals']['categories']} categories "
            f"and carries €{shown(richest['totals']['spend_eur'] / 1e6)}m of the "
            f"€{shown(self.city['totals']['spend_eur'] / 1e6)}m, which is {share}%",
            "the line held back for the question about district size",
        )
        rest = sorted((d["totals"]["spend_eur"] for d in self.city["districts"]
                       if d["name"] != richest["name"]), reverse=True)
        self.assertGreater(
            richest["totals"]["spend_eur"], sum(rest[:2]),
            f"the script says {richest['name']} carries more than the next two "
            "districts put together",
        )
        self.says("That is more than the next two districts put")

    def test_the_lot_the_script_reads_in_full(self):
        """The worked example at beat 3, and its position on the spend ladder."""
        batteries = next(c for c in self.cats if c["code"] == "D504")
        tiers = self.config["metrics"]["spend_eur"]["tiers"]
        pieces = next(t["pieces"] for t in tiers
                      if t["max"] is None or batteries["metrics"]["spend_eur"] <= t["max"])
        self.assertEqual(4, pieces, "the script reads four houses on D504")
        self.says(f"carries €{shown(batteries['metrics']['spend_eur'] / 1e6)}m, "
                  f"so four houses.")

    def test_the_spend_ladder_as_the_script_states_it(self):
        rungs = {t["id"]: t["max"] for t in self.config["metrics"]["spend_eur"]["tiers"]}
        self.says(
            f"One house up to €{shown(rungs['house_1'] / 1e6)}m, two to "
            f"€{shown(rungs['house_2'] / 1e6)}m, three to "
            f"€{shown(rungs['house_3'] / 1e6)}m, four to "
            f"€{shown(rungs['house_4'] / 1e6)}m, and above that a single hotel.",
            "the thresholds are configurable, so the spoken ladder must follow them",
        )

    def test_what_the_height_is_bound_to(self):
        """Height is the composite score, and the sentence saying so.

        It was blueprint reach once. The sentence calling it adoption outlived
        the change, in the script and in the guided tour, and the two of them
        said something the renderer had stopped doing.
        """
        import re
        self.assertEqual("journey_score", self.config["layers"]["height"]["metric"])
        w = self.config["score"]["weights"]
        self.says(
            f"The **height** is the journey score, which is the composite: "
            f"{w['blueprint']} points for the blueprint existing and spreading, "
            f"{w['usage']} for anybody using it, {w['ai']} for AI readiness."
        )
        tour = (REPO / "renderer" / "agent.js").read_text(encoding="utf-8")
        self.assertIn(
            f"The height is the journey score: {w['blueprint']} points for "
            f"writing the blueprint, {w['usage']} for anybody using it, "
            f"{w['ai']} for doing it with AI.",
            tour,
            "the guided tour must name the same weights the config holds",
        )
        stale = "how widely it has been adopted"
        for path in (sorted(DOCS.glob("*.md")) + [REPO / "README.md",
                     REPO / "renderer" / "agent.js", REPO / "renderer" / "city.js"]):
            self.assertNotIn(
                stale, path.read_text(encoding="utf-8"),
                f"{path.name} still describes the height as adoption",
            )

        # The floor count the script quotes, taken from the renderer's own
        # ladder rather than from memory.
        floors = [int(n) for n in re.search(
            r"const FLOORS = \[([^\]]+)\]",
            (REPO / "renderer" / "city.js").read_text(encoding="utf-8")).group(1).split(",")]
        batteries = next(c for c in self.cats if c["code"] == "D504")
        tiers = self.config["metrics"]["journey_score"]["tiers"]
        index = next(i for i, t in enumerate(tiers)
                     if t["max"] is None or batteries["journey"]["total"] <= t["max"])
        count = floors[min(index, len(floors) - 1)]
        self.says(f"Batteries is {self.word(count).lower()} floors on "
                  f"{shown(batteries['journey']['total'])} out of 100.")

    def test_the_hotel_on_bare_ground(self):
        threshold = self.config["metrics"]["spend_eur"]["tiers"][-2]["max"]
        hotels = [c for c in self.cats if c["metrics"]["spend_eur"] > threshold]
        bare = [c for c in hotels if c["blueprint_state"] == "none"]
        self.assertEqual(1, len(bare), "the script says the sixth hotel is the bare one")
        by_state = {state: sum(1 for c in hotels if c["blueprint_state"] == state)
                    for state in ("active", "draft", "none")}
        self.assertEqual({"active": 4, "draft": 1, "none": 1}, by_state,
                         "the script counts the six hotels by what they stand on")
        self.says(f"{self.word(len(hotels))} lots carry one. "
                  f"{self.word(by_state['active'])} of them stand on an active "
                  f"blueprint and one on a draft.")
        self.says(f"The sixth is {bare[0]['code']} {bare[0]['name']}: "
                  f"€{shown(bare[0]['metrics']['spend_eur'] / 1e6)}m, the largest "
                  f"single category in the")

    def test_the_unclaimed_spend_the_script_quotes_twice(self):
        loose = [c for c in self.cats
                 if c["blueprint_state"] == "none" and c["metrics"]["spend_eur"] > 0]
        total = shown(sum(c["metrics"]["spend_eur"] for c in loose) / 1e6)
        self.says(f"there are {len(loose)} lots in that shape holding €{total}m "
                  f"between them.")
        drafts = self.city["totals"]["draft_only"]
        self.says(f"{drafts} categories with a draft blueprint, and {len(loose)} with")
        self.says(f"{len(loose)} lots carrying €{total}m.")
        self.assertEqual(drafts + len(loose), 32,
                         "the script says 32 lots rise in potential mode")

    def test_the_monuments_as_the_script_describes_them(self):
        marked = [c for c in self.cats if c.get("landmark")]
        rules = self.config["landmarks"]
        self.says(f"{self.word(len(marked))} lots have one instead of a building.")
        self.says(f"threshold {rules['min_score']}, capped at ten so they")
        self.assertEqual(10, rules["max_landmarks"], "the script says capped at ten")
        best = max(marked, key=lambda c: c["journey"]["total"])
        self.says(f"{best['code']} {best['name']} scores "
                  f"{shown(best['journey']['total'])} and carries "
                  f"{best['landmark']['name']}.")

    def test_the_adoption_gap_which_is_the_sharpest_line(self):
        t = self.city["totals"]
        c = self.city["meta"]["counts"]
        standing = [k for k in self.cats if k["metrics"]["market_reach"] > 0]
        dark = sum(1 for k in standing if k["metrics"]["cbp_used"] == 0)
        self.says(f"{self.word(t['ai_started'])} categories out of "
                  f"{c['categories']} have had a request")
        self.says(f"{self.word(t['in_use'])} buildings in the whole city keep "
                  f"their lights on")
        self.says(f"{self.word(dark)} of the {len(standing)} built lots are "
                  f"drained to grey with the windows dark.")
        self.says(f"{self.word(t['with_blueprint'])} blueprints exist. "
                  f"{self.word(t['in_use'])} have been used.",
                  "the line the walkthrough is built to arrive at")
        self.says(f"{self.word(t['ai_started'])} columns of light, and "
                  f"{c['categories'] - t['ai_started']} dark roofs.")

    def test_every_used_category_also_holds_a_monument(self):
        """The script says so, and it is true only while the rungs hold.

        One sourcing event is worth 20 marks, which carries a category past
        the monument threshold on its own. If either figure moves, the claim
        stops being true and this fails rather than the claim going unnoticed.
        """
        used = [c for c in self.cats if c["metrics"]["cbp_used"] > 0]
        unmarked = [c["code"] for c in used if not c.get("landmark")]
        self.assertEqual([], unmarked,
                         "the script says all four in-use categories hold a monument")
        once = next(r["points"] for r in self.config["score"]["usage"]
                     if r["id"] == "once")
        self.says(f"All four hold a monument as well, because using a blueprint "
                  f"is worth {once} marks and carries a category past the "
                  f"monument threshold on its own.")

    def test_the_ceiling_on_a_blueprint_nobody_uses(self):
        """The figure the script quotes when the weightings are challenged."""
        w = self.config["score"]["weights"]
        self.says(f"used by nobody, tops out at {w['blueprint']} of 100.")
        self.assertEqual(3, len(w), "the script says three lines of weighting")

    def test_the_four_lots_that_are_named(self):
        used = [c for c in self.cats if c["metrics"]["cbp_used"] > 0]
        self.assertEqual(4, len(used))
        body = flat(load(self.DOC))
        for c in used:
            self.assertIn(c["code"], body, f"{c['code']} is in use and is not named")
            self.assertIn(c["name"].replace(" & ", " and "), body,
                          f"{c['code']} is named by code and not by name")

    def test_the_score_and_its_three_components(self):
        j = self.city["totals"]["journey"]
        w = self.config["score"]["weights"]
        self.says(f"{w['blueprint']} points for the blueprint existing and "
                  f"spreading, {w['usage']} for anybody using it, {w['ai']} for "
                  f"AI readiness. Networks scores {shown(j['total'])}")
        self.says(f"Look at where the {shown(j['total'])} comes from. "
                  f"{self.word(shown(j['blueprint']))} of the {w['blueprint']} "
                  f"coverage points, {round(j['usage'], 1)} of the {w['usage']} "
                  f"usage points, {round(j['ai'], 1)} of the {w['ai']} AI points.")

    def test_the_discrete_and_the_weighted_scores_the_script_contrasts(self):
        """Three categories on exact rungs, and a district that is on none."""
        ranked = sorted(self.cats, key=lambda c: -c["journey"]["total"])[:3]
        a, b, c = (shown(k["journey"]["total"]) for k in ranked)
        self.says(f"{ranked[0]['code']} scores {a}, {ranked[1]['code']} {b}, "
                  f"{ranked[2]['code']} {c}.")
        widest = max(self.city["districts"], key=lambda d: d["totals"]["categories"])
        reads = shown(widest["totals"]["journey"]["total"])
        self.says(f"{widest['name']} reads {reads},")
        self.assertNotIn(
            reads,
            [shown(k["journey"]["total"]) for k in self.cats
             if k["district"] == widest["name"]],
            f"the script says no category in {widest['name']} scores {reads}",
        )


class TestTheDeploymentDocuments(DocumentFigures):
    """What the deploy documents promise, against what the script does.

    These two are read by somebody standing up the service in an environment
    nobody here can see, so a stale default in them costs a round trip rather
    than a correction. Every value is read out of deploy/cloudrun.sh.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.script = (REPO / "deploy" / "cloudrun.sh").read_text(encoding="utf-8")

    def default(self, name: str) -> str:
        import re
        found = re.search(rf'^{name}="\$\{{{name}:-([^}}"]*)\}}"', self.script, re.M)
        self.assertIsNotNone(found, f"deploy/cloudrun.sh no longer defaults {name}")
        return found.group(1)

    def test_the_region_and_model_both_documents_quote(self):
        region, model = self.default("REGION"), self.default("MODEL")
        for doc in ("GCP-SETUP.md", "DEPLOY.md"):
            self.quotes(doc, region, "the default region the script deploys to")
            self.quotes(doc, model, "the default model the script deploys with")
        self.quotes("GCP-SETUP.md", f"REGION={region}")
        self.quotes("GCP-SETUP.md", f"MODEL={model}")

    def test_the_service_account_and_its_single_role(self):
        service = self.default("SERVICE")
        self.assertIn("--role roles/aiplatform.user", self.script)
        self.quotes("GCP-SETUP.md", f"{service}@PROJECT.iam.gserviceaccount.com")
        for doc in ("GCP-SETUP.md", "DEPLOY.md"):
            self.quotes(doc, "roles/aiplatform.user", "the one role the service holds")

    def test_the_provider_that_needs_no_key(self):
        provider = self.default("PROVIDER")
        self.assertEqual("vertex", provider)
        for doc in ("GCP-SETUP.md", "DEPLOY.md"):
            self.quotes(doc, f"NW_PROVIDER={provider}")
            self.quotes(doc, "No API key exists anywhere in the deployed")

    def test_the_apis_the_setup_document_lists(self):
        """The document turns them on by hand before the script does."""
        for api in ("run.googleapis.com", "cloudbuild.googleapis.com",
                    "artifactregistry.googleapis.com", "aiplatform.googleapis.com"):
            self.assertIn(api, self.script)
            self.quotes("GCP-SETUP.md", api)

    def test_the_scale_settings_the_cost_section_rests_on(self):
        for flag in ("--min-instances 0", "--max-instances 4"):
            self.assertIn(flag, self.script)
        self.quotes("DEPLOY.md", "`--min-instances 0 --max-instances 4`")
        self.quotes("GCP-SETUP.md", "Cloud Run at `--min-instances 0` costs nothing")

    def test_every_environment_variable_the_documents_name_is_read(self):
        """A setting documented and not read is a setting somebody will set."""
        code = " ".join(source.read_text(encoding="utf-8")
                        for source in sorted((REPO / "app").glob("*.py")))
        unread = [var for var in
                  ("NW_PROVIDER", "NW_MODEL", "NW_PROJECT", "NW_REGION",
                   "NW_API_KEY", "NW_FRAME_ANCESTORS")
                  if var not in code]
        # assertEqual on the list rather than assertIn on the source: the
        # built-in message for a missing substring prints the haystack, and
        # the haystack here is the whole app package.
        self.assertEqual([], unread, "documented in DEPLOY.md, read by nothing")


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

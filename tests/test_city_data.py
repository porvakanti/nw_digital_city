"""Checks on the generated city data and the visual configuration.

Run with:  python3 -m unittest discover -s tests -v

These guard the two things that would actually hurt us: shipping personal data
into a demo, and config/metrics.yaml drifting out of sync with city.json so a
layer silently renders a single tier.
"""

import json
import re
import unittest
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
CITY = REPO / "data" / "city.json"
CONFIG = REPO / "config" / "metrics.yaml"


def load_city():
    return json.loads(CITY.read_text(encoding="utf-8"))


def load_config():
    return yaml.safe_load(CONFIG.read_text(encoding="utf-8"))


class TestPrivacy(unittest.TestCase):
    """The source workbook carries owner names and emails. None may reach the city."""

    def test_no_email_addresses(self):
        blob = CITY.read_text(encoding="utf-8")
        self.assertEqual([], re.findall(r"[\w.+-]+@[\w-]+\.[\w.]+", blob))

    def test_no_corporate_domain(self):
        self.assertNotIn("vodafone.com", CITY.read_text(encoding="utf-8").lower())

    def test_contact_details_never_appear(self):
        """Names became a deliberate choice. Contact details never did."""
        for category in load_city()["categories"]:
            for banned in ("email", "contact", "phone"):
                matches = [k for k in category if banned in k.lower()]
                self.assertEqual([], matches, f"{category['code']} leaks {matches}")

    def test_names_appear_only_where_the_config_allows(self):
        """`people.show` decides whether anyone is identified, and this holds
        the build to whatever it was set to. Flipping it to 'none' must
        actually remove every name, not just stop adding new ones."""
        show = (load_config().get("people") or {}).get("show", "none")
        city = load_city()
        people = {p for c in city["categories"] for p in c.get("owners", [])}

        if show == "none":
            self.assertEqual(set(), people, "people.show is 'none' but names are present")
            return

        self.assertTrue(people, f"people.show is '{show}' but no owners were emitted")
        self.assertEqual(show, city["meta"].get("people"),
                         "meta must record how people are identified")
        # An owner is allowed in `owners` and nowhere else.
        elsewhere = json.dumps(
            [{k: v for k, v in c.items() if k != "owners"} for c in city["categories"]],
            ensure_ascii=False,
        )
        for person in people:
            self.assertNotIn(person, elsewhere, f"{person} appears outside owners")

    def test_owners_are_people_not_pasted_cells(self):
        """The source column holds compound strings: several people plus the
        markets each covers. Emitting those raw would make a leaderboard row
        nobody can read, and would count three people as one."""
        for category in load_city()["categories"]:
            for person in category.get("owners", []):
                self.assertNotIn("(", person, category["code"])
                self.assertNotIn(",", person, category["code"])
                self.assertLess(len(person), 40, category["code"])
                self.assertFalse(any(ch.isdigit() for ch in person), category["code"])

    def test_raw_workbook_is_not_tracked(self):
        gitignore = (REPO / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("data/raw/", gitignore)
        self.assertIn("*.xlsx", gitignore)


class TestCityShape(unittest.TestCase):
    def setUp(self):
        self.city = load_city()
        self.config = load_config()

    def test_scope_and_counts_agree(self):
        counts = self.city["meta"]["counts"]
        self.assertEqual(counts["categories"], len(self.city["categories"]))
        self.assertEqual(counts["districts"], len(self.city["districts"]))
        self.assertEqual(
            counts["plots"], sum(len(d["plots"]) for d in self.city["districts"])
        )

    def test_category_codes_are_unique(self):
        codes = [c["code"] for c in self.city["categories"]]
        self.assertEqual(len(codes), len(set(codes)))

    def test_every_category_belongs_to_a_plot_in_its_district(self):
        placed = {
            code
            for district in self.city["districts"]
            for plot in district["plots"]
            for code in plot["codes"]
        }
        self.assertEqual(placed, {c["code"] for c in self.city["categories"]})

    def test_blueprint_state_matches_counts(self):
        for category in self.city["categories"]:
            metrics = category["metrics"]
            if metrics["cbp_active"] > 0:
                expected = "active"
            elif metrics["cbp_draft"] > 0:
                expected = "draft"
            else:
                expected = "none"
            self.assertEqual(expected, category["blueprint_state"], category["code"])

    def test_market_reach_matches_market_list(self):
        for category in self.city["categories"]:
            self.assertEqual(
                len(category["markets"]),
                category["metrics"]["market_reach"],
                category["code"],
            )

    def test_sample_metrics_are_declared(self):
        """Anything not real must be named in meta, so the UI can badge it.

        The list is derived from the config rather than written down, so this
        checks the derivation: exactly the metrics the registry admits are
        placeholders and that actually drive a visual layer. Empty is the
        right answer today and the assertion still has to hold if it stops
        being empty.
        """
        declared = self.city["meta"]["sample_metrics"]
        bound = {layer["metric"] for layer in self.config["layers"].values()}
        expected = sorted(
            name for name, spec in self.config["metrics"].items()
            if spec.get("sample") and name in bound
        )
        self.assertEqual(expected, declared)

    def test_no_fabricated_figures_are_published(self):
        """A placeholder column must not survive in the output at all.

        The AI-RFP figures were generated from a seed while the real column
        was empty, and a file carrying both would let somebody read the wrong
        one. The measured column is the only one shipped.
        """
        for category in self.city["categories"]:
            for name in category["metrics"]:
                self.assertNotIn(
                    "sample", name,
                    f"{category['code']} still carries {name}",
                )

    def test_no_sample_metric_drives_a_visual_layer(self):
        """The whole reason the sample badge exists. Now that the real AI
        column has numbers in it, nothing invented may be on screen."""
        config = load_config()
        registry = config["metrics"]
        for layer, binding in config["layers"].items():
            metric = binding["metric"]
            self.assertFalse(
                registry[metric].get("sample"),
                f"layer {layer} is drawing {metric}, which is sample data",
            )


class TestConfigBinding(unittest.TestCase):
    """config/metrics.yaml is the pivot point. Keep it honest against the data."""

    def setUp(self):
        self.config = load_config()
        self.city = load_city()

    def test_every_layer_binds_to_a_known_metric(self):
        registry = self.config["metrics"]
        for layer, binding in self.config["layers"].items():
            self.assertIn(binding["metric"], registry, f"layer {layer}")

    def test_every_registered_metric_exists_on_every_category(self):
        """Swapping a layer to any registered metric must not blank the city."""
        for name in self.config["metrics"]:
            for category in self.city["categories"]:
                self.assertIn(name, category["metrics"], f"{category['code']} / {name}")

    def test_numeric_tiers_ascend_and_end_open(self):
        for name, metric in self.config["metrics"].items():
            if metric.get("kind") != "numeric":
                continue
            bounds = [tier["max"] for tier in metric["tiers"]]
            self.assertIsNone(bounds[-1], f"{name}: top tier must be open-ended")
            finite = [b for b in bounds if b is not None]
            self.assertEqual(finite, sorted(finite), f"{name}: tiers out of order")

    def test_bound_layers_have_data_to_draw(self):
        """A layer bound to an empty column silently draws nothing.

        This is not hypothetical: the reactor layer was bound to `ai_rfps`,
        which is null for all 145 categories because the real column has not
        arrived yet, so every rooftop resolved to the "Dark" tier and no
        reactor was ever drawn, while the legend advertised four states.
        """
        for layer, binding in self.config["layers"].items():
            name = binding["metric"]
            values = [c["metrics"].get(name) for c in self.city["categories"]]
            present = [v for v in values if v is not None]
            self.assertTrue(present, f"layer {layer} is bound to {name}, which is empty")
            self.assertGreater(
                len(set(present)), 1,
                f"layer {layer} is bound to {name}, which never varies, so it draws one tier"
            )

    def test_every_visual_tier_is_reachable_by_the_data(self):
        """A rung no value can reach draws nothing, and nobody is told.

        The AI-RFP ladder had four rungs calibrated for a placeholder column
        whose values reached double figures. On the measured column, which runs
        0 to 2, every lit category fell on the lowest lit rung: no category
        ever reached the tier that draws a beam, so the layer showed almost
        nothing and no check noticed. This asserts that every declared tier of
        every bound metric is actually occupied.
        """
        for layer, binding in self.config["layers"].items():
            name = binding["metric"]
            spec = self.config["metrics"][name]
            tiers = spec.get("tiers")
            if not tiers:
                continue
            values = [c["metrics"][name] for c in load_city()["categories"]]

            def rung(value):
                for index, tier in enumerate(tiers):
                    ceiling = tier.get("max", tier.get("value"))
                    if ceiling is None:
                        return index
                    if isinstance(ceiling, str):
                        if value == ceiling:
                            return index
                    elif value <= ceiling:
                        return index
                return len(tiers) - 1

            occupied = {rung(v) for v in values}
            empty = [tiers[i]["id"] for i in range(len(tiers)) if i not in occupied]
            self.assertEqual(
                [], empty,
                f"layer {layer} is bound to {name}, whose tier(s) {empty} no "
                f"category can reach, so that part of the encoding never draws",
            )

    def test_no_bound_layer_rests_on_an_unreal_measure(self):
        """Every visual layer must be driven by a measured column.

        Both flags are now clear: the AI column stopped being a placeholder
        when it was measured, and blueprint reach stopped being provisional
        when height moved to the composite score, because it no longer stands
        in for anything. The assertion is the rule rather than the state, so a
        future substitution has to be declared before it can drive anything.
        """
        registry = self.config["metrics"]
        for layer, binding in self.config["layers"].items():
            spec = registry[binding["metric"]]
            for flag in ("sample", "provisional"):
                if spec.get(flag):
                    self.assertTrue(
                        self.config["disclosure"][f"show_{flag}_badge"],
                        f"layer {layer} rests on a {flag} measure with the "
                        f"badge switched off, which presents it as measured",
                    )

        # The badge machinery stays wired up with nothing to badge, because
        # the next substitution arrives as a data change, not a code one.
        self.assertTrue(self.config["disclosure"]["show_sample_badge"])
        self.assertTrue(self.config["disclosure"]["show_provisional_badge"])


class TestTheNumbersWeSayOutLoud(unittest.TestCase):
    """Every figure quoted in a document or on a stage, asserted.

    These are deliberately brittle. A refreshed extract that changes one of
    them should fail this suite, because the alternative is finding out from
    a reader of those documents.
    """

    def setUp(self):
        self.city = load_city()
        self.cats = self.city["categories"]

    def test_the_shape_of_the_estate(self):
        counts = self.city["meta"]["counts"]
        self.assertEqual(8, counts["districts"])
        self.assertEqual(31, counts["plots"])
        self.assertEqual(145, counts["categories"])
        self.assertEqual(21, counts["markets"])

    def test_built_against_actually_used(self):
        """The finding the whole iteration is built around."""
        totals = self.city["totals"]
        self.assertEqual(44, totals["active"])
        self.assertEqual(4, totals["in_use"])
        used = sorted(c["code"] for c in self.cats if c["metrics"]["cbp_used"] > 0)
        self.assertEqual(["A213", "A251", "D408", "D506"], used)

    def test_ai_is_the_real_column_now(self):
        """Eight, not the twenty-eight the placeholder was showing."""
        self.assertEqual(8, self.city["totals"]["ai_started"])
        lit = sorted(c["code"] for c in self.cats if c["metrics"]["ai_rfps"] > 0)
        self.assertEqual(
            ["A212", "A213", "A251", "A314", "D303", "D333", "D506", "D513"], lit
        )

    def test_networks_journey_score(self):
        journey = self.city["totals"]["journey"]
        self.assertAlmostEqual(19.4, journey["total"], delta=0.2)

        self.assertAlmostEqual(16.1, journey["blueprint"], delta=0.2)
        self.assertAlmostEqual(1.6, journey["usage"], delta=0.2)
        self.assertAlmostEqual(1.7, journey["ai"], delta=0.2)

    def test_the_district_table_in_the_docs(self):
        """Every district score quoted in JOURNEY-SCORE.md, to the digit shown.

        The panel rounds these for display and the document quotes the
        rounded figure, so this compares what a reader sees rather than the
        underlying float. Fixed sits on 19.5 and has already been written
        down once as 19.
        """
        expected = {
            "Access Radio/Fixed": 28,
            "Transmission Infrastructure": 23,
            "Energy": 22,
            "Fixed": 20,
            "Managed Services and Outsourcing": 19,
            "Leased Lines": 13,
            "Software and Core": 12,
            "Network Revenue Platforms": 9,
        }
        shown = {
            d["name"]: round(d["totals"]["journey"]["total"])
            for d in self.city["districts"]
        }
        self.assertEqual(expected, shown)

    def test_one_category_has_done_the_whole_journey(self):
        perfect = [c["code"] for c in self.cats if c["journey"]["total"] == 100]
        self.assertEqual(["A251"], perfect)

    def test_the_eight_monuments(self):
        """Earned by the composite score, and drawn from an adopting market.

        The threshold used to be blueprint reach, which put a monument on four
        categories that are live in several markets and have never been used.
        Progress is the threshold now, so the monuments mark the eight
        best-performing categories in the estate.
        """
        marked = {c["code"]: c for c in self.cats if c.get("landmark")}
        self.assertEqual(
            {"A251", "A213", "D506", "A212", "D408", "D513", "D333", "A314"},
            set(marked),
        )
        names = [c["landmark"]["name"] for c in marked.values()]
        self.assertEqual(len(names), len(set(names)), "a monument is used twice")
        for code, category in marked.items():
            self.assertIn(
                category["landmark"]["market"], category["markets"],
                f"{code} has a monument from a market that never adopted it",
            )

    def test_monuments_are_earned_and_every_earner_gets_one(self):
        config = load_config()
        floor = config["landmarks"]["min_score"]
        declared = {
            m["shape"]
            for monuments in config["landmarks"]["by_market"].values()
            for m in monuments
        }
        marked = [c for c in self.cats if c.get("landmark")]
        eligible = [c for c in self.cats
                    if c["blueprint_state"] == "active" and c["journey"]["total"] >= floor]
        self.assertEqual(
            sorted(c["code"] for c in eligible), sorted(c["code"] for c in marked),
            "every category over the threshold must get a monument, and no other",
        )
        for category in marked:
            self.assertGreaterEqual(category["journey"]["total"], floor)
            self.assertIn(category["landmark"]["market"], category["markets"])
            self.assertIn(category["landmark"]["shape"], declared)

    def test_big_ben_goes_to_the_completed_journey(self):
        """Vodafone is a UK company, and A251 is the only category in Networks
        that has done the whole journey. It held the Colosseum while the
        threshold was reach, because A221 took the UK on sixteen markets and
        has never been used."""
        uk = [c for c in self.cats
              if c.get("landmark") and c["landmark"]["name"] == "Big Ben"]
        self.assertEqual(1, len(uk))
        self.assertEqual("A251", uk[0]["code"])
        self.assertEqual(100, uk[0]["journey"]["total"])

    def test_the_most_reused_blueprint_no_longer_gets_one(self):
        """A221 is live in sixteen markets, double the next, and has never been
        used. Losing its monument is the point of the change."""
        top = max(self.cats, key=lambda c: c["metrics"]["market_reach"])
        self.assertEqual("A221", top["code"])
        self.assertEqual(16, top["metrics"]["market_reach"])
        self.assertEqual(0, top["metrics"]["cbp_used"])
        self.assertIsNone(top.get("landmark"))

    def test_ai_rooftops_are_no_longer_a_placeholder(self):
        """Eight, and the guide and the screen must agree on which eight."""
        lit = [c for c in self.cats if c["metrics"]["ai_rfps"] > 0]
        self.assertEqual(8, len(lit))
        self.assertEqual(2, max(c["metrics"]["ai_rfps"] for c in lit))

    def test_no_config_value_was_truncated_by_an_unquoted_comma(self):
        """A comma inside a {curly} mapping ends the value.

        YAML reads `detail: in use, and with AI` as the value "in use" plus a
        second key "and with AI" with no value. It parses, it validates, and
        the half sentence goes on screen. Three tier details and two stage
        definitions in this file had lost their second clause that way, and
        nothing caught it because the result is legal YAML.

        Any key mapped to None is the signature, except `max: null`, which is
        how an open-ended top tier is written on purpose.
        """
        found = []

        def walk(node, path):
            if isinstance(node, dict):
                for key, value in node.items():
                    if value is None and key != "max":
                        found.append(f"{path}.{key}")
                    walk(value, f"{path}.{key}")
            elif isinstance(node, list):
                for i, item in enumerate(node):
                    walk(item, f"{path}[{i}]")

        walk(load_config(), "config")
        self.assertEqual([], found, "quote these values, they contain a comma")

    def test_the_stages_cover_the_whole_score_without_a_gap(self):
        """Four stages, in order, from zero, each starting where the last ends.

        The boundaries moved out of the renderer and into the config, which
        means a config edit can now leave a score in no stage at all.
        """
        stages = load_config()["score"]["stages"]
        weights = load_config()["score"]["weights"]
        self.assertEqual(4, len(stages))
        self.assertEqual(0, stages[0]["from"])
        starts = [stage["from"] for stage in stages]
        self.assertEqual(starts, sorted(starts))
        self.assertEqual(len(set(starts)), len(starts))
        self.assertLess(starts[-1], sum(weights.values()))
        for stage in stages:
            self.assertTrue(stage["label"])
            self.assertTrue(stage["detail"])

    def test_every_category_scores_within_its_weights(self):
        weights = load_config()["score"]["weights"]
        for category in self.cats:
            journey = category["journey"]
            self.assertLessEqual(journey["blueprint"], weights["blueprint"])
            self.assertLessEqual(journey["usage"], weights["usage"])
            self.assertLessEqual(journey["ai"], weights["ai"])
            self.assertEqual(
                journey["total"],
                journey["blueprint"] + journey["usage"] + journey["ai"],
                category["code"],
            )


if __name__ == "__main__":
    unittest.main()

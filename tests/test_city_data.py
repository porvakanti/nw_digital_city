"""Checks on the generated city data and the visual configuration.

Run with:  python3 -m unittest discover -s tests -v

These guard the two things that would actually hurt us: shipping personal data
into a demo, and config/metrics.yaml drifting out of sync with city.json so a
layer silently renders nothing on stage.
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
        """Anything not real must be named in meta, so the UI can badge it."""
        self.assertIn("ai_rfps_sample", self.city["meta"]["sample_metrics"])

    def test_sample_ai_rfps_only_where_rules_exist(self):
        """A category with no active blueprint cannot have AI-generated RFPs."""
        for category in self.city["categories"]:
            if category["blueprint_state"] != "active":
                self.assertEqual(0, category["metrics"]["ai_rfps_sample"], category["code"])

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
    """config/metrics.yaml is the pivot point — keep it honest against the data."""

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

    def test_unreal_metrics_are_badged(self):
        """Placeholder or stand-in numbers must be flagged, not quietly presented."""
        registry = self.config["metrics"]
        self.assertTrue(registry["ai_rfps_sample"].get("sample"))
        self.assertTrue(registry["market_reach"].get("provisional"))
        self.assertTrue(self.config["disclosure"]["show_sample_badge"])
        self.assertTrue(self.config["disclosure"]["show_provisional_badge"])


if __name__ == "__main__":
    unittest.main()


class TestTheNumbersWeSayOutLoud(unittest.TestCase):
    """Every figure quoted in a document or on a stage, asserted.

    These are deliberately brittle. A refreshed extract that changes one of
    them should fail this suite, because the alternative is finding out from
    somebody in the audience.
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

    def test_one_category_has_done_the_whole_journey(self):
        perfect = [c["code"] for c in self.cats if c["journey"]["total"] == 100]
        self.assertEqual(["A251"], perfect)

    def test_five_landmarks_each_from_an_adopting_market(self):
        """The rule that makes a landmark mean something rather than decorate."""
        marked = {c["code"]: c for c in self.cats if c.get("landmark")}
        self.assertEqual(
            {"A221", "A251", "D406", "A201", "D504"}, set(marked),
        )
        self.assertEqual("Big Ben", marked["A221"]["landmark"]["name"])
        names = [c["landmark"]["name"] for c in marked.values()]
        self.assertEqual(len(names), len(set(names)), "a landmark is used twice")
        for code, category in marked.items():
            self.assertIn(
                category["landmark"]["market"], category["markets"],
                f"{code} has a landmark from a market that never adopted it",
            )

    def test_landmarks_are_earned_and_unique(self):
        """A landmark says a blueprint travelled. It has to be from somewhere
        that actually adopted it, or it is decoration wearing a rule."""
        config = load_config()
        floor = config["landmarks"]["min_markets"]
        marked = [c for c in self.cats if c.get("landmark")]
        eligible = [c for c in self.cats if c["metrics"]["market_reach"] >= floor]
        self.assertEqual(len(eligible), len(marked),
                         "every category above the threshold should have one")
        for category in marked:
            self.assertGreaterEqual(category["metrics"]["market_reach"], floor)
            self.assertIn(category["landmark"]["market"], category["markets"])
            self.assertIn(category["landmark"]["shape"],
                          {v["shape"] for v in config["landmarks"]["by_market"].values()})

    def test_the_most_reused_blueprint_gets_big_ben(self):
        """A221 is live in sixteen markets, double the next. Vodafone is a UK
        company, so the most-copied blueprint in the estate takes the UK."""
        top = max(self.cats, key=lambda c: c["metrics"]["market_reach"])
        self.assertEqual("A221", top["code"])
        self.assertEqual(16, top["metrics"]["market_reach"])
        self.assertEqual("Big Ben", top["landmark"]["name"])

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

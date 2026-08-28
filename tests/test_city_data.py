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

    def test_no_owner_fields(self):
        for category in load_city()["categories"]:
            for banned in ("owner", "email", "contact", "manager"):
                matches = [k for k in category if banned in k.lower()]
                self.assertEqual([], matches, f"{category['code']} leaks {matches}")

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

    def test_unreal_metrics_are_badged(self):
        """Placeholder or stand-in numbers must be flagged, not quietly presented."""
        registry = self.config["metrics"]
        self.assertTrue(registry["ai_rfps"].get("sample"))
        self.assertTrue(registry["market_reach"].get("provisional"))
        self.assertTrue(self.config["disclosure"]["show_sample_badge"])
        self.assertTrue(self.config["disclosure"]["show_provisional_badge"])


if __name__ == "__main__":
    unittest.main()

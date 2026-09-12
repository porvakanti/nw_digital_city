"""Security and data-protection checks on the repository and its outputs.

These exist because the failure modes they cover are silent. A committed
credential, a workbook inside a distributable, or a metric marked as sample
data quietly driving a visual layer all look exactly like a working build
until somebody else finds them.

Grouped by what they protect:

    TestSecrets            nothing that authenticates anybody is committed
    TestPersonalData       contact details never leave the build
    TestDistributable      the package cannot carry the source workbook
    TestWebExposure        the service declares who may frame and embed it
    TestRendererSafety     no dynamic evaluation in the browser code
    TestDependencies       the deployed image installs only what it needs
    TestDataIntegrity      the figures on screen are the figures in the source
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import unittest
import zipfile
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
CITY = REPO / "data" / "city.json"
CONFIG = REPO / "config" / "metrics.yaml"

# Files that are allowed to talk about credentials without holding one.
DOCUMENTATION = {".md", ".example"}

SECRET_PATTERNS = [
    # Google API keys have a fixed, recognisable shape.
    (re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b"), "a Google API key"),
    (re.compile(r"\bsk-[A-Za-z0-9]{20,}\b"), "an OpenAI-style secret key"),
    (re.compile(r"\bsk-ant-[A-Za-z0-9\-_]{20,}\b"), "an Anthropic key"),
    (re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"), "a private key"),
    (re.compile(r"\bghp_[A-Za-z0-9]{36}\b"), "a GitHub token"),
    # An assignment with a long opaque literal on the right-hand side.
    (re.compile(r"(?i)\b(api[_-]?key|secret|passwd|password|token)\s*[:=]\s*"
                r"['\"][A-Za-z0-9_\-]{24,}['\"]"), "a hardcoded credential"),
]


def tracked_files() -> list[Path]:
    """Every file git is actually tracking, which is the set that can leak."""
    listing = subprocess.run(
        ["git", "ls-files", "-z"], cwd=REPO, capture_output=True, text=True, check=True
    )
    return [REPO / name for name in listing.stdout.split("\0") if name]


def readable_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return ""


class TestSecrets(unittest.TestCase):
    """Nothing that authenticates anybody may be committed."""

    def test_no_credentials_in_tracked_files(self):
        offences = []
        for path in tracked_files():
            if path.suffix in DOCUMENTATION or path.name == "package-lock.json":
                continue
            text = readable_text(path)
            for pattern, what in SECRET_PATTERNS:
                if pattern.search(text):
                    offences.append(f"{path.relative_to(REPO)} contains {what}")
        self.assertEqual([], offences, "\n".join(offences))

    def test_env_file_is_ignored_and_untracked(self):
        """The key lives in .env, which must never become a tracked file."""
        ignore = (REPO / ".gitignore").read_text(encoding="utf-8")
        self.assertRegex(ignore, r"(?m)^\.env$")
        names = {p.name for p in tracked_files()}
        self.assertNotIn(".env", names)

    def test_the_example_env_holds_no_real_key(self):
        example = REPO / ".env.example"
        self.assertTrue(example.exists(), ".env.example should exist as a template")
        for pattern, what in SECRET_PATTERNS:
            self.assertIsNone(pattern.search(example.read_text(encoding="utf-8")),
                              f".env.example contains {what}")

    def test_no_credentials_are_baked_into_the_image(self):
        """Cloud Run gets its identity from a service account, not a key."""
        dockerfile = (REPO / "Dockerfile").read_text(encoding="utf-8")
        self.assertNotRegex(dockerfile, r"(?i)NW_API_KEY\s*=\s*\S")
        deploy = (REPO / "deploy" / "cloudrun.sh").read_text(encoding="utf-8")
        self.assertIn("NW_PROVIDER=${PROVIDER}", deploy.replace('"', ""))
        self.assertNotRegex(deploy, r"(?i)NW_API_KEY=\S")


class TestPersonalData(unittest.TestCase):
    """Contact details never leave the build. Names are a declared decision."""

    def setUp(self):
        self.city = json.loads(CITY.read_text(encoding="utf-8"))
        self.config = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))

    def test_no_contact_details_anywhere_in_the_output(self):
        blob = CITY.read_text(encoding="utf-8")
        self.assertEqual([], re.findall(r"[\w.+-]+@[\w-]+\.[\w.]+", blob),
                         "an email address reached city.json")
        self.assertNotIn("vodafone.com", blob.lower())
        self.assertEqual([], re.findall(r"\+\d{2}\s?\d{3}\s?\d{6,}", blob),
                         "a telephone number reached city.json")

    def test_the_output_declares_how_it_identifies_people(self):
        declared = (self.config.get("people") or {}).get("show", "none")
        self.assertIn(declared, {"names", "initials", "none"})
        self.assertEqual(declared, self.city["meta"].get("people"),
                         "city.json must record its own disclosure level")

    def test_names_appear_only_in_the_owners_field(self):
        people = {p for c in self.city["categories"] for p in c.get("owners", [])}
        if (self.config.get("people") or {}).get("show") == "none":
            self.assertEqual(set(), people)
            return
        elsewhere = json.dumps(
            [{k: v for k, v in c.items() if k != "owners"} for c in self.city["categories"]],
            ensure_ascii=False,
        )
        for person in people:
            self.assertNotIn(person, elsewhere, f"{person} appears outside owners")

    def test_the_source_workbooks_are_not_tracked(self):
        ignore = (REPO / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("data/raw/", ignore)
        self.assertIn("*.xlsx", ignore)
        for path in tracked_files():
            self.assertNotEqual(".xlsx", path.suffix, f"{path} is tracked")
            self.assertNotIn("data/raw", str(path))


class TestDistributable(unittest.TestCase):
    """The file that gets emailed cannot carry anything it should not."""

    ZIP = REPO / "nw-digital-city.zip"
    SINGLE = REPO / "NW Digital City.html"

    def test_the_packager_never_walks_the_repository(self):
        """A directory walk is how a workbook ends up in a distributable."""
        source = (REPO / "run.py").read_text(encoding="utf-8")
        self.assertNotIn("ROOT.rglob", source)
        self.assertIn('renderer.rglob("*")', source,
                      "packaging should enumerate the renderer, not the repo")

    @unittest.skipUnless(ZIP.exists(), "run `run.py package` first")
    def test_the_zip_carries_only_the_renderer(self):
        with zipfile.ZipFile(self.ZIP) as bundle:
            names = bundle.namelist()
        for name in names:
            self.assertNotIn(".xlsx", name)
            self.assertNotIn("data/raw", name)
            self.assertNotIn(".env", name)

    @unittest.skipUnless(SINGLE.exists(), "run `run.py package` first")
    def test_the_single_file_carries_no_contact_details(self):
        text = self.SINGLE.read_text(encoding="utf-8")
        self.assertEqual([], re.findall(r"[\w.+-]+@[\w-]+\.[\w.]+", text))
        self.assertNotIn("vodafone.com", text.lower())
        # Nothing should still be fetched at runtime: it must open offline.
        self.assertNotRegex(text, r'<script[^>]+src=[\'"]http')
        self.assertNotRegex(text, r'<link[^>]+href=[\'"]http')


class TestWebExposure(unittest.TestCase):
    """What the service says about who may embed or frame it."""

    def test_framing_is_refused_unless_an_origin_is_named(self):
        source = (REPO / "app" / "server.py").read_text(encoding="utf-8")
        self.assertIn("frame-ancestors", source)
        self.assertIn("'none'", source,
                      "the default must refuse all framing")

    def test_the_plan_endpoint_cannot_return_an_error_to_the_browser(self):
        """A 500 here would take a live demo down with it."""
        source = (REPO / "app" / "server.py").read_text(encoding="utf-8")
        self.assertIn("except Exception", source)

    def test_no_secret_reaches_the_browser(self):
        """The key stays server-side: the page asks its own origin."""
        for name in ("city.js", "agent.js", "index.html"):
            text = (REPO / "renderer" / name).read_text(encoding="utf-8")
            self.assertNotIn("NW_API_KEY", text, f"{name} references the key")
            self.assertNotIn("generativelanguage", text)


class TestRendererSafety(unittest.TestCase):
    """The renderer takes typed input, so it must not evaluate it."""

    FILES = ("city.js", "agent.js")

    def test_no_dynamic_code_evaluation(self):
        for name in self.FILES:
            text = (REPO / "renderer" / name).read_text(encoding="utf-8")
            for banned in ("eval(", "new Function(", "setTimeout(\"", "setInterval(\""):
                self.assertNotIn(banned, text, f"{name} uses {banned}")

    def test_user_input_is_never_written_as_markup(self):
        """Whatever somebody types must reach the DOM as text.

        The agent's own generated markup is fine; a query string interpolated
        into innerHTML would not be.
        """
        agent = (REPO / "renderer" / "agent.js").read_text(encoding="utf-8")
        for line in agent.splitlines():
            if "innerHTML" not in line:
                continue
            self.assertNotRegex(
                line, r"innerHTML\s*[+]?=\s*.*\b(query|text|raw|input\.value)\b",
                f"user input interpolated into markup: {line.strip()[:80]}",
            )


class TestDependencies(unittest.TestCase):
    """The deployed image installs only what it needs to run."""

    def test_test_only_libraries_stay_out_of_the_image(self):
        deployed = (REPO / "app" / "requirements.txt").read_text(encoding="utf-8")
        for library in ("httpx2", "playwright", "pytest"):
            self.assertNotIn(library, deployed,
                             f"{library} is a development dependency")

    def test_the_developer_file_includes_the_deployed_one(self):
        """One list, extended, so the two cannot drift apart."""
        dev = (REPO / "requirements-dev.txt").read_text(encoding="utf-8")
        self.assertIn("-r app/requirements.txt", dev)

    def test_every_dependency_is_pinned_to_a_floor(self):
        for name in ("app/requirements.txt", "requirements-dev.txt"):
            for line in (REPO / name).read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith(("#", "-r")):
                    continue
                self.assertRegex(line, r"[><=]=",
                                 f"{name} has an unbounded dependency: {line}")

    def test_the_build_context_excludes_the_source_data(self):
        """Cloud Build uploads a folder; this decides what it does not get."""
        ignore = (REPO / ".gcloudignore").read_text(encoding="utf-8")
        for excluded in ("data/raw/", ".env", ".venv/"):
            self.assertIn(excluded, ignore)
        deploy = (REPO / "deploy" / "cloudrun.sh").read_text(encoding="utf-8")
        self.assertIn(".gcloudignore", deploy,
                      "the deploy script should refuse to upload blind")


class TestDataIntegrity(unittest.TestCase):
    """What is drawn must be what the source says, and be labelled honestly."""

    def setUp(self):
        self.city = json.loads(CITY.read_text(encoding="utf-8"))
        self.config = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))

    def test_no_placeholder_metric_drives_a_visual_layer(self):
        registry = self.config["metrics"]
        for layer, binding in self.config["layers"].items():
            metric = binding["metric"]
            self.assertFalse(registry[metric].get("sample"),
                             f"layer {layer} draws {metric}, which is sample data")

    def test_anything_provisional_is_declared_as_such(self):
        registry = self.config["metrics"]
        for layer, binding in self.config["layers"].items():
            entry = registry[binding["metric"]]
            if entry.get("provisional"):
                self.assertTrue(entry.get("provisional_note"),
                                f"{binding['metric']} is provisional with no explanation")

    def test_every_bound_metric_exists_on_every_category(self):
        for layer, binding in self.config["layers"].items():
            metric = binding["metric"]
            for category in self.city["categories"]:
                self.assertIn(metric, category["metrics"],
                              f"{category['code']} has no {metric} for layer {layer}")

    def test_the_score_weights_total_one_hundred(self):
        weights = self.config["score"]["weights"]
        self.assertEqual(100, sum(weights.values()))

    def test_totals_agree_with_the_categories_they_summarise(self):
        cats = self.city["categories"]
        totals = self.city["totals"]
        self.assertEqual(len(cats), totals["categories"])
        self.assertEqual(sum(1 for c in cats if c["blueprint_state"] == "active"),
                         totals["active"])
        self.assertEqual(sum(1 for c in cats if c["metrics"]["cbp_used"] > 0),
                         totals["in_use"])
        self.assertAlmostEqual(sum(c["metrics"]["spend_eur"] for c in cats),
                               totals["spend_eur"], places=2)

    def test_district_totals_agree_with_the_whole(self):
        whole = self.city["totals"]
        parts = self.city["districts"]
        self.assertEqual(whole["categories"], sum(d["totals"]["categories"] for d in parts))
        self.assertEqual(whole["in_use"], sum(d["totals"]["in_use"] for d in parts))
        self.assertAlmostEqual(whole["spend_eur"],
                               sum(d["totals"]["spend_eur"] for d in parts), places=2)

    def test_the_output_records_its_own_provenance(self):
        meta = self.city["meta"]
        for field in ("generated_at", "source", "scope", "counts"):
            self.assertIn(field, meta)


if __name__ == "__main__":
    unittest.main()

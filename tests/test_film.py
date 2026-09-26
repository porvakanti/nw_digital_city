"""The film's config, checked against the data and the renderer.

A film is expensive to rebuild and nobody watches it frame by frame afterwards,
so a config that has drifted from the data is not discovered by making one. The
checks here are the ones that would otherwise be found by sitting through a
recording: a category the cut flies to that a refreshed extract no longer has,
a key a shot presses that the renderer has rebound, a figure on a card whose
path into city.json has been renamed.

Nothing here records or encodes anything. The suite stays a suite.
"""

from __future__ import annotations

import json
import pathlib
import re
import unittest

import yaml

REPO = pathlib.Path(__file__).resolve().parent.parent
FILM = REPO / "film" / "film.yaml"


class TestFilm(unittest.TestCase):
    maxDiff = None

    @classmethod
    def setUpClass(cls):
        cls.config = yaml.safe_load(FILM.read_text(encoding="utf-8"))
        cls.city = json.loads((REPO / "data" / "city.json").read_text(encoding="utf-8"))
        cls.shots = {shot["id"]: shot for shot in cls.config["shots"]}
        cls.steps = [(shot["id"], step)
                     for shot in cls.config["shots"] for step in shot["do"]]

    # ------------------------------------------------------------- the cut

    def test_every_beat_names_a_shot_that_exists(self):
        for beat in self.config["beats"]:
            self.assertIn(beat["shot"], self.shots,
                          f"beat {beat['id']} is cut from a shot nothing records")

    def test_every_shot_is_used(self):
        used = {beat["shot"] for beat in self.config["beats"]}
        unused = sorted(set(self.shots) - used)
        self.assertEqual([], unused,
                         "these shots are recorded and never cut in, which is "
                         "minutes of browser time for nothing")

    def test_every_beat_runs_forward(self):
        for beat in self.config["beats"]:
            self.assertGreater(beat["length"], 0, f"beat {beat['id']} has no length")
            self.assertGreaterEqual(beat["start"], 0,
                                    f"beat {beat['id']} starts before its shot does")

    def test_a_beat_that_fades_has_room_for_the_fade(self):
        for beat in self.config["beats"]:
            for edge in ("fade_in", "fade_out"):
                if edge in beat:
                    self.assertLess(beat[edge], beat["length"],
                                    f"beat {beat['id']} fades for longer than it runs")

    def test_every_card_is_gone_before_its_beat_ends(self):
        """A card still on screen at a cut jumps, because the next beat has none."""
        fade = self.config["style"]["card_fade_s"]
        for beat in self.config["beats"]:
            if not beat.get("card"):
                continue
            self.assertLess(beat["card_in"], beat["card_out"],
                            f"beat {beat['id']} fades its card out before it is in")
            self.assertLessEqual(
                beat["card_out"] + fade, beat["length"] + 0.001,
                f"beat {beat['id']} is still fading its card out when the beat ends")

    # ----------------------------------------------------------- the cards

    def test_every_card_a_beat_asks_for_exists(self):
        wanted = {beat["card"] for beat in self.config["beats"] if beat.get("card")}
        wanted.add(self.config["end_card"]["card"])
        missing = sorted(wanted - set(self.config["cards"]))
        self.assertEqual([], missing, "beats refer to cards that are not defined")

    def test_every_card_layout_is_one_the_renderer_of_cards_draws(self):
        import sys
        sys.path.insert(0, str(REPO / "film"))
        import cards  # noqa: E402
        for name, spec in self.config["cards"].items():
            self.assertIn(spec["layout"], cards.LAYOUTS,
                          f"card {name} asks for a layout that is not drawn")

    def test_every_figure_on_a_card_resolves_in_the_data(self):
        """The reason the figures are paths and not literals.

        A card is a picture. A wrong number on one is not caught by anything
        downstream, and it is the kind of number that gets quoted afterwards.
        """
        for name, spec in self.config["cards"].items():
            for row in spec.get("rows", []):
                value = self.city
                for part in row["figure"].split("."):
                    self.assertIsInstance(
                        value, dict,
                        f"card {name} asks for {row['figure']}, which is not a path")
                    self.assertIn(
                        part, value,
                        f"card {name} asks for {row['figure']} and city.json "
                        f"has no {part}")
                    value = value[part]
                self.assertIsInstance(
                    value, (int, float),
                    f"card {name} would print {row['figure']} as {value!r}")

    def test_the_mark_on_the_end_card_is_in_the_checkout(self):
        for name, spec in self.config["cards"].items():
            if "mark" in spec:
                self.assertTrue((REPO / spec["mark"]).is_file(),
                                f"card {name} shows {spec['mark']}, which is not there")

    def test_a_font_for_every_weight_is_present_on_this_host(self):
        found = {weight: [c for c in candidates if pathlib.Path(c).is_file()]
                 for weight, candidates in self.config["style"]["font"].items()}
        bare = sorted(weight for weight, hits in found.items() if not hits)
        if bare:
            raise unittest.SkipTest(
                f"no font on this host for: {', '.join(bare)}. "
                "film.yaml lists candidates for linux, macOS and windows.")

    # ------------------------------------------------- what the shots drive

    def test_every_category_a_shot_flies_to_exists(self):
        codes = {category["code"] for category in self.city["categories"]}
        for shot, step in self.steps:
            if "focus" in step:
                self.assertIn(step["focus"], codes,
                              f"shot {shot} flies to {step['focus']}, which is "
                              "not in this extract")

    def test_every_district_a_shot_flies_to_exists(self):
        names = {district["name"] for district in self.city["districts"]}
        for shot, step in self.steps:
            if "focus_district" in step:
                self.assertIn(step["focus_district"], names,
                              f"shot {shot} flies to a district that is not in "
                              "this extract")

    def test_every_key_a_shot_presses_is_still_bound(self):
        """Keys have been rebound in this renderer before."""
        source = (REPO / "renderer" / "city.js").read_text(encoding="utf-8")
        table = re.search(r"const KEYS = \{(.*?)\}", source, re.S)
        self.assertIsNotNone(table, "renderer/city.js no longer declares a KEYS table")
        bound = set(re.findall(r"[\"']?([A-Za-z?])[\"']?\s*:", table.group(1)))
        for shot, step in self.steps:
            if "key" in step:
                self.assertIn(step["key"], bound,
                              f"shot {shot} presses {step['key']!r}, which the "
                              "renderer does not bind")

    def test_every_step_is_one_the_recorder_performs(self):
        known = {"focus", "focus_district", "reset", "key", "ask", "wait_ms"}
        source = (REPO / "film" / "record.js").read_text(encoding="utf-8")
        for shot, step in self.steps:
            for name in step:
                self.assertIn(name, known, f"shot {shot} asks for an unknown step")
                self.assertIn(f"step.{name}", source,
                              f"film.yaml uses {name} and record.js does not read it")

    def test_the_elements_the_shots_hide_are_in_the_renderer(self):
        markup = (REPO / "renderer" / "index.html").read_text(encoding="utf-8")
        hidden = list(self.config["record"]["hide_ids"])
        for shot in self.config["shots"]:
            hidden += shot.get("keep", [])
        for element in sorted(set(hidden)):
            self.assertRegex(
                markup, rf'id="{element}"',
                f"film.yaml hides or keeps #{element}, which the page no longer has")

    def test_the_recorder_is_driven_by_the_config_and_not_by_a_list_of_its_own(self):
        """The whole point of film.yaml.

        An earlier pass kept the shot list inside the recording script, which
        is how the cut and the recordings came to disagree about what had been
        shot.
        """
        source = (REPO / "film" / "record.js").read_text(encoding="utf-8")
        for shot in self.shots:
            self.assertNotIn(f"'{shot}'", source,
                             f"record.js names the shot {shot} itself")


class TestHeadTrim(unittest.TestCase):
    """The run of frames the head trim is measured from.

    Taking the last frame above the red threshold rather than the end of the
    first run of them put the trim past the end of two recordings: both fly to
    a lot carrying a red hotel, which fills the measured window with more red
    than the dialog does.
    """

    @classmethod
    def setUpClass(cls):
        import sys
        sys.path.insert(0, str(REPO / "film"))
        import make  # noqa: E402
        cls.first_run = staticmethod(make.first_run)

    def test_the_first_run_ends_where_the_dialog_is_dismissed(self):
        #                   blank     dialog        city
        showing = [False] * 3 + [True] * 6 + [False] * 40
        self.assertEqual(8, self.first_run(showing, 4))

    def test_red_later_in_the_recording_is_ignored(self):
        showing = [False] * 3 + [True] * 6 + [False] * 5 + [True] * 30
        self.assertEqual(8, self.first_run(showing, 4))

    def test_a_moment_of_red_is_not_a_dialog(self):
        showing = [True] * 2 + [False] * 4 + [True] * 8 + [False] * 10
        self.assertEqual(13, self.first_run(showing, 4))

    def test_a_recording_with_no_dialog_trims_to_nothing(self):
        self.assertIsNone(self.first_run([False] * 40, 4))
        self.assertIsNone(self.first_run([], 4))

    def test_a_dialog_that_never_clears_still_reports_a_run(self):
        """Not a trim anyone wants, but a defined one rather than an exception."""
        self.assertEqual(9, self.first_run([False] * 4 + [True] * 6, 4))


if __name__ == "__main__":
    unittest.main()

"""What the model says is never trusted directly.

These cover the ways a reply can be wrong: invented names, the wrong scope for
the question, invented figures, and malformed output. Each of those would fail
visibly in the interface, so each is turned into something harmless here.
"""

import unittest

from app import plan as planning

NAMES = {
    "categories": ["A221 Spring 2/R - SW/PS", "D504 Batteries", "A311 Field Maintenance"],
    "districts": ["Energy", "Software and Core"],
    "plots": ["Packet Switching"],
    "markets": ["Germany"],
}


def parse(payload, question=""):
    return planning.parse(payload, NAMES, "test", question)


class TestPlanParsing(unittest.TestCase):
    def test_reads_a_clean_reply(self):
        p = parse('{"intent":"focus","target":{"kind":"category","value":"D504"}}')
        self.assertEqual(("focus", "category", "D504"), (p.intent, p.kind, p.value))

    def test_accepts_a_category_named_in_full(self):
        p = parse('{"intent":"focus","target":{"kind":"category","value":"D504 Batteries"}}')
        self.assertEqual("D504", p.value)

    def test_keeps_multi_word_names_whole(self):
        p = parse('{"intent":"rank","target":{"kind":"district","value":"Software and Core"}}')
        self.assertEqual("Software and Core", p.value)

    def test_drops_an_invented_category(self):
        p = parse('{"intent":"focus","target":{"kind":"category","value":"Z999"}}')
        self.assertEqual("none", p.kind)
        self.assertTrue(any("invented" in n for n in p.notes))

    def test_a_category_cannot_scope_an_area_question(self):
        p = parse('{"intent":"gaps","target":{"kind":"category","value":"D504"}}')
        self.assertEqual(("gaps", "none"), (p.intent, p.kind))

    def test_an_area_question_keeps_a_district(self):
        """Gaps in Energy is a real question, and the city can answer it."""
        p = parse('{"intent":"gaps","target":{"kind":"district","value":"Energy"}}')
        self.assertEqual(("district", "Energy"), (p.kind, p.value))

    def test_nothing_scopes_a_view_of_the_whole_city(self):
        """"What could we build" answered for one market is a caption that
        does not match its own screen: the view raises every lot in Networks.
        """
        for intent in planning.WHOLE_CITY_INTENTS:
            for kind, value in (("market", "Germany"), ("district", "Energy"),
                                ("plot", "Packet Switching")):
                with self.subTest(intent=intent, kind=kind):
                    p = parse('{"intent":"%s","target":{"kind":"%s","value":"%s"}}'
                              % (intent, kind, value))
                    self.assertEqual(intent, p.intent)
                    self.assertEqual(("none", ""), (p.kind, p.value))
                    self.assertTrue(any("whole-city" in n for n in p.notes), p.notes)

    def test_a_leaderboard_question_names_which_board(self):
        for view in planning.VIEWS:
            with self.subTest(view=view):
                p = parse('{"intent":"leaders","view":"%s"}' % view)
                self.assertEqual("leaders", p.intent)
                self.assertEqual(view, p.view)

    def test_an_invented_board_falls_back_to_people(self):
        """A view the panel does not have would open nothing at all.

        People is the default because "who" is the word that sends a question
        to the leaderboard in the first place.
        """
        for made_up in ("managers", "PEOPLE!", "teams", "", "1"):
            with self.subTest(view=made_up):
                p = parse('{"intent":"leaders","view":"%s"}' % made_up)
                self.assertEqual("people", p.view)

    def test_a_ranking_metric_the_city_does_not_hold_is_refused(self):
        p = parse('{"intent":"rank","metric":"vibes"}')
        self.assertEqual("journey", p.metric)

    def test_ranking_defaults_to_the_journey_score(self):
        """Not blueprint reach, which ranked a category nobody has used top of
        the city and answered every "who is doing best" with it."""
        self.assertEqual("journey", parse('{"intent":"rank"}').metric)
        self.assertEqual("journey", planning.Plan().metric)

    def test_strips_a_preamble_carrying_figures(self):
        p = parse('{"intent":"gaps","preamble":"There are 89 empty lots"}')
        self.assertEqual("", p.preamble)

    def test_survives_a_code_fence(self):
        p = parse('```json\n{"intent":"night"}\n```')
        self.assertEqual("night", p.intent)

    def test_survives_prose_around_the_json(self):
        p = parse('Sure! {"intent":"reset"} Hope that helps.')
        self.assertEqual("reset", p.intent)

    def test_unusable_replies_become_unknown(self):
        for payload in ("", "no json here", "{broken", "null"):
            self.assertEqual("unknown", parse(payload).intent, payload)

    def test_unknown_intent_is_not_passed_through(self):
        p = parse('{"intent":"launch_missiles"}')
        self.assertEqual("unknown", p.intent)

    def test_a_focus_with_no_target_is_rescued_from_the_question(self):
        """A model can be right about the intent and forget to say where.

        Observed against a live key: "batteries" came back as `{"intent":
        "focus"}` and nothing else. Refusing that tells a room that batteries
        is not in the city, when the word is right there in the question.
        """
        p = parse('{"intent":"focus"}', "batteries")
        self.assertEqual(("focus", "category", "D504"), (p.intent, p.kind, p.value))
        self.assertTrue(any("found D504" in n for n in p.notes), p.notes)

    def test_the_rescue_cannot_invent_anything(self):
        p = parse('{"intent":"focus"}', "banana bread")
        self.assertEqual(("none", ""), (p.kind, p.value))

    def test_the_rescue_leaves_a_target_the_model_gave_alone(self):
        p = parse('{"intent":"focus","target":{"kind":"category","value":"A311"}}',
                  "batteries")
        self.assertEqual("A311", p.value)

    def test_vocabulary_carries_names_but_no_figures(self):
        text = planning.vocabulary(NAMES)
        self.assertIn("D504 Batteries", text)
        self.assertIn("Software and Core", text)
        for leak in ("€", "spend", "75000000"):
            self.assertNotIn(leak, text)


if __name__ == "__main__":
    unittest.main()


class ProviderDispatchTests(unittest.TestCase):
    """Every provider name the code offers must actually resolve to something.

    Added after an edit deleted the mock provider's implementation while
    leaving the line that calls it, and every check still reported a summary
    that looked like a pass.
    """

    def test_every_advertised_provider_is_implemented(self):
        from app import providers

        for name in ("mock", "gemini", "vertex", "claude"):
            with self.subTest(provider=name):
                self.assertIn(name, providers.DEFAULT_MODELS | {"mock": ""},
                              "provider is not in DEFAULT_MODELS")

    def test_the_mock_provider_answers_without_a_key_or_a_network(self):
        import os

        from app import providers

        saved = os.environ.get("NW_PROVIDER")
        os.environ["NW_PROVIDER"] = "mock"
        try:
            raw, source = providers.complete(
                "system", "batteries",
                {"categories": ["D504 Batteries"], "districts": ["Energy"],
                 "plots": [], "markets": []},
            )
        finally:
            if saved is None:
                os.environ.pop("NW_PROVIDER", None)
            else:
                os.environ["NW_PROVIDER"] = saved

        self.assertEqual(source, "mock")
        self.assertIn("D504", raw)


class MatchTests(unittest.TestCase):
    """Near misses resolve; inventions and ambiguity do not."""

    KNOWN = planning._codes([
        "D504 Batteries",
        "A221 Spring 2/R - SW/PS",
        "A311 Field Maintenance",
        "X001 Operations Support System (OSS) Services",
        "X002 Operations Support System (OSS) Services",
    ])

    def resolve(self, value):
        return planning._match(value, self.KNOWN)

    def test_a_title_on_its_own_resolves_to_the_whole_entry(self):
        """A model answering "Batteries" is right, and used to be discarded."""
        self.assertEqual(self.resolve("Batteries"), "D504 Batteries")
        self.assertEqual(self.resolve("field maintenance"), "A311 Field Maintenance")

    def test_punctuation_and_case_do_not_matter(self):
        self.assertEqual(self.resolve("spring 2 r sw ps"), "A221 Spring 2/R - SW/PS")

    def test_a_code_on_its_own_still_resolves(self):
        self.assertEqual(self.resolve("d504"), "D504")

    def test_a_title_shared_by_two_categories_is_refused(self):
        """Flying to the wrong one of two is worse than saying it is ambiguous."""
        self.assertEqual(self.resolve("Operations Support System (OSS) Services"), "")

    def test_an_invented_name_is_still_refused(self):
        self.assertEqual(self.resolve("Quantum Teapots"), "")
        self.assertEqual(self.resolve("Z999"), "")

    def test_a_plan_naming_a_category_by_title_keeps_the_code(self):
        """End to end: the browser is handed a code it can fly to."""
        names = {"categories": ["D504 Batteries"], "districts": [], "plots": [],
                 "markets": []}
        got = planning.parse(
            '{"intent": "focus", "target": {"kind": "category", "value": "Batteries"}}',
            names, "test",
        )
        self.assertEqual(got.intent, "focus")
        self.assertEqual(got.value, "D504")


class FindNameTests(unittest.TestCase):
    """The name search shared by the mock provider and the rescue above.

    One implementation on purpose: two copies of "what does this question
    refer to" would drift, and the mock is what the whole suite runs against.
    """

    def find(self, question):
        return planning.find_name(question, NAMES)

    def test_finds_a_category_by_title(self):
        self.assertEqual(("category", "D504 Batteries"), self.find("batteries"))

    def test_finds_a_category_by_code(self):
        self.assertEqual(("category", "A311 Field Maintenance"),
                         self.find("show me A311"))

    def test_a_district_wins_over_a_category(self):
        self.assertEqual(("district", "Energy"), self.find("how is Energy doing"))

    def test_finds_a_market(self):
        self.assertEqual(("market", "Germany"), self.find("Germany"))

    def test_finds_nothing_in_a_question_about_nothing(self):
        self.assertEqual(("", ""), self.find("banana bread"))


class EmbeddedCodeTests(unittest.TestCase):
    """A code inside a longer answer is still a code.

    Models format targets in ways a prompt cannot fully pin down: "D504
    (Batteries)", "category D504", "the D504 lot". Refusing those sends the
    camera nowhere over punctuation.
    """

    KNOWN = planning._codes(["D504 Batteries", "A311 Field Maintenance"])

    def test_a_code_wrapped_in_words_or_brackets_resolves(self):
        for value in ("D504 (Batteries)", "category D504", "the D504 lot",
                      "Batteries (D504)"):
            with self.subTest(value=value):
                self.assertEqual(planning._match(value, self.KNOWN), "D504")

    def test_an_unknown_code_is_still_refused(self):
        self.assertEqual(planning._match("Z999 Nonsense", self.KNOWN), "")
        self.assertEqual(planning._match("see Z999 for this", self.KNOWN), "")

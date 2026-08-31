"""The model ladder: what happens when a model says no.

Every one of these runs against a stubbed transport, so the suite never spends
a request from a real key. That matters more than usual here: the thing being
tested is the behaviour when a free key runs out, and a test that needed a live
call could only be run twenty times a day.
"""

from __future__ import annotations

import contextlib
import io
import os
import unittest
from unittest import mock

import httpx

from app import providers


def answer(text: str = '{"intent": "focus"}') -> httpx.Response:
    return httpx.Response(200, json={
        "candidates": [{"content": {"parts": [{"text": text}]}}]
    })


def refusal(status: int, retry_after: float | None = None) -> httpx.Response:
    body: dict = {"error": {"message": "no"}}
    if retry_after is not None:
        body["error"]["details"] = [{"retryDelay": f"{retry_after}s"}]
    return httpx.Response(status, json=body)


class LadderTests(unittest.TestCase):
    SETTINGS = ("NW_MODEL", "NW_MODELS", "NW_PIN", "NW_RETRIES", "NW_PROVIDER",
                "NW_API_KEY")

    def setUp(self):
        self.saved = {k: os.environ.pop(k, None) for k in self.SETTINGS}
        os.environ["NW_RETRIES"] = "1"  # no waiting about in a test
        providers._rested.clear()
        providers._resolved.clear()
        self.asked: list[str] = []

    def tearDown(self):
        for key, value in self.saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        providers._rested.clear()

    def transport(self, replies: dict[str, httpx.Response]):
        """Stand in for the network. Records which models were asked."""
        def post(url, **kwargs):
            name = url.split("/models/")[1].split(":")[0]
            self.asked.append(name)
            return replies.get(name, refusal(404))
        return mock.patch.object(providers.httpx, "post", side_effect=post)

    def call(self, model: str = ""):
        """Swallow the "answered by" line, which belongs to a real run.

        The ladder announces a switch on stdout, which is right when somebody
        is watching a run and wrong in the middle of a row of test dots.
        """
        with contextlib.redirect_stdout(io.StringIO()) as noise:
            result = providers._gemini("system", "question", "key", model)
        self.announced = noise.getvalue()
        return result

    # ---------------------------------------------------------------- ladder
    def test_the_first_choice_answers_and_nothing_else_is_asked(self):
        with self.transport({"gemini-3.5-flash": answer()}):
            self.call("gemini-3.5-flash")
        self.assertEqual(self.asked, ["gemini-3.5-flash"])

    def test_a_model_out_of_requests_hands_over_to_the_next(self):
        with self.transport({
            "gemini-3.5-flash": refusal(429),
            "gemini-3.6-flash": answer(),
        }):
            self.call("gemini-3.5-flash")
        self.assertEqual(self.asked[:2], ["gemini-3.5-flash", "gemini-3.6-flash"])
        self.assertIn("answered by gemini-3.6-flash", self.announced,
                      "a switch must be visible, not silent")

    def test_a_retired_model_hands_over_too(self):
        with self.transport({
            "gemini-3.5-flash": refusal(404),
            "gemini-3.6-flash": answer(),
        }):
            self.call("gemini-3.5-flash")
        self.assertIn("gemini-3.6-flash", self.asked)

    def test_a_model_that_refused_is_not_asked_again(self):
        """The point of remembering: one 429 should not cost a request a time."""
        replies = {"gemini-3.5-flash": refusal(429), "gemini-3.6-flash": answer()}
        with self.transport(replies):
            self.call("gemini-3.5-flash")
            first_round = list(self.asked)
            self.asked.clear()
            self.call("gemini-3.5-flash")

        self.assertIn("gemini-3.5-flash", first_round)
        self.assertNotIn("gemini-3.5-flash", self.asked,
                         "a rested model should be skipped, not asked again")
        self.assertEqual(self.asked, ["gemini-3.6-flash"])

    def test_the_service_is_believed_about_how_long_to_wait(self):
        with self.transport({"gemini-3.5-flash": refusal(429, retry_after=12),
                             "gemini-3.6-flash": answer()}):
            self.call("gemini-3.5-flash")
        rest = providers._rested["gemini-3.5-flash"] - __import__("time").time()
        self.assertLess(rest, 20, "should honour the 12s the service asked for")

    def test_everything_refusing_says_so_rather_than_failing_obscurely(self):
        with self.transport({}):  # every model 404s
            with self.assertRaises(providers.ProviderError) as caught:
                self.call("gemini-3.5-flash")
        self.assertIn("out of requests", str(caught.exception))

    def test_nw_models_sets_the_order(self):
        os.environ["NW_MODELS"] = "gemini-2.5-flash,gemini-3.7-flash"
        with self.transport({"gemini-2.5-flash": answer()}):
            self.call("")
        self.assertEqual(self.asked[0], "gemini-2.5-flash")

    def test_nw_pin_refuses_to_move_off_the_named_model(self):
        """An experiment comparing two models must not be quietly rerouted."""
        os.environ["NW_PIN"] = "1"
        with self.transport({"gemini-3.6-flash": answer()}):
            with self.assertRaises(providers.ProviderError):
                self.call("gemini-3.5-flash")
        self.assertEqual(set(self.asked), {"gemini-3.5-flash"})

    def test_a_network_failure_is_not_mistaken_for_a_spent_model(self):
        """No point walking the whole ladder when nothing can be reached."""
        def post(url, **kwargs):
            self.asked.append(url.split("/models/")[1].split(":")[0])
            raise httpx.ConnectTimeout("nothing there")

        with mock.patch.object(providers.httpx, "post", side_effect=post):
            with self.assertRaises(providers.ProviderError) as caught:
                self.call("gemini-3.5-flash")
        self.assertEqual(len(self.asked), 1, "should stop at the first failure")
        self.assertIn("no answer from", str(caught.exception))


if __name__ == "__main__":
    unittest.main()

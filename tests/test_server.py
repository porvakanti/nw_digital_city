"""The service: what it serves, and who is allowed to frame it."""

from __future__ import annotations

import os
import unittest
from unittest import mock

try:
    from fastapi.testclient import TestClient
except ImportError:  # pragma: no cover - only the renderer is needed to demo
    TestClient = None


@unittest.skipIf(TestClient is None, "fastapi is not installed")
class ServerTests(unittest.TestCase):
    # Every setting the service reads. The test decides all of them, because
    # otherwise a developer with a real key in .env fails a test that asserts
    # what happens when there is not one, which is exactly what happened.
    SETTINGS = ("NW_PROVIDER", "NW_MODEL", "NW_API_KEY", "NW_PROJECT",
                "NW_REGION", "NW_FRAME_ANCESTORS")

    def setUp(self):
        self.saved = {k: os.environ.pop(k, None) for k in self.SETTINGS}

    def tearDown(self):
        for key, value in self.saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def client(self, **environment):
        import importlib

        from app import env, server

        # Importing the service reads .env, which on a machine with a real key
        # in it would put that key straight back into a test about there not
        # being one. So the environment is cleared after the import as well as
        # before it, and the reload is done with the reader stubbed out. The
        # test decides every setting; the file does not get a vote.
        for key in self.SETTINGS:
            os.environ.pop(key, None)
        for key, value in environment.items():
            assert key in self.SETTINGS, f"{key} is not restored in tearDown"
            os.environ[key] = value

        with mock.patch.object(env, "load", lambda *a, **k: {}):
            importlib.reload(server)
        return TestClient(server.app)

    def test_serves_the_page_from_the_same_origin_as_the_agent(self):
        """The whole point of one container: the browser needs no configuration."""
        client = self.client()
        self.assertEqual(client.get("/health").status_code, 200)
        page = client.get("/")
        self.assertEqual(page.status_code, 200)
        self.assertIn("NW Digital City", page.text)

    def test_refuses_to_be_framed_by_default(self):
        client = self.client()
        self.assertEqual(
            client.get("/").headers["content-security-policy"], "frame-ancestors 'none'"
        )

    def test_names_who_may_frame_it(self):
        """The marketplace embeds it; nothing else should be able to."""
        client = self.client(NW_FRAME_ANCESTORS="https://marketplace.example")
        self.assertEqual(
            client.get("/").headers["content-security-policy"],
            "frame-ancestors https://marketplace.example",
        )

    def test_health_reports_what_is_actually_wired_up(self):
        """With no key set, /health must say so rather than claiming ready."""
        client = self.client(NW_PROVIDER="gemini")
        body = client.get("/health").json()
        self.assertEqual(body["provider"], "gemini")
        self.assertFalse(body["ready"], "no key is set, so it should say so")
        self.assertIn("NW_API_KEY", body["detail"])

    def test_plan_never_returns_an_error_to_the_browser(self):
        """A 500 here would take the interface with it."""
        client = self.client(NW_PROVIDER="nonsense-provider")
        reply = client.post(
            "/plan",
            json={"question": "hello", "names": {"categories": [], "districts": [],
                                                 "plots": [], "markets": []}},
        )
        self.assertEqual(reply.status_code, 200)
        self.assertEqual(reply.json()["intent"], "unknown")


if __name__ == "__main__":
    unittest.main()

"""The service: what it serves, and who is allowed to frame it."""

from __future__ import annotations

import os
import unittest

try:
    from fastapi.testclient import TestClient
except ImportError:  # pragma: no cover - only the renderer is needed to demo
    TestClient = None


@unittest.skipIf(TestClient is None, "fastapi is not installed")
class ServerTests(unittest.TestCase):
    def client(self, **environment):
        for key, value in environment.items():
            os.environ[key] = value
        import importlib

        from app import server

        importlib.reload(server)
        return TestClient(server.app)

    def tearDown(self):
        for key in ("NW_FRAME_ANCESTORS", "NW_PROVIDER"):
            os.environ.pop(key, None)

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
        client = self.client(NW_PROVIDER="gemini")
        body = client.get("/health").json()
        self.assertEqual(body["provider"], "gemini")
        self.assertFalse(body["ready"], "no key is set, so it should say so")
        self.assertIn("NW_API_KEY", body["detail"])

    def test_plan_never_returns_an_error_to_the_browser(self):
        """A 500 here on the day would take the demo down with it."""
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

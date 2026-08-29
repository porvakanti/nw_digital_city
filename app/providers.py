"""Model providers behind one interface.

Which one runs is a setting, not a code change. That is the whole point: we are
building against a free key today, the all-hands may run on Vertex AI, and the
internal Vodafone environment will be a third address for the same code.

    NW_PROVIDER=mock     no network, no key, deterministic. The default.
    NW_PROVIDER=gemini   Google AI Studio key. NW_API_KEY.
    NW_PROVIDER=vertex   Gemini on Vertex AI. NW_PROJECT, NW_REGION.
    NW_PROVIDER=claude   Anthropic API. NW_API_KEY.

Every provider returns raw text. Validation happens in plan.parse, so a
provider cannot smuggle an invented category through by returning tidy JSON.
"""

from __future__ import annotations

import json
import os
import re

import httpx

TIMEOUT = float(os.environ.get("NW_TIMEOUT", "8"))


class ProviderError(RuntimeError):
    pass


# ---------------------------------------------------------------- mock
# Good enough to develop and test the whole path with no key and no network,
# and good enough to stand in if the endpoint is unreachable on the day.
_RULES: list[tuple[str, dict]] = [
    (r"\b(night|dark|readiness|autonom|ai.?ready|reactor|rfp)|lights? (off|out)", {"intent": "night"}),
    (r"\b(could|potential|opportunit|what if|unbuilt|upside)", {"intent": "could_be"}),
    (r"\b(gap|empty|bare|missing|nothing|unbuilt)|no blueprint|without a blueprint", {"intent": "gaps"}),
    (r"\b(reset|zoom out|whole city|everything|daylight|back)", {"intent": "reset"}),
    (r"\b(worst|weakest|behind|lowest|least)", {"intent": "rank", "direction": "asc"}),
    (r"\b(best|biggest|largest|most|top|highest|lead|leads|leading|ahead)", {"intent": "rank", "direction": "desc"}),
    (r"\b(how many|summary|overview|overall|status|total)", {"intent": "summary"}),
]


def _mock(question: str, names: dict) -> str:
    lowered = question.lower()
    decision = {"intent": "focus", "target": {"kind": "none", "value": ""}}
    for pattern, result in _RULES:
        if re.search(pattern, lowered):
            decision.update(result)
            break

    # Name-match against the vocabulary, longest name first so "Access Radio"
    # is not beaten by a shorter substring. Categories arrive as "D504 Batteries",
    # so the code and the title each have to match on their own.
    for kind, key in (("district", "districts"), ("plot", "plots"),
                      ("market", "markets"), ("category", "categories")):
        pool = names.get(key) or []
        for entry in sorted(pool, key=len, reverse=True):
            label = entry.lower()
            code, _, title = entry.partition(" ")
            hit = label in lowered
            if kind == "category":
                hit = hit or bool(re.search(rf"\b{re.escape(code.lower())}\b", lowered))
                hit = hit or (len(title) > 3 and title.lower() in lowered)
                # and the other way round, so "Spring 2/R" finds
                # "Spring 2/R - SW/PS"
                hit = hit or (len(lowered) >= 5 and lowered.strip() in title.lower())
            if hit:
                decision["target"] = {"kind": kind, "value": entry}
                if decision["intent"] == "focus" and kind == "district":
                    decision["intent"] = "district"
                break
        if decision["target"]["value"]:
            break

    if decision["intent"] == "focus" and not decision["target"]["value"]:
        decision["intent"] = "unknown"
    if "spend" in lowered or "value" in lowered or "money" in lowered:
        decision["metric"] = "spend_eur"
    return json.dumps(decision)


# ---------------------------------------------------------------- gemini
def _gemini(system: str, question: str, key: str, model: str) -> str:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    )
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": question}]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json"},
    }
    reply = httpx.post(url, json=body, headers={"x-goog-api-key": key}, timeout=TIMEOUT)
    reply.raise_for_status()
    data = reply.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as exc:
        raise ProviderError(f"unexpected Gemini response: {data}") from exc


# ---------------------------------------------------------------- vertex
def _vertex(system: str, question: str, project: str, region: str, model: str) -> str:
    """Gemini on Vertex AI, authenticated by application default credentials.

    No API key. This is the shape the internal environment will want, since the
    service account on the Cloud Run revision carries the credentials.
    """
    try:
        import google.auth
        import google.auth.transport.requests
    except ImportError as exc:  # pragma: no cover - depends on deployment image
        raise ProviderError("vertex needs google-auth installed") from exc

    credentials, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    credentials.refresh(google.auth.transport.requests.Request())
    host = "aiplatform.googleapis.com" if region == "global" else f"{region}-aiplatform.googleapis.com"
    url = (
        f"https://{host}/v1/projects/{project}/locations/{region}"
        f"/publishers/google/models/{model}:generateContent"
    )
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": question}]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json"},
    }
    reply = httpx.post(
        url, json=body, timeout=TIMEOUT,
        headers={"Authorization": f"Bearer {credentials.token}"},
    )
    reply.raise_for_status()
    data = reply.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as exc:
        raise ProviderError(f"unexpected Vertex response: {data}") from exc


# ---------------------------------------------------------------- claude
def _claude(system: str, question: str, key: str, model: str) -> str:
    reply = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": model,
            "max_tokens": 512,
            "system": system,
            "messages": [{"role": "user", "content": question}],
        },
        timeout=TIMEOUT,
    )
    reply.raise_for_status()
    data = reply.json()
    try:
        return "".join(part.get("text", "") for part in data["content"])
    except (KeyError, TypeError) as exc:
        raise ProviderError(f"unexpected Claude response: {data}") from exc


DEFAULT_MODELS = {
    "gemini": "gemini-2.0-flash",
    "vertex": "gemini-2.0-flash",
    "claude": "claude-opus-5",
}


def complete(system: str, question: str, names: dict) -> tuple[str, str]:
    """Run the configured provider. Returns (raw reply, provider name)."""
    provider = os.environ.get("NW_PROVIDER", "mock").strip().lower()
    model = os.environ.get("NW_MODEL") or DEFAULT_MODELS.get(provider, "")

    if provider == "mock":
        return _mock(question, names), "mock"
    if provider == "gemini":
        key = _require("NW_API_KEY", provider)
        return _gemini(system, question, key, model), f"gemini:{model}"
    if provider == "vertex":
        project = _require("NW_PROJECT", provider)
        region = os.environ.get("NW_REGION", "global")
        return _vertex(system, question, project, region, model), f"vertex:{model}"
    if provider == "claude":
        key = _require("NW_API_KEY", provider)
        return _claude(system, question, key, model), f"claude:{model}"
    raise ProviderError(f"unknown NW_PROVIDER {provider!r}")


def _require(name: str, provider: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ProviderError(f"{provider} needs {name} to be set")
    return value

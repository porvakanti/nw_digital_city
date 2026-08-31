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

# Eight seconds was optimistic. A first call from a corporate laptop goes
# through a proxy, negotiates TLS, and carries a prompt naming 145 categories,
# and any one of those can take longer than that on its own. The browser keeps
# its own much shorter deadline, because on stage a slow answer is worse than
# no answer; this one is for the command line, where waiting is fine and a
# false timeout costs an afternoon.
TIMEOUT = float(os.environ.get("NW_TIMEOUT", "30"))


def _timeout() -> "httpx.Timeout":
    """Connect fast, read slowly. They fail for completely different reasons."""
    return httpx.Timeout(TIMEOUT, connect=min(10.0, TIMEOUT))


class ProviderError(RuntimeError):
    pass


UNREACHABLE = """could not reach {host} within {seconds:.0f}s.

  This is the network rather than the key or the model. On a corporate laptop
  the usual causes are, in order:

    1. A proxy. If your browser needs one, so does this:
         setx HTTPS_PROXY http://your-proxy:port
       and open a new terminal.
    2. TLS interception. If the proxy re-signs certificates, point Python at
       the company root certificate:
         setx SSL_CERT_FILE C:\\path\\to\\corporate-root.pem
    3. The host being blocked outright, which is a question for IT.

  To rule out the deadline itself, try it with a longer one:
    setx NW_TIMEOUT 60

  None of this stops the demo. Without a model the city answers with its own
  rules, and every question in the script still works."""


# ---------------------------------------------------------------- mock
# Good enough to develop and test the whole path with no key and no network,
# and good enough to stand in if the endpoint is unreachable on the day.
_RULES: list[tuple[str, dict]] = [
    (r"\b(asks?|asking|takeaways?|actions?|next steps?)\b|what (should|do|are) (we|i|you)", {"intent": "asks"}),
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
GEMINI_ROOT = "https://generativelanguage.googleapis.com/v1beta"

# Preferred in order. Google retires models on its own schedule, and this
# project found that out the hard way when gemini-2.0-flash started returning
# 404 to a key that had worked the week before. The list is a preference, not a
# promise: what is actually available is asked for at the time.
GEMINI_PREFERENCE = (
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
)

_resolved: dict[str, str] = {}


def gemini_models(key: str) -> list[str]:
    """Every model this key can actually call, newest listing order preserved."""
    try:
        reply = httpx.get(f"{GEMINI_ROOT}/models", headers={"x-goog-api-key": key},
                          timeout=_timeout())
    except httpx.TransportError as exc:
        raise ProviderError(
            UNREACHABLE.format(host="generativelanguage.googleapis.com",
                               seconds=TIMEOUT)
        ) from exc
    reply.raise_for_status()
    out = []
    for entry in reply.json().get("models", []):
        if "generateContent" not in entry.get("supportedGenerationMethods", []):
            continue
        out.append(entry["name"].removeprefix("models/"))
    return out


def _pick_gemini(key: str) -> str:
    """Choose a model that exists, preferring a fast one.

    Called only when the configured model turns out not to be there. Asking the
    API what it has beats guessing, and it means a retirement announcement does
    not become a broken demo.
    """
    available = gemini_models(key)
    for wanted in GEMINI_PREFERENCE:
        if wanted in available:
            return wanted
    flash = [m for m in available if "flash" in m and "preview" not in m]
    if flash:
        return flash[0]
    if available:
        return available[0]
    raise ProviderError("this key can see no models that support generateContent")


def _gemini(system: str, question: str, key: str, model: str) -> str:
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": question}]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json"},
    }
    model = _resolved.get(model, model)
    try:
        reply = httpx.post(f"{GEMINI_ROOT}/models/{model}:generateContent", json=body,
                           headers={"x-goog-api-key": key}, timeout=_timeout())
    except httpx.TransportError as exc:
        # A timeout or a refused connection is the network, not the model, and
        # saying so saves an hour of looking at model names.
        raise ProviderError(
            UNREACHABLE.format(host="generativelanguage.googleapis.com",
                               seconds=TIMEOUT)
        ) from exc

    # A 404 here means the model is gone, not that the key is wrong. Ask what
    # is there, take the best of it, and say so rather than failing 32 times in
    # a row with the same message.
    if reply.status_code == 404 and not os.environ.get("NW_MODEL", "").strip():
        replacement = _pick_gemini(key)
        print(f"· {model} is not available; using {replacement}", flush=True)
        _resolved[model] = replacement
        reply = httpx.post(
            f"{GEMINI_ROOT}/models/{replacement}:generateContent", json=body,
            headers={"x-goog-api-key": key}, timeout=_timeout(),
        )

    if reply.status_code == 404:
        raise ProviderError(
            f"Gemini has no model called {model!r}. Run `run.cmd models` to see "
            "what this key can call, then set NW_MODEL in .env, or clear "
            "NW_MODEL and one will be chosen for you."
        )
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
    try:
        reply = httpx.post(
            url, json=body, timeout=_timeout(),
            headers={"Authorization": f"Bearer {credentials.token}"},
        )
    except httpx.TransportError as exc:
        raise ProviderError(UNREACHABLE.format(host=host, seconds=TIMEOUT)) from exc
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
        timeout=_timeout(),
    )
    reply.raise_for_status()
    data = reply.json()
    try:
        return "".join(part.get("text", "") for part in data["content"])
    except (KeyError, TypeError) as exc:
        raise ProviderError(f"unexpected Claude response: {data}") from exc


# Defaults, not commitments. Google retires models; NW_MODEL in .env overrides
# this, and for Gemini an unset NW_MODEL lets the code pick a live one if the
# default has gone.
DEFAULT_MODELS = {
    "gemini": "gemini-3.5-flash",
    "vertex": "gemini-3.5-flash",
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

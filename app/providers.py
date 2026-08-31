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
import random
import re
import time

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


UNREACHABLE = """no answer from {host} within {seconds:.0f}s.

  Two quite different things look like this.

  1. You are over a rate limit. A free Gemini key allows only a handful of
     requests a minute and a small number a day, and once you are past them
     the service stops answering rather than saying no politely. Check
     https://aistudio.google.com/apikey for your current usage. This is by far
     the most likely cause if some questions worked and then they stopped.

  2. The network cannot reach Google. On a managed laptop that is usually a
     proxy, `setx HTTPS_PROXY http://your-proxy:port`, or a proxy that
     re-signs certificates, `setx SSL_CERT_FILE C:\\path\\to\\root.pem`.

  To rule out the deadline itself: setx NW_TIMEOUT 60

  Neither stops the demo. Without a model the city answers with its own rules,
  and every question in the script still works."""

THROTTLED = """out of requests for {model} today.

  Rate limits are per model, and a free Gemini key allows roughly 5 requests a
  minute and 20 a day for each one. The quickest thing you can do is use a
  different model, because it has its own untouched allowance:

    NW_MODEL=gemini-3.5-flash-lite      in .env, then run it again

  The lite models are faster and cheaper and route these questions perfectly
  well; this is deciding which lot to fly to, not writing an essay.

  Otherwise: the daily count resets at midnight Pacific, which is mid-morning
  in Europe. Or turn on billing at https://aistudio.google.com/apikey, which
  is free to start and lifts the limits out of the way. Or use Vertex AI,
  which is where this deploys and is not subject to the AI Studio free tier at
  all.

  None of this affects the demo. One question is one request, and nobody is
  going to ask twenty of them on a stage."""


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

# A model that has just refused us, and when it is worth asking again. There
# is no API that reports how many requests are left, so the only way to know a
# model is spent is to be told so, and the only sensible thing to do with that
# is remember it and move down the list.
_rested: dict[str, float] = {}
_resolved: dict[str, str] = {}


def _ladder(configured: str) -> list[str]:
    """The models to try, best first.

    NW_MODEL is a first choice rather than a hard pin, because a first choice
    that is out of requests should not take the agent down with it. NW_PIN=1
    for the old behaviour, which is what an experiment comparing two models
    wants.
    """
    named = [m.strip() for m in os.environ.get("NW_MODELS", "").split(",") if m.strip()]
    order = [configured] + named + list(GEMINI_PREFERENCE) if configured else \
        named + list(GEMINI_PREFERENCE)
    if os.environ.get("NW_PIN", "").strip() in ("1", "true", "yes"):
        return [configured] if configured else order[:1]

    seen, out = set(), []
    for name in order:
        if name and name not in seen:
            seen.add(name)
            out.append(name)
    return out


def ladder_for(provider: str, model: str) -> list[str]:
    """What /health and `run.cmd models` should say will be tried, in order."""
    if provider != "gemini":
        return [model] if model else []
    return [m for m in _ladder(model) if not _resting(m)]


def _resting(model: str) -> bool:
    until = _rested.get(model, 0.0)
    if until and time.time() < until:
        return True
    _rested.pop(model, None)
    return False


def _rest(model: str, seconds: float) -> None:
    _rested[model] = time.time() + seconds


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


def _backoff(attempt: int) -> float:
    """Wait longer each time, with a little jitter so retries do not sync up."""
    return min(8.0, 1.5 * (2 ** attempt)) + random.random() * 0.4


def _retry_after(reply: httpx.Response) -> float:
    """However long the service asked us to wait, if it said."""
    header = reply.headers.get("retry-after", "").strip()
    if header.isdigit():
        return min(30.0, float(header))
    try:
        for detail in reply.json().get("error", {}).get("details", []):
            delay = str(detail.get("retryDelay", ""))
            if delay.endswith("s") and delay[:-1].replace(".", "", 1).isdigit():
                return min(30.0, float(delay[:-1]))
    except (ValueError, AttributeError):
        pass
    return 0.0


def _gemini(system: str, question: str, key: str, model: str) -> str:
    """Ask the first model on the ladder that is willing to answer.

    Three things can take a model away: it is retired (404), it is out of
    requests (429), or the service is busy (503). The first is permanent, the
    second lasts until a quota window rolls over, the third passes in seconds.
    Retries cover the third; the ladder covers the other two.

    There is no endpoint that reports remaining quota, so this cannot check in
    advance which model has requests left. It finds out the only way available,
    by asking, and then remembers the answer so it does not ask twice.
    """
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": question}]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json"},
    }
    attempts = int(os.environ.get("NW_RETRIES", "3"))

    def once(name: str) -> httpx.Response:
        """One model, retried through the failures that pass on their own."""
        for attempt in range(attempts):
            try:
                reply = httpx.post(
                    f"{GEMINI_ROOT}/models/{name}:generateContent", json=body,
                    headers={"x-goog-api-key": key}, timeout=_timeout(),
                )
            except httpx.TransportError:
                if attempt == attempts - 1:
                    raise
                time.sleep(_backoff(attempt))
                continue
            if reply.status_code in (429, 503) and attempt < attempts - 1:
                time.sleep(_retry_after(reply) or _backoff(attempt))
                continue
            return reply
        raise ProviderError("gave up after retrying")  # pragma: no cover

    ladder = _ladder(model)
    live = [m for m in ladder if not _resting(m)]
    if not live:
        raise ProviderError(THROTTLED.format(model=", ".join(ladder)))

    transport: Exception | None = None
    for index, name in enumerate(live):
        try:
            reply = once(name)
        except httpx.TransportError as exc:
            transport = exc
            break

        if reply.status_code == 200:
            if index:
                print(f"· {live[0]} was unavailable; answered by {name}", flush=True)
            _resolved[model] = name
            try:
                return reply.json()["candidates"][0]["content"]["parts"][0]["text"]
            except (KeyError, IndexError) as exc:
                raise ProviderError(f"unexpected Gemini response: {reply.json()}") from exc

        if reply.status_code == 404:
            # Retired. It is not coming back, so rest it for the session.
            _rest(name, 86400)
            continue
        if reply.status_code in (429, 503):
            # Out of requests, or busy. The service sometimes says for how
            # long; when it does not, an hour is long enough to stop asking
            # and short enough that a per-minute limit recovers on its own.
            _rest(name, _retry_after(reply) or 3600)
            continue

        reply.raise_for_status()

    if transport is not None:
        raise ProviderError(UNREACHABLE.format(
            host="generativelanguage.googleapis.com", seconds=TIMEOUT
        )) from transport
    raise ProviderError(THROTTLED.format(model=", ".join(live)))


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

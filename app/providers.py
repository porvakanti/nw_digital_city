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

    def call(name: str) -> httpx.Response:
        """One request, retried through the failures that are worth retrying.

        429 is the free tier's rate limit and 503 is the service being busy.
        Both pass on their own, so a short wait beats an error message; a key
        that is out of requests for the day does not pass, and gets told so.
        """
        attempts = int(os.environ.get("NW_RETRIES", "3"))
        for attempt in range(attempts):
            try:
                reply = httpx.post(
                    f"{GEMINI_ROOT}/models/{name}:generateContent", json=body,
                    headers={"x-goog-api-key": key}, timeout=_timeout(),
                )
            except httpx.TransportError as exc:
                if attempt == attempts - 1:
                    raise ProviderError(UNREACHABLE.format(
                        host="generativelanguage.googleapis.com", seconds=TIMEOUT
                    )) from exc
                time.sleep(_backoff(attempt))
                continue

            if reply.status_code in (429, 503) and attempt < attempts - 1:
                time.sleep(_retry_after(reply) or _backoff(attempt))
                continue
            if reply.status_code == 429:
                raise ProviderError(THROTTLED.format(model=name))
            return reply
        raise ProviderError("gave up after retrying")  # pragma: no cover

    reply = call(model)

    # A 404 here means the model is gone, not that the key is wrong. Ask what
    # is there, take the best of it, and say so rather than failing 32 times in
    # a row with the same message.
    if reply.status_code == 404 and not os.environ.get("NW_MODEL", "").strip():
        replacement = _pick_gemini(key)
        print(f"· {model} is not available; using {replacement}", flush=True)
        _resolved[model] = replacement
        reply = call(replacement)

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

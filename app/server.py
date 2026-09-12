"""The only thing that ever gets deployed.

The city is a static page. A browser calling a model directly would have to
carry the credential in the page, where anyone can read it, so this sits in
between: it holds the key, adds the prompt, and hands back a decision.

It also serves the page itself. That is not tidiness, it is the difference
between "set a key in .env and run one command" and a list of steps someone
has to get right in a green room. Because the page and the agent come from the
same origin, the browser finds the endpoint on its own: no query parameter, no
second server, no CORS to think about.

One service, no state, no database. It runs the same in a container on a
host, on Cloud Run, and in the internal environment; only the environment
variables change.
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import env
from . import plan as planning
from . import providers

env.load()

RENDERER = Path(__file__).resolve().parent.parent / "renderer"

app = FastAPI(title="NW Digital City", version="1.0")

# Served from here the page is same-origin and needs none of this. It stays
# because the page can also be opened straight off the disk, which is the
# fallback where the network is unavailable, and from a file://
# origin every request here is cross-origin by definition.
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("NW_ALLOW_ORIGINS", "*").split(","),
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


class Names(BaseModel):
    categories: list[str] = Field(default_factory=list)
    districts: list[str] = Field(default_factory=list)
    plots: list[str] = Field(default_factory=list)
    markets: list[str] = Field(default_factory=list)


class Ask(BaseModel):
    question: str
    names: Names


@app.middleware("http")
async def framing(request, call_next):
    """Let the marketplace put the city in a frame, and nobody else.

    Foundry embeds an agent's surface in an iframe on its detail page, so the
    default of refusing to be framed would show reviewers an empty box. This
    names who may do it rather than turning the protection off: set
    NW_FRAME_ANCESTORS to the marketplace origins, and everything else is still
    refused. Unset means nothing may frame it, which is the safe default for a
    service nobody has embedded yet.
    """
    response = await call_next(request)
    ancestors = os.environ.get("NW_FRAME_ANCESTORS", "").strip()
    response.headers["Content-Security-Policy"] = (
        f"frame-ancestors {ancestors}" if ancestors else "frame-ancestors 'none'"
    )
    return response


@app.get("/health")
def health() -> dict:
    """What is actually wired up, so the page can say so instead of guessing."""
    provider = os.environ.get("NW_PROVIDER", "mock").strip().lower()
    model = os.environ.get("NW_MODEL") or providers.DEFAULT_MODELS.get(provider, "")
    ladder = providers.ladder_for(provider, model)
    ready = True
    detail = ""
    if provider in ("gemini", "claude") and not os.environ.get("NW_API_KEY", "").strip():
        ready, detail = False, "NW_API_KEY is not set"
    if provider == "vertex" and not os.environ.get("NW_PROJECT", "").strip():
        ready, detail = False, "NW_PROJECT is not set"
    return {"ok": True, "provider": provider, "model": model,
            "ladder": ladder, "ready": ready, "detail": detail}


@app.post("/plan")
def make_plan(ask: Ask) -> dict:
    """Decide what the city should do about a question.

    Never fails the caller. The browser has a deterministic parser of its own,
    and a 500 from here would take the interface with it, so an
    unreachable or misbehaving model comes back as an unknown intent and the
    page falls back on its own.
    """
    names = ask.names.model_dump()
    system = planning.SYSTEM_PROMPT + "\n\n" + planning.vocabulary(names)
    try:
        raw, source = providers.complete(system, ask.question, names)
    except Exception as exc:  # noqa: BLE001 - the fallback matters more than the class
        return planning.Plan(
            intent="unknown", source="error", notes=[f"{type(exc).__name__}: {exc}"]
        ).as_dict()
    return planning.parse(raw, names, source, ask.question).as_dict()


# Mounted last, because a mount at the root would otherwise swallow /plan and
# /health. html=True serves index.html for the bare address.
if RENDERER.is_dir():
    app.mount("/", StaticFiles(directory=RENDERER, html=True), name="city")

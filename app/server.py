"""The only thing that ever gets deployed.

The city is a static page. A browser calling a model directly would have to
carry the credential in the page, where anyone can read it, so this sits in
between: it holds the key, adds the prompt, and hands back a decision.

One endpoint, no state, no database. It runs the same in a container on a
laptop, on Cloud Run, and in the internal environment; only the environment
variables change.
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import plan as planning
from . import providers

app = FastAPI(title="NW Digital City agent", version="1.0")

# The renderer is opened from a file so that it still works with no network.
# That makes every request to this service cross-origin by definition.
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


@app.get("/health")
def health() -> dict:
    return {"ok": True, "provider": os.environ.get("NW_PROVIDER", "mock")}


@app.post("/plan")
def make_plan(ask: Ask) -> dict:
    """Decide what the city should do about a question.

    Never fails the caller. The browser has a deterministic parser of its own,
    and a 500 from here on the day would take the demo down with it, so an
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
    return planning.parse(raw, names, source).as_dict()

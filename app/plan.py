"""The contract between the question and the city.

The model's job is to understand what was asked and choose what the city should
do about it. It is not asked to do arithmetic, and it never sees any figures.

That split is deliberate. The prompt carries only names: category codes and
titles, districts, plots, markets. Spend and adoption stay in the browser,
where the tools run against city.json. So the model decides *which* lot to fly
to and the code works out what is on it, which means no figure on screen can
have been invented, and no commercially sensitive number leaves the laptop
while we are building against a temporary endpoint.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

INTENTS = [
    "focus",      # fly to one category
    "district",   # fly to a district
    "gaps",       # the lots with money on them and nothing built
    "summary",    # built / empty / spend for a scope
    "rank",       # best or worst in a scope
    "could_be",   # raise every undeveloped lot
    "night",      # after dark, the readiness view
    "asks",       # the four things the room is being asked to do
    "reset",      # back to the whole city, daylight
    "unknown",    # nothing in the city matches
]

SCOPE_KINDS = ["category", "district", "plot", "market", "none"]
METRICS = ["market_reach", "spend_eur", "cbp_total"]

SYSTEM_PROMPT = """You route questions about a city to the right view of it.

The city shows Vodafone Networks procurement categories as buildings. Districts
hold plots, plots hold lots, and each lot is one category with a code like A221.

Choose one intent and, where the question names somewhere, one target.

Intents:
- focus: the question is about one category
- district: the question is about a whole district
- gaps: asks where the missing blueprints or opportunities are
- summary: asks how somewhere is doing overall
- rank: asks for the best, worst, biggest or weakest
- could_be: asks what could be built, the potential or the upside
- night: asks about AI readiness, autonomy, reactors or AI-generated RFPs
- asks: asks what people should do, what is being asked of them, or the
  takeaways from the session
- reset: asks to go back, zoom out or see the whole city
- unknown: nothing in the city matches the question

Rules:
- Only ever name a target that appears in the lists you are given. Never invent
  a code or a name.
- A category is never the target for gaps, summary, could_be, night, asks or
  reset.
  Those are answered for a district, a plot, a market, or the whole city.
- You have no figures. Do not state or guess any number, amount or percentage.
  The application fills those in.
- preamble is optional: at most eight words framing the answer, no numbers.

Reply with JSON only, no prose and no code fence:
{"intent": "...", "target": {"kind": "...", "value": "..."}, "metric": "...",
 "direction": "asc|desc", "preamble": "..."}
"""


@dataclass
class Plan:
    """What the model decided. Every field is validated before it is trusted."""

    intent: str = "unknown"
    kind: str = "none"
    value: str = ""
    metric: str = "market_reach"
    direction: str = "desc"
    preamble: str = ""
    source: str = "mock"
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "intent": self.intent,
            "target": {"kind": self.kind, "value": self.value},
            "metric": self.metric,
            "direction": self.direction,
            "preamble": self.preamble,
            "source": self.source,
            "notes": self.notes,
        }


def vocabulary(names: dict[str, list[str]]) -> str:
    """The only knowledge of the city the model gets: what things are called."""
    lines = []
    for label in ("categories", "districts", "plots", "markets"):
        values = names.get(label) or []
        if values:
            lines.append(f"{label.upper()} ({len(values)}):")
            lines.append("; ".join(values))
    return "\n".join(lines)


def parse(raw: str, names: dict[str, list[str]], source: str) -> Plan:
    """Turn a model reply into a Plan, refusing anything it made up.

    A model that names a category the city does not have would send the camera
    nowhere and print a code that does not exist, so an unknown target is
    dropped rather than passed through.
    """
    notes: list[str] = []
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text.split("\n", 1)[-1] if "\n" in text else text
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        return Plan(intent="unknown", source=source, notes=["no JSON in reply"])

    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        return Plan(intent="unknown", source=source, notes=[f"bad JSON: {exc.msg}"])

    plan = Plan(source=source)
    intent = str(data.get("intent") or "unknown").strip().lower()
    plan.intent = intent if intent in INTENTS else "unknown"
    if intent not in INTENTS:
        notes.append(f"unknown intent {intent!r}")

    target = data.get("target") or {}
    kind = str(target.get("kind") or "none").strip().lower()
    value = str(target.get("value") or "").strip()
    if kind in SCOPE_KINDS and value:
        known = {
            "category": _codes(names.get("categories", [])),
            "district": set(names.get("districts", [])),
            "plot": set(names.get("plots", [])),
            "market": set(names.get("markets", [])),
            "none": set(),
        }[kind]
        match = _match(value, known)
        if match:
            # Categories are addressed by code; everywhere else keeps its full
            # name, or "Software and Core" would arrive as "Software".
            plan.kind = kind
            plan.value = match.split(" ", 1)[0] if kind == "category" and " " in match else match
        else:
            notes.append(f"dropped invented {kind} {value!r}")

    # A single category cannot scope a question about a whole area.
    area_intents = ("gaps", "summary", "could_be", "night", "asks", "reset")
    if plan.intent in area_intents and plan.kind == "category":
        notes.append("category target ignored for an area question")
        plan.kind, plan.value = "none", ""

    metric = str(data.get("metric") or "").strip().lower()
    if metric in METRICS:
        plan.metric = metric
    direction = str(data.get("direction") or "").strip().lower()
    if direction in ("asc", "desc"):
        plan.direction = direction

    preamble = str(data.get("preamble") or "").strip()
    if any(ch.isdigit() for ch in preamble):
        notes.append("dropped a preamble containing figures")
        preamble = ""
    plan.preamble = preamble[:80]

    plan.notes = notes
    return plan


def _codes(categories: list[str]) -> set[str]:
    """Categories arrive as "A221 Spring 2/R"; both halves should resolve."""
    out: set[str] = set()
    for entry in categories:
        out.add(entry)
        code = entry.split(" ", 1)[0]
        if code:
            out.add(code)
    return out


def _norm(value: str) -> str:
    """Case, punctuation and spacing removed, so only the words are compared."""
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def _match(value: str, known: set[str]) -> str:
    """Return the vocabulary entry this value refers to, or nothing.

    Only ever returns something already in the vocabulary, so this cannot let
    an invented category through. What it does allow is the near miss: asked
    about batteries, a model answers "Batteries" where the list said "D504
    Batteries", and refusing that drops a correct answer on a technicality.

    A title shared by two categories is refused rather than guessed at, because
    flying to the wrong one of two is worse than admitting the question was
    ambiguous.
    """
    if value in known:
        return value
    lowered = {k.lower(): k for k in known}
    if value.lower() in lowered:
        return lowered[value.lower()]

    wanted = _norm(value)
    if not wanted:
        return ""

    whole = [k for k in known if _norm(k) == wanted]
    if len(whole) == 1:
        return whole[0]

    # "Batteries" for "D504 Batteries", but only when exactly one fits.
    titles = [k for k in known if " " in k and _norm(k.split(" ", 1)[1]) == wanted]
    return titles[0] if len(titles) == 1 else ""

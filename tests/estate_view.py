"""One estate's slice of city.json, shaped like a whole city.

The documents describe the Networks estate. They were written when it was the
only one, so their figures were the file's own totals and the checks compared
against those directly. With four estates on one sea the file's totals belong
to the region, and comparing a Networks sentence against a region figure fails
every assertion for the same uninteresting reason.

This hands back a view: the categories and districts of one estate, that
estate's totals, and counts recomputed over them. Every assertion written
against the single city keeps working, and keeps meaning what it meant.
"""

from __future__ import annotations

import json
import pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent

# The estate the published documents are about.
DOCUMENTED = "network"


def load() -> dict:
    return json.loads((REPO / "data" / "city.json").read_text(encoding="utf-8"))


def scoped(city: dict, estate_id: str = DOCUMENTED) -> dict:
    """The named estate, as a city in its own right.

    A file with no estates, or one holding only the estate asked for, is
    already that city and is handed back untouched.
    """
    estates = city.get("estates") or []
    if not estates or [e["id"] for e in estates] == [estate_id]:
        return city

    estate = next((e for e in estates if e["id"] == estate_id), None)
    if estate is None:
        raise KeyError(
            f"city.json carries no estate {estate_id!r}; it has "
            f"{[e['id'] for e in estates]}"
        )

    categories = [c for c in city["categories"] if c.get("estate") == estate_id]
    districts = [d for d in city["districts"] if d.get("estate") == estate_id]
    markets = sorted({m for c in categories for m in c["markets"]})

    view = dict(city)
    view["estates"] = [estate]
    view["categories"] = categories
    view["districts"] = districts
    view["totals"] = estate["totals"]
    view["meta"] = dict(city["meta"])
    view["meta"]["markets"] = markets
    view["meta"]["counts"] = {
        "estates": 1,
        "districts": len(districts),
        "plots": sum(len(d["plots"]) for d in districts),
        "categories": len(categories),
        "markets": len(markets),
    }
    return view

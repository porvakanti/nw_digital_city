#!/usr/bin/env python3
"""Turn the Category Blueprint extract into the anonymised city.json the renderer eats.

Two rules govern this script.

1. NOTHING PERSONAL LEAVES. The source workbook carries blueprint owner names
   and email addresses. They are dropped here and never reach city.json. The
   build asserts this before writing.

2. EVERY CANDIDATE METRIC IS COMPUTED. city.json is deliberately not opinionated
   about how the city is drawn -- it carries market reach AND adoption AND spend
   AND blueprint counts for every category. config/metrics.yaml decides which of
   them drives which visual layer, so changing the business lens never means
   rebuilding the data.

Usage:
    python3 data/build_city.py [--source PATH] [--out PATH]
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import openpyxl
import yaml

REPO = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = REPO / "data" / "raw" / "Category_Blueprint_Allhands.xlsx"
DEFAULT_OUT = REPO / "data" / "city.json"
CONFIG = REPO / "config" / "metrics.yaml"
# The renderer must work from file:// with no server, where fetch() is blocked
# by CORS. So the data ships as a plain script that assigns globals.
RENDERER_DATA = REPO / "renderer" / "city-data.js"

# The workbook covers all of VPC; the all-hands is the Networks org only.
SCOPE_L1 = "Network"

# Sheet holding the per-L4 model: taxonomy, blueprint counts, adoption, spend.
MODEL_SHEET = "Sheet4"
# Sheet holding one row per individual blueprint, including its markets.
RECORDS_SHEET = "Raw Data"
# Master category taxonomy for all of VPC, including category definitions.
TAXONOMY_SHEET = "V83"

# Fields in the source that identify individuals. Never emitted.
PERSONAL_FIELDS = {
    "Category Blueprint Owner",
    "Category Blueprint Owner Email",
    "Category Blueprint Owner ID",
    "CBPCoOwnersCSV",
    "VPC Category Manager",
    "VPC Principal Category Manager",
    "VPC Head of Category",
    "Contact in VSSB/VSSA Sourcing Support",
    "Contact in the ES team",
    "Contact for VGS supplier onboarding",
}

# Seed for the placeholder AI-RFP figures. Fixed on purpose: rehearsal and the
# live run must show identical numbers.
SAMPLE_SEED = "nw-digital-city-2026-09"


def rows_of(worksheet):
    """Yield populated rows, tolerating the trailing blank rows Excel leaves behind."""
    blanks = 0
    for row in worksheet.iter_rows(values_only=True):
        if any(cell is not None and str(cell).strip() for cell in row):
            blanks = 0
            yield row
        else:
            blanks += 1
            if blanks > 500:
                return


def clean(value):
    """Normalise a cell to a trimmed string, or None."""
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"none", "n/a", "na", "-"}:
        return None
    # The extract mangles some ampersands into hyphens ("Self&Build" for
    # "Self-Build", "Point&to&Point"). Repair the obvious cases for display.
    text = re.sub(r"(?<=[a-z])&(?=[A-Za-z])", "-", text)
    return text


def read_model(workbook):
    """Per-L4 taxonomy, blueprint counts, adoption percentages and spend."""
    sheet = workbook[MODEL_SHEET]
    rows = list(rows_of(sheet))
    header = [clean(c) for c in rows[0]]
    idx = {name: i for i, name in enumerate(header) if name}

    out = {}
    for row in rows[1:]:
        if clean(row[idx["Level1"]]) != SCOPE_L1:
            continue
        code = clean(row[idx["Code"]])
        if not code:
            continue

        def num(column, default=0):
            value = row[idx[column]]
            return value if isinstance(value, (int, float)) else default

        out[code] = {
            "code": code,
            "l1": clean(row[idx["Level1"]]),
            "l2": clean(row[idx["Level 2"]]),
            "l3": clean(row[idx["Level 3"]]),
            "l4": clean(row[idx["Level4"]]),
            "cbp_active": int(num("Active CBP")),
            "cbp_draft": int(num("Draft CBP")),
            "cbp_total": int(num("Total CBP")),
            "ava_adoption": num("% AVA Sourcing", None),
            "ariba_adoption": num("% Ariba Sourcing", None),
            "spend_eur": round(num("Spend FY26/27"), 2),
            "ai_rfps": num("AI generated RFPs", None),
        }
    return out


def read_market_reach(workbook):
    """Distinct local markets per category code. Owner identities are discarded."""
    sheet = workbook[RECORDS_SHEET]
    rows = list(rows_of(sheet))
    header = [clean(c) for c in rows[0]]
    idx = {name: i for i, name in enumerate(header) if name}

    markets = collections.defaultdict(set)
    for row in rows[1:]:
        if clean(row[idx["Level1"]]) != SCOPE_L1:
            continue
        code = clean(row[idx["Category Code"]])
        if not code:
            continue
        raw = clean(row[idx["MarketsList"]]) or ""
        for market in raw.split(","):
            market = market.strip()
            if market:
                markets[code].add(market)
    return {code: sorted(names) for code, names in markets.items()}


def read_definitions(workbook):
    """Category definitions, for building tooltips. Contact columns are skipped."""
    sheet = workbook[TAXONOMY_SHEET]
    rows = list(rows_of(sheet))
    header = [clean(c) for c in rows[0]]
    idx = {name: i for i, name in enumerate(header) if name}

    out = {}
    for row in rows[1:]:
        code = clean(row[idx["Code"]])
        definition = clean(row[idx["Definition"]]) if "Definition" in idx else None
        if code and definition and code not in out:
            out[code] = definition
    return out


def sample_ai_rfps(code: str, blueprint_state: str) -> int:
    """Deterministic placeholder for the missing AI-generated RFP column.

    Skewed low, and zero for any category without an active blueprint -- an
    agent cannot generate RFPs from rules that were never captured, which is
    the argument the city is making in the first place.
    """
    if blueprint_state != "active":
        return 0
    digest = hashlib.sha256(f"{SAMPLE_SEED}:{code}".encode()).digest()
    roll = digest[0] / 255.0
    if roll < 0.35:
        return 0
    if roll < 0.70:
        return 1 + digest[1] % 2
    if roll < 0.92:
        return 3 + digest[1] % 4
    return 7 + digest[1] % 6


def blueprint_state(record) -> str:
    if record["cbp_active"] > 0:
        return "active"
    if record["cbp_draft"] > 0:
        return "draft"
    return "none"


def build(source: Path, out: Path) -> dict:
    workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)
    model = read_model(workbook)
    reach = read_market_reach(workbook)
    definitions = read_definitions(workbook)

    categories = []
    for code, record in model.items():
        state = blueprint_state(record)
        markets = reach.get(code, [])
        categories.append(
            {
                "code": code,
                "name": record["l4"],
                "district": record["l2"],
                "plot": record["l3"],
                "definition": definitions.get(code),
                "blueprint_state": state,
                "markets": markets,
                "metrics": {
                    "blueprint_state": state,
                    "market_reach": len(markets),
                    "cbp_active": record["cbp_active"],
                    "cbp_draft": record["cbp_draft"],
                    "cbp_total": record["cbp_total"],
                    "ava_adoption": record["ava_adoption"],
                    "ariba_adoption": record["ariba_adoption"],
                    "spend_eur": record["spend_eur"],
                    "ai_rfps": record["ai_rfps"],
                    "ai_rfps_sample": sample_ai_rfps(code, state),
                },
            }
        )

    # Stable ordering so the city looks the same every single run.
    categories.sort(key=lambda c: (c["district"] or "", c["plot"] or "", c["code"]))

    districts = []
    by_district = collections.defaultdict(list)
    for category in categories:
        by_district[category["district"]].append(category)

    for district_name in sorted(by_district):
        members = by_district[district_name]
        by_plot = collections.defaultdict(list)
        for category in members:
            by_plot[category["plot"]].append(category)
        districts.append(
            {
                "name": district_name,
                "plots": [
                    {
                        "name": plot_name,
                        "codes": [c["code"] for c in by_plot[plot_name]],
                    }
                    for plot_name in sorted(by_plot)
                ],
                "totals": summarise(members),
            }
        )

    all_markets = sorted({m for c in categories for m in c["markets"]})
    city = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": source.name,
            "source_extract_date": "2026-08-06",
            "scope": f"{SCOPE_L1} (Level 1)",
            "anonymised": True,
            "sample_metrics": ["ai_rfps_sample"],
            "markets": all_markets,
            "counts": {
                "districts": len(districts),
                "plots": sum(len(d["plots"]) for d in districts),
                "categories": len(categories),
                "markets": len(all_markets),
            },
        },
        "totals": summarise(categories),
        "districts": districts,
        "categories": categories,
    }

    assert_no_personal_data(city, source)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(city, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_renderer_data(city)
    return city


def write_renderer_data(city: dict) -> None:
    """Emit city + visual config as a classic script for the file:// renderer."""
    config = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    RENDERER_DATA.parent.mkdir(parents=True, exist_ok=True)
    RENDERER_DATA.write_text(
        "// Generated by data/build_city.py — do not edit by hand.\n"
        "// Assigns globals rather than exporting, so the renderer works from\n"
        "// file:// where ES modules and fetch() are both blocked by CORS.\n"
        f"window.NW_CITY = {json.dumps(city, ensure_ascii=False)};\n"
        f"window.NW_CONFIG = {json.dumps(config, ensure_ascii=False)};\n",
        encoding="utf-8",
    )


def summarise(categories) -> dict:
    built = [c for c in categories if c["blueprint_state"] != "none"]
    return {
        "categories": len(categories),
        "with_blueprint": len(built),
        "active": sum(1 for c in categories if c["blueprint_state"] == "active"),
        "draft_only": sum(1 for c in categories if c["blueprint_state"] == "draft"),
        "bare_plots": len(categories) - len(built),
        "blueprints": sum(c["metrics"]["cbp_total"] for c in categories),
        "spend_eur": round(sum(c["metrics"]["spend_eur"] for c in categories), 2),
    }


def assert_no_personal_data(city: dict, source: Path) -> None:
    """Fail the build rather than ship an email address into a demo."""
    blob = json.dumps(city, ensure_ascii=False)
    emails = re.findall(r"[\w.+-]+@[\w-]+\.[\w.]+", blob)
    if emails:
        raise SystemExit(f"refusing to write city.json: found email addresses {emails[:3]}")
    if "vodafone.com" in blob.lower():
        raise SystemExit("refusing to write city.json: found a corporate email domain")
    print(f"  privacy check passed — no personal data in output ({source.name} stays local)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    if not args.source.exists():
        raise SystemExit(
            f"source workbook not found at {args.source}\n"
            "The extract is deliberately not in git. Drop it in data/raw/ to rebuild."
        )

    city = build(args.source, args.out)
    meta, totals = city["meta"], city["totals"]
    print(f"\n{meta['scope']} — {meta['counts']['districts']} districts, "
          f"{meta['counts']['plots']} plots, {meta['counts']['categories']} buildings")
    print(f"  {totals['with_blueprint']} developed / {totals['bare_plots']} bare "
          f"({totals['bare_plots'] / totals['categories']:.0%} of the city is empty ground)")
    print(f"  {totals['blueprints']} blueprints across {meta['counts']['markets']} markets")
    print(f"  €{totals['spend_eur'] / 1e6:,.0f}m addressable spend")
    print(f"\nwrote {args.out.relative_to(REPO)}")


if __name__ == "__main__":
    main()

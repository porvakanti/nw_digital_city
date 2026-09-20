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
import base64
import collections
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import openpyxl
import yaml

REPO = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = REPO / "data" / "raw" / "Category_Blueprint_Allhands.xlsx"
# The current per-category extract, and the newer of the two sources. Carries blueprint counts, spend, AI-generated RFPs and, since 9
# September, how many times each blueprint has actually been used. The older
# workbook is still needed for the market lists, the definitions and the
# category manager, none of which appear here.
DEFAULT_METRICS = REPO / "data" / "raw" / "Network_Digital_City__Data.xlsx"
DEFAULT_OUT = REPO / "data" / "city.json"
CONFIG = REPO / "config" / "metrics.yaml"
# The renderer must work from file:// with no server, where fetch() is blocked
# by CORS. So the data ships as a plain script that assigns globals.
RENDERER_DATA = REPO / "renderer" / "city-data.js"

# The extract covers all of VPC; this model is scoped to the Networks org.
SCOPE_L1 = "Network"

# Sheet holding the per-L4 model in the older workbook, kept as a fallback.
MODEL_SHEET = "Sheet4"
# The same model in the current extract, plus the CBP used column.
METRICS_SHEET = "Sheet1"
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


def read_model(workbook, sheet_name=MODEL_SHEET):
    """Per-L4 taxonomy, blueprint counts, adoption percentages, spend and usage.

    Reads either workbook. The columns are the same except that the current
    extract adds "CBP used", which is absent from older files and defaults to
    zero rather than failing, so a superseded extract still builds.
    """
    sheet = workbook[sheet_name]
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
            "cbp_used": int(num("CBP used")) if "CBP used" in idx else 0,
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



def load_config() -> dict:
    return yaml.safe_load(CONFIG.read_text(encoding="utf-8"))


def journey(record, config) -> dict:
    """Where this category sits on the journey, and what that is worth.

    Three independent components rather than one ladder, because the data says
    they are not sequential: five categories have started an AI-generated RFP
    without ever using their blueprint, and one has used its blueprint with no
    AI at all. Every threshold lives in config/metrics.yaml.
    """
    score = config["score"]

    if record["cbp_active"] > 0 and record["cbp_total"] >= 2:
        step = "connected"
    elif record["cbp_active"] > 0:
        step = "live"
    elif record["cbp_draft"] > 0:
        step = "drafted"
    else:
        step = "none"
    rung = next(r for r in score["blueprint"] if r["id"] == step)

    def banded(key, value):
        for band in score[key]:
            if band["max"] is None or value <= band["max"]:
                return band
        return score[key][-1]

    used = banded("usage", record["cbp_used"])
    ai = banded("ai", record["ai_rfps"] or 0)
    return {
        # No "stage" here. It used to carry the blueprint rung's own stage,
        # which is not the category's stage and disagreed with the arc: A251
        # at 100 out of 100 came out labelled "connected" and A213 at 85 came
        # out "traditional". A category's stage is a band of the total, it is
        # computed from the config where the rail is drawn, and nothing read
        # this field. A number in the published data that contradicts the
        # screen is worse than no number.
        "blueprint": rung["points"],
        "usage": used["points"],
        "ai": ai["points"],
        "total": rung["points"] + used["points"] + ai["points"],
        "labels": {"blueprint": rung["label"], "usage": used["label"], "ai": ai["label"]},
    }


def read_managers(workbook, config) -> dict:
    """Who owns each category, at whatever level of detail the config allows.

    `people.show` is one word in config/metrics.yaml and it decides what leaves
    this build: full names, initials, or nothing at all. Email addresses are
    refused at every setting, here and in the check before writing.
    """
    show = (config.get("people") or {}).get("show", "none")
    if show == "none":
        return {}
    column = config["people"].get("source_column", "VPC Category Manager")

    sheet = workbook[TAXONOMY_SHEET]
    rows = rows_of(sheet)
    header = [clean(c) for c in next(rows)]
    idx = {name: i for i, name in enumerate(header) if name}
    if column not in idx:
        print(f"  no {column!r} column; categories will have no owner")
        return {}

    out = {}
    for row in rows:
        if clean(row[idx["Level1"]]) != SCOPE_L1:
            continue
        code = clean(row[idx["Code"]])
        cell = clean(row[idx[column]])
        if not code or not cell or "@" in cell:
            continue
        people = split_people(cell)
        if people:
            out[code] = people if show == "names" else [initials(p) for p in people]

    everyone = {p for names in out.values() for p in names}
    shared = sum(1 for names in out.values() if len(names) > 1)
    print(f"  owners: {len(everyone)} people across {len(out)} categories "
          f"({shared} shared between more than one) as '{show}'")
    return out


PLACEISH = re.compile(r"^[A-Z]{2,4}\d*$")   # EG, TZ, DE91, VGS: a market, not a person


def split_people(cell: str) -> list[str]:
    """Pull the individual people out of one category-manager cell.

    The column is not one name per category. It ranges from a single person to
    several, each annotated with the markets they cover, with inconsistent
    punctuation:

        Rivas ( EG, TZ, SA), Samaka  (UK, TR,CZ), Han (DE, ES) Chaitra
        (Partner Market : (DE91, CZ91, HU91))

    Left as raw strings these become leaderboard rows nobody can read, and
    counting them as one person each undercounts by three. So the market lists
    are stripped and the remainder split. Anything carrying a digit or shaped
    like a market code is dropped rather than guessed at.
    """
    text = re.sub(r"\([^)]*\)?", ",", cell)
    text = re.sub(r"\bPartner Market\b.*", "", text, flags=re.IGNORECASE)
    people, seen = [], set()
    for part in re.split(r"[,/;]| and ", text):
        part = " ".join(part.split())
        if len(part) < 3 or any(ch.isdigit() for ch in part) or PLACEISH.match(part):
            continue
        if part.lower() not in seen:
            seen.add(part.lower())
            people.append(part)
    return people


def initials(person: str) -> str:
    """Reduce a full name to initials: "Ada Lovelace" becomes "A.L."

    Enough to tell two people apart in a ranking, not enough to be a
    directory. Used when people.show is set to `initials`.
    """
    parts = [p for p in re.split(r"[\s,]+", person) if p and p[0].isalpha()]
    return ".".join(p[0].upper() for p in parts[:3]) + "." if parts else ""


def assign_landmarks(categories, config) -> None:
    """Give the best-performing categories a monument from a market that
    actually adopted them.

    Two rules, and both matter. The threshold is the composite score, so a
    monument marks progress rather than spread: a blueprint live in many
    markets and used by none of them is not an achievement. The shape is drawn
    from a market that adopted it, so the monument says where it travelled
    rather than decorating.

    A market may supply more than one monument, because a market carrying
    several high scorers would otherwise leave the lower-scoring ones with
    nothing. Each monument is still used once, highest score first, so the
    strongest performer gets the first choice from its markets.
    """
    rules = config.get("landmarks") or {}
    floor = rules.get("min_score", 50)
    cap = rules.get("max_landmarks")
    by_market = rules.get("by_market") or {}

    qualifying = sorted(
        (c for c in categories
         if c["blueprint_state"] == "active" and c["journey"]["total"] >= floor),
        key=lambda c: (-c["journey"]["total"], c["code"]),
    )
    # Scores only go up, so the threshold alone does not keep a monument
    # scarce: it says who is eligible, and this says how many there are. The
    # highest scorers keep them, and a category below the cut has earned its
    # height and its houses without earning a monument.
    eligible = qualifying if cap is None else qualifying[:cap]
    taken = set()
    for category in eligible:
        placed = False
        for market, monuments in by_market.items():
            if market not in category["markets"]:
                continue
            for monument in monuments:
                if monument["name"] in taken:
                    continue
                taken.add(monument["name"])
                category["landmark"] = {
                    "name": monument["name"],
                    "shape": monument["shape"],
                    "market": market,
                    "because": (f"scores {round(category['journey']['total'])} out of "
                                f"100, and {market} has adopted this blueprint"),
                }
                placed = True
                break
            if placed:
                break

    named = [c for c in categories if c.get("landmark")]
    short = [c["code"] for c in eligible if not c.get("landmark")]
    over = len(qualifying) - len(eligible)
    print(f"  landmarks: {len(named)} of {len(qualifying)} qualifying at {floor}+ "
          + ", ".join(f"{c['code']} {c['landmark']['name']}" for c in named))
    if over:
        # Not a warning. Holding the count is what the cap is for, and the
        # lowest scorers are the right ones to hold back.
        print(f"  {over} more qualified and were held back by the cap of {cap}")
    if short:
        # Loud, because a category inside the cap with no market we can depict
        # is a gap in the configuration, not a property of the data.
        print(f"  WARNING: no monument available for {', '.join(short)}")


def blueprint_state(record) -> str:
    if record["cbp_active"] > 0:
        return "active"
    if record["cbp_draft"] > 0:
        return "draft"
    return "none"


def sample_metrics(config: dict) -> list[str]:
    """Which metrics the registry admits are not real, and drive something.

    Published so the renderer can badge them and nobody can present a
    placeholder as fact. Derived from the config rather than listed here: a
    hand-kept list is one edit away from declaring a fabricated column real,
    and that edit is invisible until the figure is already being presented.
    """
    bound = {(layer or {}).get("metric") for layer in (config.get("layers") or {}).values()}
    return sorted(
        name for name, spec in (config.get("metrics") or {}).items()
        if (spec or {}).get("sample") and name in bound
    )


def build(source: Path, out: Path, metrics: Path | None = None) -> dict:
    config = load_config()
    workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)

    # The refreshed extract is the model when present; the older workbook
    # still supplies the markets, the definitions and the category manager.
    if metrics and metrics.exists():
        refreshed = openpyxl.load_workbook(metrics, read_only=True, data_only=True)
        model = read_model(refreshed, METRICS_SHEET)
        print(f"  model from {metrics.name} ({len(model)} categories)")
    else:
        model = read_model(workbook)
        print(f"  model from {source.name} (no refresh found)")

    reach = read_market_reach(workbook)
    definitions = read_definitions(workbook)
    managers = read_managers(workbook, config)

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
                "owners": managers.get(code) or [],
                "journey": journey(record, config),
                "metrics": {
                    "blueprint_state": state,
                    "market_reach": len(markets),
                    "cbp_active": record["cbp_active"],
                    "cbp_draft": record["cbp_draft"],
                    "cbp_total": record["cbp_total"],
                    "ava_adoption": record["ava_adoption"],
                    "ariba_adoption": record["ariba_adoption"],
                    "spend_eur": record["spend_eur"],
                    "ai_rfps": record["ai_rfps"] or 0,
                    "cbp_used": record["cbp_used"],
                    # The composite score is carried as a measure as well as
                    # under "journey", so config/metrics.yaml can bind a
                    # visual layer to it without the renderer special-casing
                    # where the value lives.
                    "journey_score": journey(record, config)["total"],
                },
            }
        )

    # Stable ordering so the city looks the same every single run.
    categories.sort(key=lambda c: (c["district"] or "", c["plot"] or "", c["code"]))
    assign_landmarks(categories, config)

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
                "totals": summarise(members, config),
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
            "sample_metrics": sample_metrics(config),
            "people": (config.get("people") or {}).get("show", "none"),
            "markets": all_markets,
            "counts": {
                "districts": len(districts),
                "plots": sum(len(d["plots"]) for d in districts),
                "categories": len(categories),
                "markets": len(all_markets),
            },
        },
        "totals": summarise(categories, config),
        "districts": districts,
        "categories": categories,
    }

    assert_no_personal_data(city, source, config)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(city, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_renderer_data(city)
    return city


def inline_vest_mark(config: dict) -> None:
    """Turn a file path in city.vest_mark into a data URI.

    The renderer draws whatever this value points at on the front of the
    builder's vest, and it has to work from a single self-contained HTML file
    where nothing can be fetched. So the config names a file and the build
    inlines it, which keeps a 23KB base64 blob out of a config a person is
    meant to read and edit.

    `speechmark`, `none` and an already-inlined data URI are passed through
    untouched. A named file that is missing is an error rather than a silent
    fallback: a vest quietly losing its mark is exactly the kind of thing that
    goes unnoticed until it is on a screen in front of people.
    """
    mark = str((config.get("city") or {}).get("vest_mark") or "").strip()
    if not mark or mark in {"none", "speechmark"} or mark.startswith("data:"):
        return
    if "/" not in mark and "\\" not in mark:
        return  # any other bare word is a name, set as text on a badge
    asset = (REPO / mark).resolve()
    if not asset.is_file():
        raise SystemExit(f"city.vest_mark points at {mark}, which does not exist")
    kind = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".webp": "image/webp", ".svg": "image/svg+xml"}.get(asset.suffix.lower())
    if not kind:
        raise SystemExit(f"city.vest_mark: {asset.suffix} is not a web image format")
    encoded = base64.b64encode(asset.read_bytes()).decode("ascii")
    config["city"]["vest_mark"] = f"data:{kind};base64,{encoded}"
    print(f"  vest mark: {mark} inlined, {len(encoded) // 1024}KB encoded")


def write_renderer_data(city: dict) -> None:
    """Emit city + visual config as a classic script for the file:// renderer."""
    config = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    inline_vest_mark(config)
    RENDERER_DATA.parent.mkdir(parents=True, exist_ok=True)
    RENDERER_DATA.write_text(
        "// Generated by data/build_city.py. Do not edit by hand.\n"
        "// Assigns globals rather than exporting, so the renderer works from\n"
        "// file:// where ES modules and fetch() are both blocked by CORS.\n"
        f"window.NW_CITY = {json.dumps(city, ensure_ascii=False)};\n"
        f"window.NW_CONFIG = {json.dumps(config, ensure_ascii=False)};\n",
        encoding="utf-8",
    )


def roll_up(categories, config) -> dict:
    """One score for a group of categories.

    Weighted by the square root of spend, which sits between two failure
    modes. Raw spend lets one large category carry a district that has done
    nothing on everything else; equal weighting punishes anyone holding a big
    portfolio. Fixed shows both: eleven of its twelve categories score zero
    and the twelfth scores 60 on EUR 62.5m, so it ranks 2nd of the eight
    districts under raw spend, 8th under equal weighting, and 4th under the
    square root. The floor keeps zero-spend categories counting for something.
    """
    if not categories:
        return {"total": 0, "blueprint": 0, "usage": 0, "ai": 0}
    rules = config["score"]["rollup"]
    floor = rules.get("floor_eur", 1_000_000)

    def weight(category):
        value = max(category["metrics"].get(rules["weight_by"], 0) or 0, floor)
        return value ** 0.5 if rules.get("transform") == "sqrt" else value

    total_weight = sum(weight(c) for c in categories)
    out = {}
    for part in ("blueprint", "usage", "ai", "total"):
        out[part] = round(
            sum(c["journey"][part] * weight(c) for c in categories) / total_weight, 1
        )
    return out


def summarise(categories, config=None) -> dict:
    built = [c for c in categories if c["blueprint_state"] != "none"]
    out = {
        "categories": len(categories),
        "with_blueprint": len(built),
        "active": sum(1 for c in categories if c["blueprint_state"] == "active"),
        "draft_only": sum(1 for c in categories if c["blueprint_state"] == "draft"),
        "empty_lots": len(categories) - len(built),
        "blueprints": sum(c["metrics"]["cbp_total"] for c in categories),
        # Coverage against adoption: blueprints written, against blueprints used.
        "in_use": sum(1 for c in categories if c["metrics"]["cbp_used"] > 0),
        "ai_started": sum(1 for c in categories if (c["metrics"]["ai_rfps"] or 0) > 0),
        "spend_eur": round(sum(c["metrics"]["spend_eur"] for c in categories), 2),
    }
    if config:
        out["journey"] = roll_up(categories, config)
    return out


def assert_no_personal_data(city: dict, source: Path, config: dict) -> None:
    """Fail the build rather than ship something that should not leave.

    Contact details are refused at every setting, without exception. Names are
    a decision, taken in config/metrics.yaml, and this check enforces whichever
    way it was taken: with `people.show: none` a name appearing anywhere is a
    bug, and with `names` or `initials` the owner field is the only place one
    is allowed to be.
    """
    blob = json.dumps(city, ensure_ascii=False)

    # Never, at any setting.
    emails = re.findall(r"[\w.+-]+@[\w-]+\.[\w.]+", blob)
    if emails:
        raise SystemExit(f"refusing to write city.json: found email addresses {emails[:3]}")
    if "vodafone.com" in blob.lower():
        raise SystemExit("refusing to write city.json: found a corporate email domain")

    show = (config.get("people") or {}).get("show", "none")
    owners = {p for c in city["categories"] for p in c.get("owners", [])}
    if show == "none":
        if owners:
            raise SystemExit(
                f"refusing to write city.json: people.show is 'none' but "
                f"{len(owners)} owners are in the output"
            )
        print(f"  privacy check passed: no names, no contacts ({source.name} stays local)")
        return

    # Names are allowed here, and only here. Anything that looks like a person
    # in a field other than `owner` is an accident.
    stripped = json.dumps(
        [{k: v for k, v in c.items() if k != "owners"} for c in city["categories"]],
        ensure_ascii=False,
    )
    leaked = sorted(o for o in owners if o and o in stripped)
    if leaked:
        raise SystemExit(
            f"refusing to write city.json: owner names appear outside the owner "
            f"field ({leaked[:3]})"
        )
    print(f"  privacy check passed: {len(owners)} owners as '{show}', no contacts. "
          f"This file now identifies people; set people.show to 'none' to stop that.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--metrics", type=Path, default=DEFAULT_METRICS,
                        help="the refreshed per-category extract, if there is one")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    if not args.source.exists():
        raise SystemExit(
            f"source workbook not found at {args.source}\n"
            "The extract is deliberately not in git. Drop it in data/raw/ to rebuild."
        )

    city = build(args.source, args.out, args.metrics)
    meta, totals = city["meta"], city["totals"]
    print(f"\n{meta['scope']}: {meta['counts']['districts']} districts, "
          f"{meta['counts']['plots']} plots, {meta['counts']['categories']} buildings")
    print(f"  {totals['with_blueprint']} developed / {totals['empty_lots']} empty lots "
          f"({totals['empty_lots'] / totals['categories']:.0%} of the city is empty ground)")
    print(f"  {totals['blueprints']} blueprints across {meta['counts']['markets']} markets")
    print(f"  €{totals['spend_eur'] / 1e6:,.0f}m addressable spend")
    print(f"\nwrote {args.out.relative_to(REPO)}")


if __name__ == "__main__":
    main()

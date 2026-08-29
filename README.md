# NW Digital City

An agent that turns the Networks category blueprint estate into a city you can
walk through: districts, plots and lots that develop according to how each
category is doing. Built for the Networks all-hands, September 2026.

Ask it about a category in plain English and it finds it, reasons about it, and
builds it in front of you.

The reasoning behind all of this, the data caveats, and the questions still
open are written up in [docs/DESIGN.md](docs/DESIGN.md).

## The metaphor

Four measures from the category blueprint story, four things you can see:

| Measure | What you see | Driven by |
| --- | --- | --- |
| Foundation | empty lot, then marked out, then foundation laid | blueprint status |
| Building | small building, office block, tower, skyscraper | blueprint reach *(provisional)* |
| Property | Monopoly-style houses, then a hotel | spend FY26/27 |
| Smart city | rooftop reactor, from dark to full glow | AI-generated RFPs *(sample data)* |

Geography follows the category tree: **L2 is a district, L3 is a plot, L4 is a
lot** with a building on it. For Networks that is 8 districts, 31 plots and 145
lots, of which 89 are still empty ground.

## The pivot point

`config/metrics.yaml` decides which metric drives which visual layer.
`data/city.json` carries *every* candidate metric for every category, so the
business lens can change without rebuilding any data:

```yaml
layers:
  height:
    metric: market_reach     # → ava_adoption, cbp_total, spend_eur
```

Change that line and the skyline, the legend and the on-screen explanation all
follow. Tests fail if a layer points at a metric the data does not carry.

### Why height is "blueprint reach" and not AVA adoption

In the current extract `% AVA Sourcing` reads a flat **100% for all 145
categories**, which would make every building a maxed-out skyscraper and leave
the skyline saying nothing. Blueprint reach counts how many local markets have
adopted the blueprint, which is how the brief defines adoption. That figure is
real, it spreads from 1 to 16, and it tells a truer story. It is badged as provisional in
the UI, and swaps back to `ava_adoption` in one line when real figures land.

### Honesty rules

Anything not real is badged in the UI. `ai_rfps` is placeholder data until the
real column arrives. It is seeded from a fixed value, so rehearsal and stage
show identical numbers. The smart-city layer is a **readiness signal, not a claim
that autonomous procurement is live.**

## Privacy

The source workbook contains blueprint owner names and email addresses.

- `data/raw/` is git-ignored. **The workbook never gets committed.**
- `data/city.json` is derived and anonymised: no names, no emails, no contacts.
- The build refuses to write output if it detects either, and tests re-check it.

## Layout

```
config/metrics.yaml    which metric drives which visual layer
data/build_city.py     workbook to anonymised city.json
data/city.json         the only data the renderer needs
renderer/city.js       the brick city, the builder, the choreography
renderer/agent.js      the tools, the resolver, the visible trace
tests/                 privacy and data integrity, plus a browser smoke test
```

The renderer is deliberately dependency-free at runtime. It is the on-stage
safety net: if the venue wifi dies, the city still opens from a local file.

## Running it

```bash
python3 -m pip install openpyxl pyyaml
python3 data/build_city.py          # rebuild city.json from data/raw/
python3 -m unittest discover -s tests -v

npm i playwright                    # once
node tests/smoke.js                 # rehearsal check: drives the real page
```

`tests/smoke.js` is the pre-stage check. It loads the city in a real browser,
asserts the resolver finds what people are likely to shout, and confirms the
agent actually moves the city rather than only describing it.

## Status

- [x] Data pipeline, metric registry, privacy guards
- [x] Renderer, the brick city (isometric, click-to-inspect, `NWCity.focus()`)
- [x] Build choreography, opening city rise, per-category teardown and rebuild
- [x] The character, minifigure, idle wander, flight, speech bubble and caption
- [x] Agent, natural language in, city out, with a visible tool trace
- [ ] Model adapter, speech input, offline bundle
- [ ] Real AI-RFP data, rehearsal mode

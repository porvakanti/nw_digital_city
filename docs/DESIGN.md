# NW Digital City, design decisions

Why this is built the way it is. The README says what the thing is; this says
what we chose, what we rejected, and what we are still unsure about.

Written for whoever picks this up next, including us in three weeks, on a
stage, when something has gone wrong.

---

## 1. The idea

Kate's proposal: turn the Networks category blueprint estate into a city. Each
category is a plot of land; how well the category is doing decides what stands
on it. The all-hands audience sees their own area of the business as a place,
and the agent builds it in front of them.

The deck's framing is **one city, four connected measures**:

| # | Measure | What you see | Meaning |
|---|---------|--------------|---------|
| 1 | Category | foundation | blueprint maturity and captured rules |
| 2 | Capability | building height | putting the digital asset to work |
| 3 | Value | houses and hotels | commercial scale of sourcing |
| 4 | Adoption | rooftop reactor | structured rules, autonomy readiness |

## 2. Vocabulary, and why it is now fixed

The category tree maps onto the city like this:

| Level | City | Networks has |
|-------|------|--------------|
| L2 | **district** | 8 |
| L3 | **plot** | 31 |
| L4 | **lot** (and the building on it) | 145 |

We got this wrong once. The agent called L4 categories "plots" as well, so
Energy read as *"7 of 18 plots developed"* when Energy has **four** plots
holding **eighteen** categories. A single building site is a **lot**;
**plot** only ever means L3. Districts hold plots, plots hold lots.

An **empty lot** is an L4 category with **no blueprint at all**, not draft,
not active. 89 of the 145.

## 3. Data decisions

Source: `Category_Blueprint_Allhands.xlsx`, extracted 2026-08-06. Three sheets
matter: `Sheet4` (the per-L4 model), `Raw Data` (one row per blueprint, with
markets), `V83` (the VPC-wide taxonomy, for category definitions).

### 3.1 Height is blueprint reach rather than AVA adoption

`% AVA Sourcing` reads **100% for all 145 categories** and `% Ariba Sourcing`
reads **0% for all 145**. Driving height from that makes every building a
maxed-out skyscraper and the skyline says nothing at all.

Kate's brief notes that adoption is measured as one blueprint per L4 per local
market. So we count **distinct markets with a blueprint** instead. That is real
data, it spreads from 1 to 16, and it tells a truer story. A221 Spring 2/R is
adopted in 16 markets and towers over everything.

It is **badged provisional in the UI**, and swaps back to `ava_adoption` with a
one-line config change the moment real figures exist.

### 3.2 Spend thresholds are rescaled for Networks

The deck's ladder tops out at *>€100m = hotel*. Networks' largest single
category is **€75m**, so on the original thresholds there would not be one
hotel in the entire city, and 122 of 145 categories would collapse into the
bottom rung. Rescaled to round numbers that fit the actual distribution:

```
1 house  <€1m      2 houses €1-5m      3 houses €5-20m
4 houses €20-50m   hotel   >€50m
```

That yields six hotels, which keeps them rare and meaningful.

### 3.3 AI-generated RFPs are seeded placeholders

The column is empty in the extract. The placeholder is derived from a fixed
seed so **rehearsal and the live run show identical numbers**, and it is zero
for any category without an active blueprint. An agent cannot generate RFPs
from rules nobody captured, which is the argument the city is making.

It is badged **sample data** in the UI. It must be impossible to present
placeholder numbers as fact to 400 people.

### 3.4 Known data gaps

- **A221 has 16 markets and €0 spend.** Our tallest building has no houses.
  Probably unmapped rather than truly zero. Worth asking.
- 69 of the 89 empty lots show €0 spend. The other 20 carry €176m between
  them, which is the number the "city we could be" view is built on.
- Extract is a month old; a fresher pull before the all-hands would help.

## 4. Privacy

The workbook contains blueprint owner names and email addresses.

- `data/raw/` is git-ignored. **The workbook is never committed.**
- `data/city.json` is derived and anonymised: no names, emails or contacts.
- The build **refuses to write output** if it detects an email address or a
  corporate domain, and the tests re-check the committed file.

If we ever want named "architects" on buildings, which would tie nicely to the
minifigures Gorkem is handing out, that needs the agreement of the people
named.

## 5. Architecture

```
config/metrics.yaml    which metric drives which visual layer
data/build_city.py     workbook → anonymised city.json (+ renderer/city-data.js)
renderer/city.js       the brick city, the builder, the choreography
renderer/agent.js      tools, resolution, the visible trace
tests/                 privacy + data integrity (python), smoke test (browser)
```

### 5.1 The pivot point

`city.json` carries **every candidate metric for every category**.
`config/metrics.yaml` decides which one drives which visual layer. Changing the
business lens is one line:

```yaml
layers:
  height:
    metric: market_reach     # → ava_adoption, cbp_total, spend_eur
```

No data rebuild, no code change. Legend text, units and tier names all derive
from the same config, so the on-screen explanation cannot drift from what is
drawn, and a test fails if a layer points at a metric the data lacks.

### 5.2 Why the renderer runs from `file://`

`file://` blocks ES modules **and** `fetch()` under CORS. So three.js is
vendored and the data is emitted as a plain script assigning globals rather
than loaded. That is deliberate: the entire city opens from a local file with
**no server and no network**. If the venue wifi dies mid-demo, the city still
runs. It also means the whole thing can be emailed to someone on a beach.

### 5.3 Instancing

Every piece of one shape is drawn as a single `InstancedMesh`: bricks, studs,
plates, houses, ghosts, roads, kerbs, trees and lamps. A few thousand pieces cost
a handful of draw calls. Only the 34 pedestrians and the builder are
individually animated.

Building a category means **rewriting instance matrices on a wall-clock
timeline**, not adding geometry. That is what lets one building be torn down
and reassembled without its neighbours flickering.

### 5.4 Timing is wall-clock, not per-frame

The first version eased the camera by a fixed amount per frame. On a slow
machine that runs in slow motion. Everything is now timed in seconds, so the
choreography holds on whatever hardware the venue provides.

## 6. Visual language

**Monopoly supplies the mechanics**: districts, plots, the houses-to-hotel
escalation, the property kerb. **Lego supplies the surface**: studs, chunky
bricks, a baseplate grid. The Monopoly pieces are themselves brick-built so the
two read as one object.

**Colour carries meaning in exactly one place: blueprint status**, using
reserved status roles (muted / warning / good). District hue is *reinforcement
only*. Every district also has a printed name plate and its own ground, so
identity never rests on separating eight hues on a projector. The measures that
must be read exactly (status, height, houses, reactor) stay on shape, height
and count.

Houses and the hotel differ in **silhouette**, not only colour: a house is a
small cube under a pitched roof, a hotel is a long two-storey block. Colour
alone could not be read at the distance the room watches from.

Streets, parkland, lamp posts, traffic and pedestrians encode **nothing**. They exist so
the place reads as a place, which is what makes an empty lot feel like empty
ground rather than a missing bar on a chart.

Trademark note: LEGO and the Iron Man arc reactor are other people's marks. The
aesthetic is fine for an internal all-hands; the names and logos should stay
out of anything that circulates. Internally it is the **reactor**, and the
product is **NW Digital City**.

## 7. The agent

An agent has tools and the freedom to choose among them. So:

```
find_category(query)    resolve messy text → lot / plot / district / market
get_metrics(code)       the four measures for one category
rank(scope, metric, dir) order a scope by any metric
find_gaps(scope)        empty lots, by spend
summarise(scope)        built / empty / spend for a scope
render(action, arg)     drive the camera and the build
```

**The tool calls are shown on screen as they run.** "Trust me, it's thinking"
is not an argument a room of 400 people has to accept. Calls over 145 rows are
near-instant and would flash past unread, so each is held briefly. The calls
themselves are real; only the pacing is presentation, and real model latency
will replace it.

### 7.1 Resolution scores both directions

Scoring only how much of the *query* matched sent *"how is energy doing"* to a
category whose name happens to contain the word, because one matched token out
of one looks perfect. Weighing how much of the *target* was covered lets the
district actually called Energy win. That is the difference between surviving
an open floor and dying on it.

### 7.2 The fallback ladder

```
model  →  deterministic parser  →  preset chips  →  local HTML file
```

Every rung works on its own. The deterministic layer is not scaffolding to be
deleted; it is what runs if the endpoint is unreachable on the day.

### 7.3 The model will never see the numbers

Planned split: the model receives the **question and the list of names** and
decides which tool to call. The tools then execute **locally** against
`city.json`. Spend figures never leave the browser.

This is better engineering as well as safer. The model does intent, the code
does arithmetic, and commercially sensitive figures are not sent to a third
party while we are still building against a temporary endpoint.

## 8. On-stage design

Speech recognition was considered and **cut**. The venue mic feeds the PA, not
the laptop; ASR would mangle "A221" across accents and crowd noise; and a
failed transcription is dead air in front of 400 people. It buys nothing
either, because speech does not read as "AI" any more. The intent layer takes a string, so it
can be added later for the desktop version where mic conditions are fine.

**The agent writes; the presenter speaks.** Findings appear in the builder's
speech bubble and in a lower-third caption sized to read from the back of the
room. Gorkem reads it, argues with it, or lets it sit.

The choreography, per request: establish wide → fly → tear down that one
building → rebuild it **in the order of the four measures** → settle. The build
order is the point: after two or three categories the room can read the city
without the legend.

**The strongest moment is a failure.** Fly to a bare lot and the builder cannot
build. A311 Field Maintenance: €75m of spend, no blueprint, nothing to build
with. That is the argument for blueprints delivered by the demo instead of by a
slide.

## 8a. A bug worth remembering

The reactor layer was bound to `ai_rfps`, the real column, which is null for
all 145 categories because the data has not arrived. Every rooftop therefore
resolved to the "Dark" tier and no reactor was ever drawn, while the legend
advertised four states. Nothing failed and nothing logged; the city just
quietly rendered three measures out of four.

It is now bound to `ai_rfps_sample`, and a test asserts that every bound layer
points at a column that has values and varies. Flip the binding back to
`ai_rfps` when the real figures land.

The general lesson: the configurable-layer design means a layer can be pointed
at nothing at all, and the failure is silent. The test is the guard.

## 8b. The city we could be

A projection, not a forecast, and drawn in a translucent material so it can
never be confused with what has been built.

Every undeveloped lot rises to the height its own record justifies. A drafted
lot is sized by the reach its blueprint already has, because the work is done
and only activation is missing. An empty lot is sized by the spend sitting on
it. A lot with neither stays an outline, because nothing on record justifies a
building there.

That is 32 lots: 12 drafts, and 20 categories carrying €176m with no blueprint
at all. Press P, or ask the agent what we could build.

## 8c. The model layer

The renderer is a static page, so a browser calling a model directly would have
to carry the credential where anyone can read it. A small proxy holds the key,
adds the prompt and returns a decision. That proxy is the only thing that ever
gets deployed, and it is the same container on a laptop, on Cloud Run and in
the internal environment.

**The model never sees the numbers.** It gets the question and the vocabulary,
names only, and returns an intent and a target. The tools then run in the
browser against city.json. The model does understanding, the code does
arithmetic. That means no figure on screen can be invented, and no spend figure
leaves the laptop while we build against a temporary endpoint.

**Nothing it says is trusted.** An invented category is dropped, a category
offered as the scope of an area question is ignored, a preamble containing
digits is discarded, and an unparseable reply becomes an unknown intent, which
falls back to the browser's own rules. `/plan` never returns an error to the
caller, because a 500 on the day would take the demo down with it.

**Both paths meet in the same place.** The local rules and the model both end
up calling the same run functions, so the two cannot drift apart and the
fallback behaves like the real thing.

`app/eval.py` runs 29 likely questions against whichever provider is
configured. Run it against the mock while building and against the real
endpoint before the all-hands.

## 9. Open questions

For Kate, on the data and the framing (1 to 5 and 7). Question 6 needs
whoever owns the GCP environment; Tomas is in Customer Value, not infra.

1. Is 100% AVA adoption real, or a placeholder? Is there a per-L4 figure?
2. When do real AI-generated RFP figures land, and in what shape?
3. Are the rescaled spend thresholds acceptable?
4. Is €0 spend on A221 and the empty lots a data gap?
5. Confirm we are comfortable showing that 61% of the city is empty.
6. Which Vertex AI models are available in the internal environment, and what
   is the approval path to deploy a container there?
7. Which categories will be called on the day, so they can be pre-cached?

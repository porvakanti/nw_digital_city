# Architecture and design decisions

Why NW Digital City is built the way it is: what was chosen, what was
rejected, and what remains uncertain. `README.md` covers what the application
is and how to run it.

Written for whoever maintains this next.

---

## 1. The idea

Turn the Networks category blueprint estate into a city. Each category is a
plot of land, and how the category is performing decides what stands on it. An
audience sees its own area of the business as a place, and the agent builds it
on request.

The source brief frames this as **one city, four connected measures**:

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

The distinction is enforced because conflating the two produced wrong output:
with L4 categories also called "plots", Energy read as *"7 of 18 plots
developed"* when Energy has **four** plots holding **eighteen** categories. A single building site is a **lot**;
**plot** only ever means L3. Districts hold plots, plots hold lots.

An **empty lot** is an L4 category with **no blueprint at all**, not draft,
not active. 89 of the 145.

## 3. Data decisions

Two sources, both held only in the git-ignored `data/raw/` directory.

| File | Provides |
| --- | --- |
| `Network_Digital_City__Data.xlsx` | The current per-category model: blueprint counts, spend, AI-generated RFPs, blueprint usage |
| `Category_Blueprint_Allhands.xlsx` | Market lists per blueprint (`Raw Data`), category definitions and the category manager (`V83`) |

The build prefers the refreshed model and falls back to the older workbook's
`Sheet4` if it is absent, so a superseded extract still produces a city.

### 3.1 Height is the composite score, not an adoption figure

`% AVA Sourcing` reads **100% for all 145 categories** and `% Ariba Sourcing`
reads **0% for all 145**. Driving height from either makes every building
identical and the skyline says nothing.

Height was blueprint reach for a time, counting distinct markets with a
blueprint, which is how the source brief defines adoption. That was the weaker
choice for two reasons.

**It is a count with no denominator.** Nothing in any source states which
markets a category applies to, so a category live in both of the two markets
where it is relevant scores worse than one live in five of twenty. Every
candidate column was checked: `MarketsList` and `OrgCodesCSV` carry one market
per blueprint record, `Entity Type` is Global for 111 of the 112 records, and
`TST Scope` is a different programme's scope, its "Excluded" set holding 19
blueprints and €483m of the €760m. There is no applicability denominator to be
had.

**And it barely varied.** 48 of the 56 buildings sat at reach 1 or 2, so the
skyline was 48 near-identical low blocks and four outliers, which is the same
failure mode as the flat AVA column arrived at less obviously.

The composite score scores stages rather than counting markets, so it has a
ceiling of 100 and cannot penalise a category for markets it was never going
to serve. It spreads the same 56 buildings over five bands. It also makes the
encoding coherent: a tall building, a marker far along the arc and a high
place on the scoreboard now mean the same thing.

Blueprint reach remains on the title deed, and is still the market a monument
is drawn from. It stopped standing in for progress.

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

### 3.3 AI-generated RFPs are measured, not seeded

This column was empty in earlier extracts, so a deterministic placeholder drove
the rooftop element. The current extract populates it: **8 of 145 categories**
have any AI-generated RFP activity, with a maximum of two.

The placeholder is gone from the code and from the published data. A file
carrying both a measured column and a generated one lets somebody read the
wrong one, and the generated figures were overstating the picture by more than
three times. Two tests hold the line: no metric marked `sample` may drive a
visual layer, and no field with `sample` in its name may appear in the output
at all. `meta.sample_metrics` is derived from the config rather than written
down, so it cannot describe a placeholder as real.

### 3.4 Blueprint usage is the strongest signal in the data

The current extract adds `CBP used`: how many times a sourcing event has
actually been run through each blueprint.

| | Count |
| --- | --- |
| Categories with an active blueprint | 44 |
| Categories whose blueprint has ever been used | **4** |

This reframes the finding from coverage, which reads as paperwork, to
adoption, which is about behaviour. It drives the occupancy layer described in
section 9.

### 3.5 Remaining data gaps

- **89 categories have no recorded spend.** 69 of them also have no
  blueprint; the other 20 carry €176m between them. Whether zero is a gap or a
  true value is unresolved.
- **A221 has 16 markets and €0 spend.** The tallest building has no houses,
  which is more likely unmapped than genuinely zero.
- **No source contains a date of any kind.** See section 10.

## 4. Privacy

The workbook contains blueprint owner names and email addresses.

- `data/raw/` is git-ignored. **The workbook is never committed.**
- `data/city.json` is derived. Contact details are stripped unconditionally.
- The build **refuses to write output** if it detects an email address or a
  corporate domain, and the test suite re-checks the committed file.
- The packaged distributable is assembled from a named file list rather than a
  directory walk, so a source workbook cannot be included by accident.

Category manager names are emitted only when `people.show` in
`config/metrics.yaml` is set to `names` or `initials`. Contact details are
refused at every setting. Publishing names to an audience is a decision for
the owning organisation, not a default.

## 5. Architecture

Component by component, with the diagrams, is in
[ARCHITECTURE.md](ARCHITECTURE.md). This section is why the shape is what it
is rather than what the shape is.

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
than loaded. That is deliberate: the entire model opens from a local file with
**no server and no network**, which also makes it distributable as a single
attachment.

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
sequencing holds regardless of frame rate.

## 6. Visual language

**Monopoly supplies the mechanics**: districts, plots, the houses-to-hotel
escalation, the property kerb. **Lego supplies the surface**: studs, chunky
bricks, a baseplate grid. The Monopoly pieces are themselves brick-built so the
two read as one object.

**Colour carries meaning in exactly one place: blueprint status**, using
reserved status roles (muted / warning / good). District hue is *reinforcement
only*. Every district also has a printed name plate and its own ground, so
identity never rests on distinguishing eight hues under poor colour
reproduction. The measures that
must be read exactly (status, height, houses, reactor) stay on shape, height
and count.

Houses and the hotel differ in **silhouette**, not only colour. This took three
attempts. Red block against green block was not enough, and neither was a
slightly taller red block. What works is the Monopoly rule made literal: the
hotel is one long block exactly as wide as the four houses it replaces, two
storeys where a house has one, with a white band of windows and a sign on the
roof. Longer, taller and lighter, so it reads before the colour does. The
legend draws the same shapes rather than naming their colours, because a red
square beside a green square teaches nobody what a hotel looks like.

### 6.1 Plot area follows spend, compressed

Plot area proportional to spend cannot be drawn literally from this data: 14
of the 31 plots have no recorded spend and hold 58 categories between them, so
strict proportionality would erase 40% of the estate, and the largest plot is
400 times the smallest non-zero one.

Lot size therefore follows the **square root** of average spend per category
in its plot, clamped between 0.78 and 1.75 of the base cell and floored so
that zero-spend plots remain visible. A plot grows both with how many
categories it holds and with how much sits on them. Lots stay uniform inside
any one plot, so an empty lot remains countable.

The same compression, for the same reason, is used when rolling the journey
score up across categories. Three assertions in the browser suite hold the
result: no two lots overlap, the most expensive plot is the largest, and lot
size never contradicts spend per category.

### 6.2 What encodes nothing

Streets, lamp posts and pedestrians encode **nothing**. They exist so
the place reads as a place, which is what makes an empty lot feel like empty
ground rather than a missing bar on a chart. The test is whether someone can
tell they are looking at a city, and then at a street, without reading a word
of the screen. That is why there are painted cycle lanes rather than only
cyclists, zebra crossings, bus shelters, signals on the corners, and two
flyovers.

The flyovers sit only on the two outer roads at the **back** of the map. From
this camera a raised deck anywhere else cuts across the skyline and hides the
buildings, which are the whole point.

**The trams own the flyovers.** Cars up on the deck were just more cars, and a
raised road with no reason to be raised reads as decoration. A viaduct that
exists to carry the tram line explains itself: rails, masts and an overhead
wire on the deck, and the roadway underneath left clear for the traffic that
belongs on it. Each tram runs to the end of its viaduct and comes back, the way
a tram works a terminus, rather than wrapping round and popping from one end to
the other in a single frame.

Street lamps alternate kerbs rather than facing each other. Lamps on both sides
threw overlapping pools that filled the road with light and left nothing to
look at; staggered, half as many fittings light the whole street and the dark
between them survives.

**Trademarks.** LEGO and the Iron Man arc reactor are third-party marks. The
aesthetic is acceptable for internal use; the names and logos must stay out of
anything that circulates externally. The rooftop element is referred to as the
**reactor**, and the product as **NW Digital City**.

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

**The tool calls are shown on screen as they run**, so the resolution path for
any query is observable rather than asserted. Calls over 145 rows complete in
under a millisecond and would be unreadable, so each is held briefly. The calls
are real; only the pacing is added, and model latency replaces it when the
service tier is in use.

### 7.1 Resolution scores both directions

Scoring only how much of the *query* matched sent *"how is energy doing"* to a
category whose name happens to contain the word, because one matched token out
of one looks perfect. Weighing how much of the *target* was covered lets the
district actually called Energy win.

### 7.2 The fallback ladder

```
model  →  deterministic parser  →  preset chips  →  local HTML file
```

Every rung works on its own. The deterministic layer is not scaffolding to be
deleted. It is the router whenever the endpoint is absent or unreachable.

### 7.3 The model will never see the numbers

Planned split: the model receives the **question and the list of names** and
decides which tool to call. The tools then execute **locally** against
`city.json`. Spend figures never leave the browser.

The separation is both a control and a design constraint. The model resolves
intent, the application computes values, and no commercially sensitive figure
is sent to an external service.

## 8. Interaction design

**Findings are written, not spoken.** Results appear in the figure's speech
bubble and in a caption at the foot of the viewport, so a result is readable
without audio and can be disagreed with rather than only heard.

The build sequence is: wide establishing view, transition, teardown of the
selected lot, rebuild **in the order of the four measures**, settle. The order
carries the encoding: after two or three categories the visual grammar is
legible without reference to the legend.

**An empty lot is the most informative state.** Selecting a category with no
blueprint produces nothing to build. A311 Field Maintenance carries €75m of
spend with no blueprint, and the absence of a building is the finding.

## 9. Conformance to the brief

**The structure matches exactly.** The source deck lists 8 districts, 31 plots
and an L4 count per plot. The build agrees on all 31 and totals 145. The
hierarchy of an L2 holding L3 plots holding L4 buildings is what the renderer
draws.

**All four original measures are built**, in the brief's own order: foundation
from blueprint status, height from adoption, houses and hotel from value,
reactor from AI-generated RFPs. A fifth was added later, described below.

### Deliberate deviations

| The brief | What is built | Why |
| --- | --- | --- |
| Height from % AVA adoption | The composite score | The column reads a flat 100% for all 145 categories, so it cannot differentiate, and blueprint reach is a count with no denominator. See 3.1. |
| Value bands <5m / 5-20 / 20-50 / 50-100 / >100m | <1m / 1-5 / 5-20 / 20-50 / >50m | Thresholds are stated as undecided in the brief. On the original bands Networks has no hotels at all. See 3.2. |
| "Plot of land" for an L4 | District, plot, lot | The sources use "plot" for both L3 and L4. See 2. |
| Glow or an electric car for AI readiness | Rooftop reactor and beam | Representation is left open in the brief. A roof fitting scales with the building; a vehicle does not. |
| Three readiness tiers | Four | "No activity" is separated from "some activity", so a dark roof means nothing has started. |
| L3 plot area equal per category | Plot area follows spend, compressed | See 6.1. |
| Vehicle movement as ambience | Traffic density per district follows that district's share of spend | Anything that moves should carry meaning. |

### Added since the original brief

**Occupancy, the fifth measure.** The extract gained a `CBP used` column: how
many times a sourcing event has actually been run through each blueprint. 44
categories have an active blueprint and 4 have one that has ever been used.
This is rendered on the buildings themselves rather than as a new object: an
occupied building keeps its district colour and lights its windows, an unused
one drains towards neutral grey and stays dark.

**The journey score.** A single 0 to 100 figure per category, district or
organisation, weighted 40% blueprint / 35% usage / 25% AI. Defined in
`docs/JOURNEY-SCORE.md`, configured in `config/metrics.yaml`, and used for the
Traditional → Connected → Smart → Autonomous progression shown on screen.

### Not built, deliberately

**Speech input.** Speech recognition transcribes category identifiers such as
"A221" unreliably across accents and in ambient noise, and a failed
transcription has no graceful fallback. The intent layer accepts a string, so
it can be added where microphone conditions are controlled.

**A separate L3 street view.** The plot is already the camera's focus frame.

**Per-person behavioural scoring.** Scoring and publicly comparing individual
behaviour is an employee-relations and data-protection matter requiring works
council consultation in several markets. It is out of scope for a
visualisation and belongs to a separate initiative with its own governance.

## 10. Known limitations

Stated plainly, because each is visible to anyone who looks closely.

**Adoption depth is not measured anywhere.** AVA adoption is flat 100% across
all 145 categories in every extract received, and Ariba adoption is flat 0%.
Blueprint reach counts markets without knowing how many a category could
serve. Height is the composite score instead, so no visual layer now rests on
a substituted measure, but the gap remains: nothing states how deeply a
blueprint is used within a market. Spend broken down by market would close it
and would also give blueprint reach the denominator it lacks.

**No temporal data exists.** No source contains a created, modified or
last-activity date for any record. The application therefore cannot show
change over time, recency, or momentum. This is the single largest data gap
and blocks any activity-based visualisation.

**Spend is missing for 89 categories.** Whether this is a data gap or a true
zero is unresolved. It affects both the spend bands and the plot sizing, which
is why plot area is compressed rather than strictly proportional.

**Two measures of market presence disagree slightly.** `Total CBP` in the
current extract and the distinct-market count from the blueprint records agree
for 143 of 145 categories and differ for two. The maintained column is
authoritative.

**Realised value is not measured.** The source carries a target savings
percentage on some records but no realised figure, so the application makes no
claim about value delivered.

**The journey score has no time dimension** and tilts modestly against large
portfolios. Both limits are documented in `docs/JOURNEY-SCORE.md`.

## 11. Open questions for the data owners

1. Is 100% AVA adoption accurate, or a placeholder? Is a per-L4 figure
   available?
2. Can a created or last-modified date be added to each blueprint record?
   This unlocks every activity-based visualisation.
3. Are the rescaled spend thresholds acceptable, or should the original bands
   be restored?
4. Is €0 spend on 89 categories a data gap or a true zero?
5. Can realised savings per category be sourced, as distinct from target?
6. Which Vertex AI models are available in the target environment, and what is
   the approval path for deploying a container there?
7. The source legend lists a **vault for knowledge resilience** that the
   four-measures slide and the narrative do not. Is it a fifth measure, and
   what data would drive it? No column in the extract corresponds to it, so it
   is not implemented.

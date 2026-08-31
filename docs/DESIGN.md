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

Houses and the hotel differ in **silhouette**, not only colour. This took three
attempts. Red block against green block was not enough, and neither was a
slightly taller red block. What works is the Monopoly rule made literal: the
hotel is one long block exactly as wide as the four houses it replaces, two
storeys where a house has one, with a white band of windows and a sign on the
roof. Longer, taller and lighter, so it reads before the colour does. The
legend draws the same shapes rather than naming their colours, because a red
square beside a green square teaches nobody what a hotel looks like.

Streets, parkland, lamp posts, traffic and pedestrians encode **nothing**. They exist so
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

**The first version of this did not land.** Thirty-two translucent towers
appearing in a city of a hundred and forty-five buildings, with everything else
unchanged, read from the back of a room as almost the same picture. Raising
them higher than the record justifies was never an option, so the change had to
be in the presentation rather than in the figures.

So the whole scene changes mood. The light drops, every brick that has actually
been laid desaturates to grey, and what could be built is the only thing on
screen with colour and light in it: a lit cap on each roof and a column of
light above it. The towers rise as a wave across the map instead of all at
once, so the eye has something to follow and the room can see how far it
spreads. Same 32 lots, same €176m, a picture nobody can mistake for the one
before it.

## 8c. The model layer

The renderer is a static page, so a browser calling a model directly would have
to carry the credential where anyone can read it. A small service holds the
key, adds the prompt and returns a decision. That service is the only thing
that ever gets deployed, and it is the same container on a laptop, on Cloud Run
and in the internal environment.

**It serves the page as well as answering it.** The first version did not, and
turning the agent on meant a pip install, a shell that exported the right
variables, a uvicorn command and a query parameter on the page address: four
chances to get it wrong, in a green room, minutes before going on stage. Now
the page and the agent share an origin, so the browser asks its own address and
there is nothing to pass in. `run.py` makes the virtual environment, installs
into it, writes `.env` from the example, starts the service and opens the
browser. The whole model setup is the key in `.env`.

A badge on the ask bar names the model that is actually answering. It reads
`/health` rather than assuming, and says plainly when the city is running on
its own rules instead, because claiming a model on stage that is not connected
is worse than admitting there is none.

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

`app/eval.py` runs 32 likely questions against whichever provider is
configured. Run it against the mock while building and against the real
endpoint before the all-hands.

## 8d. The closing ask

The narrative ends on three asks and the deck ends on four. They are the point
of the session for the 400 people watching, and for a while they existed
nowhere in the app, which meant the demo finished on a nice picture instead of
on an instruction. Press K, or ask the agent what we are asking people to do,
and the four asks take the screen over the city:

1. Complete and maintain your category blueprint.
2. Put it to work through AVA Sourcing.
3. Use it for meaningful sourcing events.
4. Structure the knowledge and rules that power what comes next.

Signed off with the line the deck closes on: **blueprints today, smart
procurement tomorrow**. The fourth ask carries the reactor colour rather than
red, because it is the one that belongs to the smart-city layer.

## 8e. Making it explain itself

Three things a first pair of fresh eyes found, all of them the same mistake:
assuming the reader already knows what they are looking at.

**Single keys were firing while somebody typed.** Typing "reset" into the ask
box reset the view; anything containing an N, a P or a K turned on night,
raised the potential and opened the asks before the sentence was finished. The
shortcuts now stand down whenever focus is in a field.

**Districts had no edge.** Their footprint already carries meaning, a district
is as big as the number of categories it holds, but with parkland running right
up to the ground plate there was no line saying where one stopped. A small
district beside a big lawn read as enormous. Each one now sits inside a kerb in
its own colour, on ground tinted a few percent toward it, which is slide 11's
coloured L2 rectangle built in bricks. The legend explains the ground before it
explains the measures.

**The builder was invisible.** He stood in front of his lot, which from this
camera is behind whatever occupies the next row, so on a full plot the hero of
the piece was a yellow pixel between two towers. Moving him into the diagonal
lane between four lots, the one direction the camera looks straight down,
helped and did not solve it. So he is drawn in a second pass: the city renders,
the depth buffer is cleared, and he is drawn over it, which keeps his own parts
correctly ordered while never letting a building hide him. He reads as a marker
on a map, which is what he is. That pass required moving the sky off
`scene.background`, which forces a full clear on every render call.

**And a guided tour**, which is one sequence doing three jobs: an introduction
for someone seeing this for the first time, the run of show on stage, and the
end-to-end test in `docs/DEMO.md`. It advances on a click, never on a timer,
because nobody wants a demo running ahead of them while a room asks a question.

## 8f. Three things for the people watching

**Hovering.** Clicking a building is a commitment: it opens the deed, moves the
camera and pins the builder. Hovering costs nothing, and costing nothing is
what people want while they are still working out what they are looking at. A
hover names the lot, its district and whether anything is built on it.

**Type-ahead.** The resolver is forgiving, but the failure that matters on a
stage is typing four letters of a name nobody can quite remember and getting
nothing back. The ask bar now offers what those letters already match, with the
lot code beside each, which turns a guess into a choice and teaches the city's
vocabulary while you use it.

**A presenter clicker.** The tour steps forward on space, the right arrow and
Page Down, because a clicker sends the page keys, and the difference between
driving this from the middle of a stage and standing at a laptop is two lines
of code.

## 8g. Model names go stale

`gemini-2.0-flash` was the default here. Google shut it down, and the first
symptom was every one of the 32 eval questions returning 404 from a key that
had worked days earlier. The failure was correct and useless: thirty-two
identical stack traces, none of which said what to do.

Three changes, and the last one is the point.

**The eval stops after three identical provider errors** and says the endpoint
is the problem rather than the questions, with the one command that diagnoses
it. Repeating a failure thirty-two times buries the line that matters.

**`run.cmd models` asks the key what it can call.** Guessing at a model name
from documentation is how this happened; asking takes ten seconds.

**And with `NW_MODEL` unset, a 404 is recovered from.** The code lists what is
available, takes the best flash model it finds, says on stdout which one it
switched to, and retries. Set `NW_MODEL` and it never does this, because
pinning a model is a decision and the code should not quietly undo it. That
distinction is the whole design: unset means "keep this working", set means "I
mean this one".

This matters more than it looks. The all-hands is months away, and by then the
model in any config file may not exist. A demo that repairs itself is worth
more than a config file that was right once.

**And then the same run started timing out instead.** A different failure
wearing the same clothes: every question failing, no clue which layer. Three
things came out of that.

The command-line timeout went from 8 seconds to 30. Eight was optimistic for a
first call that goes through a corporate proxy, negotiates TLS and carries a
prompt naming 145 categories. The browser keeps its own six-second deadline,
because on a stage a slow answer is worse than no answer and the local rules
are instant. Those two numbers are deliberately different and the code says why.

A transport failure now says it is the network, not the model, and names the
three things it usually is on a corporate laptop: a proxy, TLS interception, or
the host being blocked. `run.cmd models` makes one small request and separates
*cannot reach Google* from *key refused* from *model gone*, which is three
afternoons of guessing collapsed into ten seconds.

**Then it turned out to be neither.** The timeouts became 503s, then 429s, and
the API console said it plainly: 22 requests against a daily limit of 20. A
free Gemini key allows about five requests a minute and twenty a day, and the
question set is thirty-two. It could never have passed, and the failure arrived
disguised as three different problems on the way.

So the check was made to fit the thing it runs against. `eval` is now six
questions, one per intent, which is what the check is actually for: catching a
model that has started routing questions somewhere silly. `eval all` runs the
full thirty-two for a key with billing, or for Vertex, which is where this
deploys and which is not subject to the AI Studio free tier at all. Requests
are paced to the limit rather than fired as fast as the network allows, 429 and
503 are retried with backoff and the delay the service asks for, and a key that
is genuinely out for the day is told so in those words rather than through a
transport error.

Even the six-question sample then hit the wall, because the daily count had
already been spent finding all this out. Which surfaced the useful fact: **the
limits are per model.** A key with nothing left for `gemini-3.5-flash` has an
untouched allowance for `gemini-3.5-flash-lite`, and a lite model routes these
questions perfectly well, since this is deciding which lot to fly to rather
than writing an essay. That is now the first thing the message suggests, ahead
of waiting until tomorrow.

The message itself also stopped being printed once per failed question. Twenty
lines of advice, three times over, is how you hide the one line that says which
question failed. One line per case now, and the explanation once at the end.

The demo was never at risk. One question is one request, and nobody asks twenty
questions on a stage. It was only ever the test that was too big for the tier.

**And the badge stopped keeping up appearances.** It read `/health` once at
load and then said "gemini-3.5-flash" forever, including through a run where
every single call timed out and the city was answering on its own rules. It now
changes to "model did not answer" the moment one does. A badge that claims a
model which is silent is worse than no badge.

## 8h. What the first real model run found

Six questions, a live model, no rate limit. Two failures, and neither was the
model's.

**A near miss was being discarded.** Asked about batteries, the model answered
`"Batteries"` where the vocabulary had said `"D504 Batteries"`, and the
validation refused it because it only accepted an exact or case-insensitive
match. That is a correct answer thrown away on a technicality. The matcher now
also resolves a category by its title alone, ignoring case and punctuation,
while still only ever returning something already in the vocabulary, so an
invented category is refused exactly as before. Where two categories share a
title, which happens once in this extract, it is refused rather than guessed
at: flying to the wrong one of two is worse than admitting the question was
ambiguous.

**And the other failure was the test being over-specified.** "How is Energy
doing" was marked wrong for choosing `summary` over `district`. But `district`
flies to Energy and summarises it, and `summary` flies to Energy and summarises
it with one more figure. Both are right, and the second is arguably better.
Marking one of them wrong tested my preference rather than the agent, so the
eval now accepts either where two intents are genuinely both correct, written
as `district|summary`, with a note saying why.

That distinction is worth keeping in mind for the rest of this: an eval that
fails on a correct answer trains you to ignore it.

## 8i. A ladder of models, and a net under the search

Two enhancements after the first real run, both of them the same shape: stop
depending on one thing being available.

**The models are a ladder now.** Three things take a model away: it is retired
(404), it is out of requests (429), or the service is busy (503). Retries cover
the third. The ladder covers the other two: the first model that answers is
used, one that refuses is skipped and remembered, and a line on stdout says
which one actually answered when it was not the first choice.

There is no endpoint that reports remaining quota, so nothing can check in
advance which model has requests left. It finds out the only way available, by
asking, and then remembers, so one refusal costs one request rather than one
per question. A 404 rests a model for the session because retirement is
permanent; a 429 or 503 rests it for whatever delay the service asks for, or an
hour, which is long enough to stop asking and short enough that a per-minute
limit recovers on its own.

`NW_MODEL` became a first choice rather than a hard pin, because a first choice
that is out of requests should not take the agent down with it. `NW_PIN=1`
restores the old behaviour, which is what an experiment comparing two models
wants. `/health` and `run.cmd models` both report the ladder, so what will be
tried is visible rather than assumed.

**And the search reads the definitions.** It is not semantic search: there are
no embeddings, because embedding a query needs a network call and the whole
point of the renderer is that it works from a file with none. What it is, is
lexical matching that is forgiving about spelling, plus a model that
understands paraphrase when one is available.

That already handled "battery" for Batteries and "fiber optic" for Fibre Optic
Network, through bigram overlap. What it could not do was "lead acid", which is
the first two words of what the workbook says D504 actually is. Every category
carries a definition and none of them were being read.

They are read now, but only as a net under the names, never as a rival to them.
Consulted alongside names, "fibre optic" stopped finding the plot called Fibre
Optic Network and started finding whichever category's definition mentioned
fibre, which is a worse answer arrived at more cleverly. So the definitions are
consulted only when nothing was recognised by name, they require *every* word
of the question to appear as a whole word, and they score below any name match
that got close. One word in common is a coincidence; all of them is a reason.

## 8j. Say why, not just that

`batteries` came back as `focus` with no target: the right intent, pointing at
nothing, and the camera going nowhere. The eval reported the symptom and none
of the cause, so the first guess was that the model had failed, when in fact
the model answered and the validation cut its answer down.

**A failing case now prints the plan's notes.** They were always recorded and
never shown. "dropped invented category 'Lead Acid Cells'" is a different
problem from "no JSON in reply" and both used to look like `focus` with an
empty target.

**And a code inside a longer answer is now read as a code.** Models format a
target in ways a prompt cannot fully pin down: `D504 (Batteries)`, `category
D504`, `the D504 lot`. The code has to exist in the vocabulary to count, so
this cannot admit an invented one, but refusing a real one over punctuation is
throwing away a correct answer for the second time in two days.

The pattern is worth naming, because it has now happened three times: every
one of these failures was the validation being stricter than the thing it was
validating. Being strict about what a model may *invent* is right. Being
strict about how it *phrases* something real is just a bug with good manners.

## 8k. Two small things that were quietly costing something

**A run did not say which model answered it.** With a ladder underneath,
"provider: gemini" stopped being the whole story: a run can start on one model
and finish on another, and a result you cannot attribute to a model is not much
of a result. The eval now ends with `answered by: gemini-3.5-flash-lite (6)`,
or names both when it switched partway.

**And every run opened with a deprecation warning.** Starlette's test client
wants `httpx2` and warns without it. The temptation is to silence it, and that
is the wrong instinct twice over: the warning is true, and a suite that trains
you to skip its first two lines has already lost the argument about whether you
read the rest.

So `httpx2` is installed, in a `requirements-dev.txt` that includes the
deployed file rather than replacing it. A test-only library has no business in
a production image, so `run.py` installs the developer file and the Dockerfile
installs `app/requirements.txt` on its own. The reinstall check now compares
both files, because comparing only the outer one would miss an edit to the
inner one.

## 8l. The wrong answer that passed, and the right answer that failed

One run produced two lines worth more than the twenty-eight that were fine.

```
FAIL  batteries                     focus   (wanted focus -> D504)
  ok  what could we build           could_be -> Germany
```

**The failure had no notes under it.** 8j added notes so a cut-down plan would
explain itself, and their absence was the finding: nothing was dropped, because
nothing arrived. The model returned `{"intent": "focus"}` and stopped. It was
right about the intent and simply did not say where.

Sharpening the prompt is worth doing and is not a fix, because a prompt is a
request and a model can decline it. So the answer is a net: **when an intent
that needs a place arrives without one, the question is searched for a name.**
The word "batteries" is still sitting in the text that was typed. Nothing
invented can come out, because the search only ever returns an entry from the
vocabulary, which is the same rule everything else here obeys.

That search already existed, inside the mock provider, and is now one function
that both use. Two copies of "what does this question refer to" would have
drifted, and the mock is what the entire suite runs against.

**The pass was the more interesting of the two.** `could_be -> Germany` is the
right intent scoped to a market, and the eval accepted it because the expected
target was blank, which meant "anywhere is fine". It is not fine. That view
raises every undeveloped lot in Networks and the caption counts drafts across
all 145, so a target on it produces a sentence about Germany underneath a
picture of the whole city. The number and the screen would disagree, on stage,
in front of four hundred people.

So the rule got more precise rather than just wider. There are now three kinds
of intent, not two:

| Kind | Takes | Because |
| --- | --- | --- |
| `focus`, `district` | one place, always | they are questions about that place |
| `gaps`, `summary`, `rank` | a district, plot or market | an area has gaps and totals; a single lot does not |
| `could_be`, `night`, `asks`, `reset` | nothing at all | they redraw the whole city, so there is nothing to scope |

`runCouldBe` in the browser lost its scope parameter for the same reason, on
both paths. It was accepting one and rendering city-wide regardless, which is
the same disagreement arrived at from the other direction.

**And the eval learned to say "nowhere".** A blank expectation meant "any
target, including none", which cannot catch a target that should not be there.
The target column now reads three ways: a name, `""` for anywhere, and `"-"`
for nowhere. Thirteen cases moved to `"-"`, and `could_be -> Germany` now
fails, which it should have been doing all along.

The smaller thing in the same output: `answered by: gemini:gemini-3.5-flash-lite`
said the same word twice, and worse, it named the model that was *asked* rather
than the one that *replied*. With a ladder underneath those are different
models, and the whole reason for printing the line was attribution.

## 8m. The configuration nothing was testing

Everything green, on a real model, on the laptop. Which raised the question of
what "everything" had actually covered, and the answer was: not the thing we
are going to deploy.

The browser suite opened `renderer/index.html` from a file. A page opened that
way has no service to ask, so the agent falls straight through to its own
rules. Every one of those sixteen checks was exercising the fallback. The
served configuration, where the page asks the service for a plan and acts on
what comes back, had never been driven in a browser once.

That is not a small gap. It is a different branch of the agent, it is the only
branch that runs on Cloud Run, and the rescue added in 8l lives inside it.

So the smoke test takes a URL now, and `run.py test` runs it twice: once from
the file, once against a service it starts itself. The second run is forced to
`NW_PROVIDER=mock`, because what is being checked is that the page finds its
own endpoint, gets a plan and acts on it, and none of that should depend on a
key or on a model's mood. It adds three checks the file can never make, and
about twenty seconds.

Before that could run, the container's exact contents had to be exercised on
their own: a clean environment with only `app/requirements.txt` in it, the
`uvicorn` line from the `Dockerfile`, and the page, the city data, `/health`
and `/plan` all requested over HTTP. The risk being checked was a real one:
`requirements-dev.txt` had just been split out, and anything that quietly
migrated into it would break the image and nowhere else.

### Two things wrong in the deploy script, found by reading it

Neither would have shown up until the deploy itself.

**It defaulted to `gemini-2.0-flash`.** That is the model Google retired, the
one that produced a day of 404s. A deploy carrying that name would have stood
up a service where every question failed, and the person who found out would
have been whoever was on the stage.

**And it uploaded the whole folder to Cloud Build.** With no `.gcloudignore`,
gcloud infers one from `.gitignore`, which today would in fact have excluded
`data/raw`. It would have been fine. But the workbook in there carries
blueprint owner names and email addresses, and "fine by side effect of another
file" is not the standard for that. There is now a committed `.gcloudignore`
naming what stays behind, and the script refuses to upload anything if it is
missing.

That makes three layers under the same rule, which is the amount this
particular thing is worth: `run.py package` builds its zip from a list rather
than a folder, `.gcloudignore` names what does not go to the build, and the
`Dockerfile` copies `app` and `renderer` by name, so an upload carrying more
than it should still could not put it in the image.

## 8n. The thing you send should be the thing they open

"Can I not just share index.html?" No, and the reason is a fair complaint
about how it was built rather than a misunderstanding.

`index.html` is a 20KB shell. It pulls in a 3D library, the city data, the
renderer and the agent as four separate files, so on its own it is a blank
page. The honest answer had been a zip: unzip it, find the folder, find
index.html, open that one. Four steps and a decision, for somebody who only
wanted to look at it, and every one of those steps is somewhere a reviewer
quietly gives up.

So `run.py package` now also inlines the four scripts and writes one 0.9 MB
`NW Digital City.html` that opens on a double-click. Same code, same data, no
network. Larger, because the library is inside it, and worth every byte: the
thing you send should be the thing they open.

**And it is checked before it can be sent.** Inlining is a text substitution,
and text substitutions fail quietly: a broken single file looks exactly like a
working one until somebody opens it, and by then it is in their inbox. So the
packager drives the file it just built in a real browser, runs the full set of
checks against it, and refuses to leave it behind if any fail. The smoke test
takes a `file://` target for this, alongside the served one from 8m.

One guard worth naming: a literal `</script>` anywhere in the inlined
JavaScript would close the tag early and spill the rest of the file onto the
page as text. Nothing has one today. A file that grows one later should not
find out the hard way.

## 8o. Who the reviewers actually are

I had written the reviewer email asking Tomas about container deployment and
which Vertex models were available internally. Tomas is in Kate's team, on
customer success and value. He is not the infrastructure route and never was,
and the question would have read as though I had not bothered to find out who
he is.

Worth recording because it is the same failure as an invented category, one
level up: an assumption dressed as a fact, in the one part of the work that
leaves the building. The code refuses to state a figure it cannot source. The
email should hold to the same standard about people.

`docs/REVIEW-GUIDE.md` is the other half. A reviewer who has to be told how to
look at something will tell you it is confusing, and they will be right, and
you will have learned nothing about the thing itself. The guide gets them to
the same starting point: how to open it, what the four visual measures mean,
six things to type, what feedback is useful, and a list of what is already
known so nobody spends their time reporting the placeholder rooftop lights.

## 8p. What happens when Kate opens it on her phone

Asked before it was sent, which is the right time to ask it. The answer was
that it loaded and was unusable, and I only know that because I opened it on
one rather than reasoning about whether it would work.

On a 390 pixel screen:

- The legend is a fixed 320 pixel panel pinned to a corner. At 671 pixels tall
  it covered the city, the starter questions and most of the ask bar.
- The starter questions wrapped into a six-line block across the middle of the
  map.
- The hint in the corner read "hover a building, scroll to zoom, press T",
  three instructions for hardware that is not there.
- There was no way to zoom at all. Zoom was the scroll wheel, and one finger
  panned. Two fingers did nothing.
- Tapping the question box zoomed the whole page in, because iOS does that to
  any input under 16 pixels and does not undo it.

None of which is surprising. It was built for a laptop driving a projector,
which is what the day is. But a phone is how a reviewer opens a link, and
"it does not work on the thing they will actually use" is not a detail.

### What it is now

**A phone gets its own layout.** Everything along the bottom is one stack,
each item placed off the one below it rather than off the screen, so nothing
can land on top of anything else: question box, buttons, starter questions,
the agent's last line, then the two reference panels. The legend and the trace
start collapsed, with their headers visible so it is clear they are there. The
starter questions became one row that scrolls sideways instead of a block that
wraps. Landscape, which has almost no height, drops the panels entirely.

**Five buttons stand in for the five keyboard shortcuts.** Tour, Reset, Night,
Could be, The ask. They call the city's own commands by name through a new
`NWCity.command()`, and the keys now call exactly the same map. Two code paths
to the same view is how a button and a key end up meaning different things.

**Two fingers pinch.** Pointer events already delivered touches through the
same handlers as the mouse, so the only new state is how many are down: one
drags the map, two zoom it. The second finger cancels the drag it interrupted.

### The check that found the bug in my own fix

The suite now opens the page a second time in an emulated iPhone, on the
browser it has already launched, and taps every button. It found something no
amount of re-reading would have: I had written mobile styles for `#asksCard`,
and the element is `#asks`. A rule for an id that does not exist fails in
complete silence. The closing card would have run off both edges of the screen
and nothing anywhere would have said so.

It also checks the thing that broke in the first place, which is worth stating
as a rule rather than a case: **no two panels along the bottom may overlap.**
That is a geometric fact about the rendered page, and it is the kind of thing
a person stops noticing after the third look at a screenshot.

**And a lesson about how to ask a running page a question.** The first version
of the night check called `NWCity.night()` to read the state, which toggles.
The act of looking changed the answer, and the check passed or failed on its
own side effect. There is now a `state()` that reads and never writes. Any
accessor that can change what it reports is not an accessor.

## 8q. It passed here and failed there, on the same file

`run.py package` on my machine: all green. The same command on the laptop it
was built for: the tour's Close button could not be tapped, and the packager
refused to hand over the file.

The bug was real and had been there since the mobile layout was written. The
card is centred with `translateX(-50%)`, which is correct when it is placed at
`left: 50%`. My phone rule gave it `left: 10px; right: 10px` and did not
cancel the transform, so the same shift now dragged it half its own width off
the screen. Measured, it spanned -175 to 195 on a 390 pixel viewport, and both
its buttons sat entirely outside. Start the tour on a phone and you could not
leave it.

**It looked completely fine**, in a screenshot and to me, because the half
still on screen was the half with the words in it.

### Why one machine caught it and the other did not

Nothing about the page differed. Playwright's `tap` refuses an element outside
the viewport, and how strictly it does that changed between versions. The
newer one on the other laptop refused; the older one here went ahead and the
check passed.

That is the part worth keeping. My check tapped the button and inferred
success from the tap not throwing, which made the assertion a property of the
test runner rather than of the page. A check that depends on how strict your
tooling happens to be this month is not a check.

So the rule is now asserted directly: **every control you can see, you can
reach.** It walks every visible button, input and link, skips anything inside
something scrollable, and fails naming any that lie outside the viewport. On
the broken version it says `tourNext at -155,498`, which is the bug, its
identity and its coordinates, before any tap is attempted. Verified by putting
the bug back and watching it fail, because a regression test nobody has seen
fail is a regression test nobody has tested.

It runs three times over the phone pass: at rest, with the tour open, and with
a lot selected. Cards that only exist in one state are exactly where this
class of mistake hides.

### And the same mistake, found by looking rather than failing

Having seen it once, I searched for the pattern instead of waiting for it:
five elements are centred with a transform, and four had already been given
`transform: none` in the phone rules. `#tour` was the one I missed. The
builder's speech bubble is the fifth and keeps its transform on purpose, since
it is placed at a point rather than in a layout, but it now has a width cap so
it cannot hang off a narrow screen either.

## 8r. Twenty-one seconds against a thirty second limit

The second red run on the same laptop, and a different fault: the phone pass
could not open the page at all. Thirty seconds waiting for a file already
loaded once, half a second earlier, in the same browser.

Measured rather than guessed at:

| | Time to open |
| --- | --- |
| Desktop pass | 1.8s |
| Phone pass, desktop page still open | **21.4s** |
| Phone pass, at device scale factor 1 | 20.6s |
| Phone pass, desktop page closed | **1.4s** |

I never closed the first page. Two live WebGL contexts in one browser contend
badly enough to cost fifteen times the load, and the pixel density I suspected
first accounts for almost none of it.

Twenty-one seconds against a thirty second default is the worst kind of
number: comfortably inside on the machine that wrote it and outside on a
laptop doing anything else. It had nothing to do with the phone. It was a
resource leak in the check, which the check then blamed on the page.

Three changes, in order of how much they matter:

1. **The desktop page is closed before the phone pass.** 21.4s to 1.4s, and
   the whole browser suite went from about 52 seconds to 31.
2. **The navigation timeout is 90 seconds**, because the wait is not a
   download. In the packaged single file every script is inline, so the load
   event does not fire until the entire city has been built synchronously.
   That is fast here and slow on a laptop compiling something in another
   window, and a timeout at that moment reads as "the page is broken" when it
   means "the page was still working". A genuine hang still fails, a minute
   later, saying the same thing.
3. **Device scale factor 1 for the phone context.** Layout is in CSS pixels
   either way and no check looks at a rasterised pixel, so 3x was nine times
   the work for nothing. Worth almost none of the time, and still right.

### And a failure should read like a failure

Both red runs ended in an uncaught exception: thirty lines of Node internals,
with the one line naming the failed check somewhere in the middle and the
packager's "do not send it" pushed off the bottom.

A thrown error is now a failed check like any other. It prints one line saying
what could not be done, then the summary, then the stack underneath for when
it is a genuine fault rather than a failed expectation:

```
FAIL  the browser check ran to the end — page.tap: Timeout 3000ms exceeded.
1 failed
```

Verified by pointing a tap at a button that does not exist, in the same way
the reachability check in 8q was verified: by watching it fail on purpose.

The pattern across 8q and 8r is one thing said twice. Both bugs were in the
checking, not in the city, and both showed up as one machine passing and
another failing on an identical file. A check that leaks resources, or that
borrows its strictness from the version of the tool that happens to be
installed, is not measuring the thing it claims to measure.

## 9. Checked against the brief

Re-read of the deck, the narrative and the workbook, against what is built.

**The structure matches exactly.** Slide 10 lists 8 districts, 31 plots and the
L4 count for every plot. Ours agrees on all 31, and totals 145. Slide 11's
picture of an L2 holding L3 plots holding L4 buildings is the layout the
renderer draws.

**The four measures are all built**, in the deck's own order: foundation from
blueprint status, height from adoption, houses and hotel from value, reactor
from AI-generated RFPs. The narrative's rule that a draft claims the plot and
an active blueprint lays the foundation is the rule in the code.

**Where we deviate, and why:**

| The brief | What we built | Why |
| --- | --- | --- |
| Height from % AVA adoption | Height from blueprint reach, badged provisional | The column reads a flat 100% for all 145 categories. See 3.1. |
| Value bands <5m / 5-20 / 20-50 / 50-100 / >100m | <1m / 1-5 / 5-20 / 20-50 / >50m | The narrative says the thresholds are still to be decided. On the deck's bands, Networks has no hotels at all. See 3.2. |
| "Plot of land" for an L4 | District, plot, lot | The sources use plot for both L3 and L4, which made "7 of 18 plots" wrong in two different ways. See 2. |
| Glow, or an electric car, for AI | Rooftop reactor and a beam | The narrative leaves the representation open. A roof fitting scales with the building; a car does not. |
| Three tiers of readiness | Four | Ours splits "no activity" from "some activity" so a dark roof means nothing at all has started. |

**One thing in the deck is not built.** The legend on slide 9 lists five
elements: foundation, height, houses and hotel, glow, and a **vault for
knowledge resilience**. The four-measures slide and the narrative both list
four, with no vault. It is not clear whether the vault is a fifth measure or an
earlier draft of the foundation idea, and the workbook carries no column that
would drive it. It is question 8 for Kate rather than a guess in the renderer.

**Not built, deliberately:** speech input, cut on stage risk; the L3 street
view as a separate mode, since the plot is already the camera's focus frame.

## 10. Open questions

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
8. Slide 9 lists a vault for knowledge resilience that the four-measures slide
   and the narrative do not. Is it a fifth measure, and what would drive it?

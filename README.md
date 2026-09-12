# NW Digital City

An agent that turns the Networks category blueprint estate into a city you can
walk through: districts, plots and lots that develop according to how each
category is doing. Scoped to the Networks organisation.

Ask it about a category in plain English and it finds it, reasons about it, and
renders it.

## Documentation

| Read | For |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, interfaces, runtime views, data pipeline, security controls, and the current and target deployment topologies |
| [docs/DESIGN.md](docs/DESIGN.md) | Why the design is what it is, and what was considered and rejected |
| [docs/READING-THE-CITY.md](docs/READING-THE-CITY.md) | How to interpret the visualisation, and where the data is soft |
| [docs/JOURNEY-SCORE.md](docs/JOURNEY-SCORE.md) | The composite score: components, weights, roll-up method |
| [docs/TESTING.md](docs/TESTING.md) | Verification: the automated stages, and a manual walkthrough |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Deployment and agent catalogue registration |
| [docs/DEMO.md](docs/DEMO.md) | Feature walkthrough and troubleshooting |
| [docs/SETUP-WINDOWS.md](docs/SETUP-WINDOWS.md) | First-time setup on a Windows host |

## The metaphor

Every visible thing encodes a measure, and nothing is decoration:

| Measure | What you see | Driven by |
| --- | --- | --- |
| Foundation | empty lot, then marked out, then foundation laid | blueprint status |
| Building | small building, office block, tower, skyscraper | the journey score, 0 to 100 |
| Property | Monopoly-style houses, then a hotel | spend FY26/27 |
| Smart city | rooftop reactor, from dark to full glow | AI-generated RFPs |
| Occupancy | full colour and lit windows, or drained to grey | has anybody used the blueprint |
| Landmark | a monument, on a widened lot, in place of the building | a category scoring 50 or more |
| Land area | a bigger lot, and a bigger plot around it | spend, square-root compressed |

Geography follows the category tree: **L2 is a district, L3 is a plot, L4 is a
lot** with a building on it. For Networks that is 8 districts, 31 plots and 145
lots, of which 89 are still empty ground.

Occupancy is the sharpest of these. 44 blueprints are live and **four have ever
been used**, so four buildings in the whole city keep their colour. Press `N`
and everything else goes dark.

On top of the map sits a single **journey score**, 0 to 100, for a category, a
district, a manager or the whole organisation: 40% for how far the blueprint
itself has got, 35% for anyone actually using it, 25% for doing it with AI.
Networks scores 19. The reasoning, the weights and the two rejected
alternatives are in [docs/JOURNEY-SCORE.md](docs/JOURNEY-SCORE.md).

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

### Why height is the journey score and not an adoption figure

`% AVA Sourcing` reads a flat **100% for all 145 categories**, so it cannot
differentiate: every building would be a maxed-out skyscraper.

Height was blueprint reach until it became clear that was the weaker choice
twice over. It is a count with no denominator, because nothing in any source
says which markets a category applies to, so a category live in both of its
two relevant markets scores worse than one live in five of twenty. And it
barely varied: 48 of the 56 buildings sat at reach 1 or 2.

The journey score counts stages rather than markets, so it has a ceiling and
cannot penalise a category for markets it was never going to serve, and it
spreads the same 56 buildings over five bands. Blueprint reach is still on the
card and is still what a monument is drawn from.

### Honesty rules

Anything not real is badged in the UI, and there is now nothing badged: every
visual layer is bound to a measured column. What remains is a gap rather than a
placeholder, since no source measures how deeply a blueprint is used within a
market.

`ai_rfps` used to be one. While the column was empty the rooftops ran on
generated figures showing 28 of 145; the measured column says **8**. The
generated one is now gone from the code and from the published data, and two
tests hold that line: no metric marked `sample` may drive a visual layer, and
no field with `sample` in its name may reach the output at all.

The smart-city layer is a **readiness signal, not a claim that autonomous
procurement is live.**

## Privacy

The source workbook contains blueprint owner names and email addresses.

- `data/raw/` is git-ignored. **The workbook never gets committed.**
- `data/city.json` is derived: no emails, no contacts, no job titles, ever.
- Category manager names are published **only** because
  `config/metrics.yaml` says `people: show: names`, and only in the field meant
  to carry them. Set it to `initials` or `none` and rebuild; nothing else
  changes.
- The build refuses to write output if it finds a contact detail at any
  setting, or a name at a setting that does not allow one. The security suite
  re-checks every tracked file.

## Layout

```
run.py                 the only command anyone needs to run
config/metrics.yaml    which metric drives which visual layer
data/build_city.py     workbook to anonymised city.json
data/city.json         the only data the renderer needs
renderer/city.js       the brick city, the builder, the choreography
renderer/agent.js      the tools, the resolver, the visible trace
app/server.py          serves the page and holds the model credential
app/plan.py            what the model is allowed to decide, and the validation
app/providers.py       mock, Gemini, Vertex AI, Claude behind one interface
tests/test_docs.py     every figure the documents quote, against the data
tests/test_security.py privacy, secrets, what gets distributed, data integrity
tests/                 the rest: data, the plan parser, the model ladder
tests/smoke.js         the browser pass, on a desktop and on a phone
```

The renderer is deliberately dependency-free at runtime. It is the on-stage
fallback path: with no network available, the model still opens from a local file.

## Running it

| Platform | Run this |
| --- | --- |
| Windows | double-click **`run.cmd`**, or `run.cmd` in a terminal |
| macOS, Linux | `./run.sh` |

Setting up a Windows host from scratch, including VS Code, is written out
step by step in [docs/SETUP-WINDOWS.md](docs/SETUP-WINDOWS.md).

From the repository root. That is the whole thing. (`run.sh` is a shell script:
double-clicking it on Windows opens it in a text editor or a browser, which is
Windows telling you it has no idea what the file is, not an error in it.) The
first run makes a virtual environment in `.venv`, installs what it needs,
writes a `.env` if there is not one, starts the service and opens the city in a
browser. Later runs skip straight to the last two.

To use a model, put the key in `.env` and run it again:

```ini
NW_PROVIDER=gemini
NW_API_KEY=your-google-ai-studio-key
```

Nothing else. No second server, no query parameter, no exporting variables into
a shell. The service holds the key and serves the page, so the browser asks its
own address for the agent and the badge on the ask bar names the model that is
answering. With `NW_PROVIDER=mock`, or no key, the badge says so and the city
answers with its own rules.

```bash
./run.sh test       # every check there is, five stages, one verdict
./run.sh eval       # six questions, one per intent, against whatever .env says
./run.sh eval all   # the whole set, if the key allows it
./run.sh build      # rebuild city.json from the workbook in data/raw/
./run.sh package    # a zip of just the city, safe to send to anyone
./run.sh models     # which models the configured key can actually call
```

On Windows the same six are `run.cmd test`, `run.cmd eval`, and so on.

`run.sh test` is the whole thing in one command: 127 data, privacy, document
and security assertions, the agent's question set, then the renderer driven in a real
browser three ways over, from a file, against the running service, and as the
single file that actually gets emailed. Each of the three browser passes runs
again at phone size. It ends with one verdict naming whatever failed.

[docs/TESTING.md](docs/TESTING.md) covers both halves: what that command
checks, and a numbered walkthrough for checking by hand the thing no suite can
judge, which is whether the city reads as a city.

[docs/DEMO.md](docs/DEMO.md) is the on-stage script: what to type, in what
order, and what should happen at each step.

### Without Python

Everything except the model works with no Python and nothing installed: open
`renderer/index.html` in Chrome. `run.cmd` says the same thing, and tells you
how to install Python, if it cannot find one.

### If everything goes wrong

`renderer/index.html` opens straight off the disk, with no server and no
network. The city, the choreography and the agent's own rules all work; only
the model is missing. That is the safety net, and it is why the renderer has no
runtime dependencies.

## The agent

Ask in plain English. The city is what the agent does, not what it talks about.

Without a model the browser uses its own rules, which is also what happens if
the endpoint is slow, unreachable or unsure. The demo never depends on a
network call succeeding. Both paths route the same question the same way, and
the browser suite drives both, because two sets of rules answering one
question differently is a defect that surfaces only in use.

A question asking for a leaderboard gets the leaderboard, and the word decides
which: "who" opens the People board, "which district" opens Districts, and
"which category is doing best" flies to the lot. A ranking sorts on the
journey score unless the question asks about money or reach, and the answer
quotes the measure it actually sorted on.

### The model never sees the numbers

The prompt carries names only: category codes and titles, districts, plots and
markets. The model decides *which* lot to fly to and what kind of answer is
wanted; the tools then run in the browser against `city.json` and work out what
is actually on that lot.

So no figure on screen can have been invented, and no spend figure leaves the
environment while the provider is a temporary endpoint. Replies are
validated before they are used: an invented category is dropped, a category
offered as the scope of an area question is ignored, and a sentence containing
figures is discarded.

### Providers

| `NW_PROVIDER` | Needs | Notes |
| --- | --- | --- |
| `mock` | nothing | Default. No key, no network, deterministic. |
| `gemini` | `NW_API_KEY` | Google AI Studio key. |
| `vertex` | `NW_PROJECT`, `NW_REGION` | Application default credentials, no key. |
| `claude` | `NW_API_KEY` | Anthropic API. |

`Dockerfile` builds the one container that gets deployed: the page and the
service that answers it, together. The same image runs on a local host, on Cloud
Run, and in the internal environment; only the environment variables change.

```bash
PROJECT=your-gcp-project ./deploy/cloudrun.sh
```

[docs/DEPLOY.md](docs/DEPLOY.md) covers the deploy, what is needed from
whoever owns the environment, and how this gets listed in the VP&C Agent
Marketplace.

## Status

- [x] Data pipeline, metric registry, privacy guards
- [x] Renderer, the brick city (isometric, click-to-inspect, `NWCity.focus()`)
- [x] Build choreography, opening city rise, per-category teardown and rebuild
- [x] The character, minifigure, idle wander, flight, speech bubble and caption
- [x] Agent, natural language in, city out, with a visible tool trace
- [x] Night mode, lit windows, lamplight and reactor beams
- [x] Model layer: provider adapter, service, eval set, one-command start
- [x] Streets that read as streets, flyovers, the closing ask
- [x] Checked against the deck, the narrative and the workbook (docs/DESIGN.md §9)
- [x] Guided tour, first-run welcome, demo script, shareable bundle
- [x] Cloud Run deploy, Vertex AI on a service account, no key in the deployment
- [x] Real AI-RFP data, replacing the generated stand-in
- [x] Land area follows spend; occupancy, the journey score, the arc, landmarks
- [x] One-command verification, security suite, manual test script
- [ ] Listed in the Agent Marketplace
- [ ] Speech input, offline bundle
- [ ] A date column in the source, which is the one thing still blocking any
      view of what changed and when

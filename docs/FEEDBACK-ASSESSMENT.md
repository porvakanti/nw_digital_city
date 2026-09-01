# Evaluating the feedback

Hilmi's three notes, assessed against what the data can actually support and
what the all-hands actually needs. Written to decide with, not to send.

The short version: there are two different products in this feedback, the
best idea in it is not the one that got the most words, and about two thirds
of the visual suggestions need data that does not exist in any system we
currently read.

---

## 1. The distinction that decides everything

Two products are being discussed as though they were one, because they would
share a visual language.

| | **The mirror** (built) | **The game** (proposed) |
| --- | --- | --- |
| What it shows | The blueprint estate as it is | What people have done, scored |
| Data | One extract, 145 rows | A live event stream from many systems |
| Time | A snapshot, true on the day | Continuous, forever |
| Who runs it | Nobody. It is a file | Somebody, permanently |
| Fails when | The extract is wrong | People game it, or stop caring |
| Governance | None needed | Works council, DPO, HR |
| Ready | Now | Not for months, and not by anyone's spare time |

Both are good. They are not the same thing, and the risk in the next two
weeks is that enthusiasm for the second quietly derails the first.

**The mirror answers "where are we".** The game answers "who is pulling their
weight". The first is a diagnostic. The second is an incentive system, and an
incentive system is an organisational commitment, not a visualisation.

**Recommendation.** Land the mirror at the all-hands. Use the all-hands to win
the mandate, the owner and the budget for the game. Do not attempt the game
for the all-hands: a points economy with invented points is worse than no
points economy, because the moment one person recognises their own number is
wrong, every other number on the screen is suspect too.

---

## 2. What we can actually see

This is the constraint everything else runs into. Our only source is
`Category_Blueprint_Allhands.xlsx`.

**Real and usable today**

| Field | Spread | Already used for |
| --- | --- | --- |
| Blueprint state | 89 none, 12 draft, 44 active | The ground |
| Market reach | 0 to 16 markets | Building height |
| Spend FY26/27 | €0 to €75m, €760m total | Houses and hotels |
| Blueprint counts | Active and draft per category | The title deed |
| Category tree | 8 / 31 / 145 | The map itself |
| Definitions | Free text per category | Search and tooltips |
| Auction allowed | 13 yes, 73 no, 26 unset | Nothing yet |
| D2C | 28 yes, 26 no, 58 unset | Nothing yet |
| Target savings % | 63 of 112 records, median 8% | Nothing yet |

**Present but unusable**

- **AVA Sourcing adoption**: flat 100% for all 145. No information content.
- **AI-generated RFPs**: empty. What is on screen is seeded placeholder.
- **Trading model, entity type**: 111 of 112 identical. No spread, no signal.

**Not present anywhere, in any column, on any sheet**

- **Any date at all.** No created, modified, last-activity or event date.
- Any person or team identity that could be scored.
- Training records, tool telemetry, agent creation, sharing, realised savings.

That last group is not a gap we can close by looking harder. It is a different
data foundation, and it is what most of the copilot list quietly assumes.

---

## 3. Every suggestion, triaged

Verdicts: **Do** (worth doing, we can), **Ask** (worth doing, needs data we
must go and get), **Hold** (good idea, wrong product or wrong time), **Don't**
(would cost more than it adds).

### From the visual note

| Idea | Verdict | Why |
| --- | --- | --- |
| Remove the green land; size L3 by spend | **Do** | Right call. The parkland is dead pixels and district size currently encodes how many categories a district has, which is the least interesting thing about it. Sizing plots by spend makes the map's geometry carry meaning. One caveat below. |
| Sleeping workers when quiet, builders when busy | **Ask** | The best of the three, and blocked on one specific thing: there is no date column anywhere in the workbook. This needs blueprint created/modified dates, or sourcing events with timestamps. Precise ask, easy to make. |
| Everything that moves must mean something | **Do** | Agree without reservation, and it is a rule worth adopting permanently. Today the cars and trams are ambience. Either they carry data or they go. |

**On sizing plots by spend.** 89 of 145 categories have no recorded spend. If
lot size followed spend, those 89 would shrink to nothing and the single
strongest finding in the whole thing, that 61% of Networks is bare ground,
would visually disappear. So: size the **plot** by spend, keep the **lots**
inside it uniform. Area then means money, the empty lots stay countable, and
Managed Services and Outsourcing correctly becomes the biggest thing on the
map at 37.7% of spend from 10 categories.

### From the copilot list

| Idea | Verdict | Why |
| --- | --- | --- |
| Blueprint coverage: empty land, foundations, completed buildings | **Do** (done) | This is exactly what the city already does. Worth telling Hilmi his instinct and the build already agree. |
| Heavily reused blueprints become landmarks | **Do** | Genuinely good and we have the data. Three categories are live in 7+ markets: A251, A221 and D406. A251 and A221 at 7 and 16 markets are the two most-copied blueprints in Networks. A landmark tier is one line in `config/metrics.yaml`. |
| AI usage lights buildings blue | **Do** (done, on placeholder) | Already the rooftop reactor. Becomes real the day the AI-RFP column has numbers in it. |
| Drones, holograms, futuristic districts | **Don't** | Novelty per item, noise in aggregate. Also nothing to bind them to. |
| Robots for agents deployed | **Ask**, then probably **Hold** | No agent data exists. If the marketplace can emit "agents created per category", this becomes possible. Until then it is decoration. |
| Roads and bridges for collaboration | **Hold** | No collaboration data. There is a real proxy, blueprints shared across markets, but drawing 145 categories times 21 markets as connections produces a hairball. Expensive to build, hard to read. |
| Premium buildings and landmarks for value delivered | **Ask** | No realised-value data. Target savings % exists on 63 records but it is a target, not an outcome, and it is per blueprint not per category. If realised savings can be sourced, this is one of the strongest additions on the list. |
| Statues, flags, mayor's award, team of the month | **Hold** | Not data, editorial. Cheap to add as a hand-curated list, and honest only if labelled as chosen rather than measured. Belongs to the game, not the mirror. |
| Busy streets, city lights for engagement | **Ask** | Needs the same recency data as the sleeping builders. Same single ask covers both. |
| Digital pollution, traffic jams from manual process | **Don't** | Requires process telemetry we do not have, and it renders a negative judgement about a named team on a shared screen. |
| Natural disasters | **Don't** | Same objection, sharper. "Manual Process Storm" over a named district is a public criticism of whoever owns it. Fine in a game people opt into. Not fine in something their director is looking at. |
| **Traditional → Connected → Smart → Autonomous** | **Do, first** | See below. This is the best idea in the thread. |

---

## 4. The best idea is the one at the bottom of the last email

Hilmi calls this his favourite and he is right, for reasons worth spelling out
because they are not obvious:

**It needs no new data.** The four measures we already have are that arc.
A blueprint existing is *traditional*, the estate written down. Market reach
is *connected*, one blueprint working across borders. AI-generated RFPs are
*smart*. Autonomous is the horizon we have not reached, and showing it as
empty is honest rather than embarrassing.

**It is a narrative, not a mechanic.** Points rank people. An arc places
everyone somewhere on a road. Nobody is bottom of an arc.

**It is already half-built.** "What could we build" raises every unbuilt lot
in cyan and the night view lights AI-ready rooftops. Those are two frames of
this story that already exist. What is missing is the framing that says so.

**It is the deck's actual argument.** Blueprints today, smart procurement
tomorrow, which is already the closing line on screen.

This should become the organising narrative now, for the all-hands. It is
mostly a change to what the screen says and the order the tour tells it in.

---

## 5. The points economy: four things nobody has raised

Not objections. Things that will decide whether it survives contact.

**Works council and data protection.** Scoring individual behaviour and
displaying it comparatively is co-determination territory in Germany and
several other markets, and a GDPR question everywhere. This is not a blocker
and it is not a reason to be timid, but it has a long lead time and it must
start before a single point is scored, not after the first screenshot
circulates. If this is going company-wide, it is the longest pole.

**Adjudication.** 500 points for "measurable business value" against 10 for
completing training. Who decides that a given claim is worth 500? Every points
system eventually becomes an argument about the adjudication, and the argument
arrives at whoever runs the scoreboard. Worth deciding the appeals process
before the scoring rules.

**The denominator problem.** A team with three categories cannot out-build a
team with thirty-seven, however good they are. Either scores are normalised by
the size of the estate someone owns, or the comparison has to be explicitly
non-competitive, or small teams learn to ignore it within a quarter.

**Stock and flow, which is where Hilmi's own two notes answer each other.**
Points accumulate and never decay, so a team that did everything in Q1 and
nothing since keeps its skyscraper. That is precisely the failure his sleeping
builders idea fixes: **points measure what you have built, activity measures
what you are doing now, and a city needs to show both.** Building height from
cumulative points, and worksite activity from recency, is a better design than
either note alone. Worth saying back to him, because it is his idea improved
rather than trimmed.

**And the real cost is not the visuals.** It is instrumentation. Every point
needs an event, and every event needs a system to emit it: AVA, Ariba, SAC,
the training platform, the agent marketplace. That is five integrations with
five owners. The city is a week of work on top of that.

---

## 6. What I would do, in order

**Before the all-hands** (all of it possible with data we hold)

1. Adopt Traditional → Connected → Smart → Autonomous as the narrative. Copy,
   legend and tour order.
2. Remove the parkland, size plots by spend, keep lots uniform inside them.
3. Give the moving things meaning or remove them. Vehicle density per district
   bound to spend share is honest and we have the numbers.
4. Add the landmark tier for the three most-reused blueprints.

**Immediately after, if the mandate lands**

5. Ask for a date column and light the worksites.
6. Ask for realised savings and let value earn a building.
7. Point the reactor at the real AI-RFP column the day it has numbers.

**A separate initiative, with an owner and a budget**

8. The points economy, starting with governance and instrumentation, not
   visuals.

---

## 7. What to ask for, precisely

Three asks, in order of how much they unlock:

1. **A date on each blueprint record.** Created or last-modified, either will
   do. This alone unlocks sleeping builders, active worksites, engagement
   lighting and "what changed this month", which is four of the copilot's
   sections from one column.
2. **Realised savings per category**, not target. Unlocks value as a visible
   thing rather than an assertion.
3. **The real AI-generated RFP counts.** The column exists and is empty. The
   day it is filled, the rooftops stop being placeholder.

Everything else on the list needs a system that does not currently talk to us.

---

## 8. On widening beyond Networks

Cheap, and worth being clear about why. The renderer is not Networks-specific:
it draws whatever category tree it is given, and scope is a filter in the
build, currently `Level1 == "Network"`. Widening is a data change, not a code
change.

But the all-hands is a Networks all-hands, and 145 lots is already at the edge
of what reads from the back of a room. Build it so it widens. Do not widen it
for the day.

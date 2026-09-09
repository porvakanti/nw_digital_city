# Iteration plan

Written 9 September, against Tomas's refreshed extract
(`Network_Digital_City__Data.xlsx`) and Hilmi's three notes.

Read section 1 first. There is a correctness problem in the version already
circulating, and the refreshed data both causes it and fixes it.

---

## 1. What changed in the new data

Same 145 categories, same 8 districts, same 31 plots, same codes. **Spend is
identical to the penny across all 145.** So the map does not move.

Two columns changed, and one of them changes the story.

### The AI-generated RFP column is now real, and we are overstating it 3.5x

It used to be empty, so the rooftop lights run on seeded placeholder data
badged "sample" on screen. It now has numbers.

| | Categories lit |
| --- | --- |
| What the file we sent shows | 28 |
| What is actually true | **8** |

The real ones are A212, A213, A251 and A314 with two each, and D303, D333,
D506 and D513 with one each. Only four of them overlap with the placeholder.

**This needs fixing before anyone else opens the file.** It is a one-line
change in `config/metrics.yaml`, pointing the reactor layer at `ai_rfps`
instead of `ai_rfps_sample`. The guardrail that made us badge it as sample
data has done its job; now the real column exists, the placeholder has to go.
Eight lit roofs out of 145 is a weaker picture than twenty-eight and a much
better position to argue from.

### There is a new column, `CBP used`, and it is the most important number anyone has given us

| Blueprints | Count |
| --- | --- |
| Categories with an active blueprint | 44 |
| Categories where a blueprint has actually been used | **4** |

The four are A213 Global Testing (used 3 times), A251 Network Professional
Services (2), D408 Self-Build Fibre (1) and D506 Construction Services (1).

This reframes the entire argument. Today the headline is "89 of 145 lots are
empty". The sharper headline is:

> We have written 44 blueprints. Four of them have ever been used.

That is not a gap in coverage, it is a gap in adoption, and it is a much
harder and more useful thing to put in front of a room. It also gives the city
a visual it does not currently have: a building that is finished but has
nobody in it. Lights off in the windows, no traffic at the door.

### Two things that did not change

- **AVA Sourcing adoption is still a flat 100% for all 145.** So building
  height stays as market reach and the provisional badge stays on. Worth
  telling Kate the answer to that question is still outstanding.
- **Ariba Sourcing is 0 for all 145.** No signal.

### One small reconciliation

`Total CBP` in the new file matches our market-reach count for 143 of 145
categories. Two disagree: D403 (we count 2 markets, the file says 3 blueprints)
and D212 (we count 3 markets, the file says 2). Not material, but it confirms
the two are not quite the same measure and we should say which one we are
drawing. Recommend switching to `Total CBP` as the source of truth, since it
is the column Tomas maintains.

---

## 2. The leaderboard question, answered with the numbers

Hilmi asked whether we can rank the top 3, 5 or 10 category managers from the
data. We can join it: the original workbook carries VPC Category Manager, and
35 named people own the 145 Networks categories.

I ran the leaderboard before recommending against it. Here is what it produces.

**Portfolios are wildly uneven.** 35 managers own between 1 and 14 categories
each, median 3.

**Rank by raw count and you mostly rank portfolio size.** The top manager by
active blueprints has 14 categories and 36% coverage. Correlation between
portfolio size and score is 0.36, so it is not purely size, but the person at
the top is not the person doing best.

**Rank by coverage and you rank smallness.** Six managers sit at 100%. Their
portfolios are 1, 1, 3, 3, 4 and 4 categories. A manager with one category and
one blueprint scores a perfect 100%. That is noise wearing a rosette.

**And on the measure that actually matters, almost everyone is at zero.**

| Measure | Managers with any at all |
| --- | --- |
| A blueprint that has been used | **4 of 35** |
| An AI-generated RFP | **7 of 35** |

A top-5 board therefore publishes a list where 30 of 35 named colleagues are
visibly at zero, on a screen at an all-hands, on measures largely driven by
which categories they were handed.

### What to do instead: recognise, do not rank

The data supports celebration far better than it supports competition, and
there is a genuinely good story in it.

**Name the firsts, not the top.** Four categories have a blueprint that has
actually been used. Eight have started an AI-generated RFP. A221 is live in
sixteen markets, which is more than double the next one. Those are small
enough numbers to name individually and real enough to be worth naming. Call
them pioneers, put a landmark on their lot, and let the person who owns it be
named if they consent.

Nobody is bottom of a list of pioneers. That is the whole difference.

**Compare teams, not people.** District-level comparison is defensible,
statistically steadier and does not put an individual on a screen. Managed
Services and Outsourcing carrying 37.7% of Networks spend from 10 categories
is a fact about a team, and no individual has to answer for it.

**And if an individual leaderboard does go ahead**, it needs three things
first: normalisation by portfolio size, the consent of the people named, and a
works council conversation in Germany and the other co-determination markets.
That is not a reason to drop it. It is a reason not to build it in a week.

---

## 3. The plan

Three horizons. The first is the only one with a date on it.

### Horizon 1: before the all-hands

Everything here uses data we already hold. Nothing needs another person.

| # | Change | Why | Size |
| --- | --- | --- | --- |
| 1 | Point the reactor at the real `ai_rfps` column | We are showing 28 lit roofs where the truth is 8 | One line |
| 2 | Add `cbp_used` to the build and the title deed | The strongest number anyone has given us is currently invisible | Small |
| 3 | An empty-building state: built, unlit, no traffic | Makes "44 built, 4 used" a thing you see rather than a thing you are told | Medium |
| 4 | Traditional, Connected, Smart, Autonomous as the narrative | The best idea in Hilmi's notes, needs no new data, and two frames of it are already built | Copy and tour order |
| 5 | Remove the parkland, size plots by spend, lots uniform inside | Hilmi's call and he is right. Geometry starts meaning money | Medium |
| 6 | Bind traffic to spend, or delete it | "Everything that moves must mean something", adopted as a rule | Small |
| 7 | Landmark tier for the three blueprints live in 7+ markets | A221 at 16 markets should look like it | One line |
| 8 | Name the four pioneers on screen | Recognition without ranking | Small |

Do 1 and 2 first and independently of everything else. They are accuracy, not
enhancement.

If time runs short, cut 5 before 3. The sized plots are the more impressive
change; the empty-building state is the more important one.

### Horizon 2: after the all-hands, if the mandate lands

Each of these is blocked on one thing from one person, so they are asks, not
tasks.

| Ask | From | Unlocks |
| --- | --- | --- |
| A created or last-modified date on each blueprint record | Tomas | Sleeping builders, active worksites, engagement lighting, "what changed this month". Four of the copilot's sections from one column |
| Realised savings per category, not target | Kate or finance | Value earning a building instead of being asserted |
| Whether the flat 100% AVA figure is real | Kate | Height going back to its intended measure and the provisional badge coming off |
| Agent counts per category, if the marketplace can emit them | Foundry | The robots idea, honestly |

None of these are code problems. All of them are somebody-else problems, which
is why they should be asked for in writing this week rather than after.

### Horizon 3: the points economy

A separate initiative with an owner, a budget and a governance workstream. Not
a feature of this. The sequence that would make it real:

1. **Governance first.** Works council and DPO engagement in Germany and the
   other co-determination markets, before a single point is scored.
2. **Instrumentation second.** Every point needs an event, and every event
   needs a system to emit it: AVA, Ariba, SAC, the training platform, the
   marketplace. Five integrations with five owners. This is the real cost.
3. **Rules third**, and with an appeals process. 500 points for "measurable
   business value" against 10 for training is an adjudication problem waiting
   to happen, and it lands on whoever runs the board.
4. **Visuals last**, because they are the week of work, not the quarter.

**Stock and flow.** Hilmi's two notes answer each other and the answer is
better than either. Points accumulate and never decay, so a team that did
everything in Q1 keeps its skyscraper forever. His sleeping-builders idea is
the fix: height from what you have built, worksite activity from what you are
doing now. Build it that way from the start.

---

## 4. What we are deliberately not doing, and why

Worth being explicit so it does not get relitigated every fortnight.

**Drones, holograms, robots, statues, stadiums.** Four encodings is roughly
the limit of what a person reads at once, and we are already at four. Each of
these adds a little alone and collectively turns an instrument into a toy.
Once it looks like a toy, nobody argues with the numbers, which means nobody
acts on them. This is Hilmi's own principle from his first note: keep the
mechanics simple, let the visualisation be the hero.

**Digital pollution, traffic jams, natural disasters.** A "Manual Process
Storm" over a named district is a public criticism of whoever owns it, on a
screen their director is looking at. That works in a game people choose to
play. It does not work here.

**Roads and bridges for collaboration.** No collaboration data exists. The
honest proxy, blueprints shared across markets, drawn for 145 categories
across 21 markets, is a hairball. Expensive to build, hard to read.

**Widening beyond Networks for the day.** The renderer is not
Networks-specific and scope is one filter in the build, so widening is cheap
whenever we want it. But the all-hands is a Networks all-hands and 145 lots is
already at the edge of what reads from the back of a room. Build it to widen.
Do not widen it for the day.

---

## 5. The one-paragraph version

The refreshed data fixes one thing and breaks another: the AI-RFP column is
real now, so the rooftop placeholder has to go, and we are currently
overstating it by more than three to one. The new `CBP used` column is the
most valuable thing we have been given, because 44 blueprints written against
4 ever used is a far sharper argument than 89 empty lots. The manager
leaderboard should become a recognition of four pioneers rather than a ranking
of 35 people, because on the measure that matters 31 of them are at zero
through no fault of their own. And Hilmi's best idea is the one he mentioned
last: Traditional to Autonomous needs no new data, ranks nobody, and is
already half built.

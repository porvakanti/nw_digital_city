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

Three tracks, not three phases. They are separated by **what is stopping
them**, which is the only thing that matters when you have two weeks.

- **Track A** is stopped by nothing. I can do all of it alone, today, with
  data already on disk.
- **Track B** is stopped by one person each. Every item is one email. None of
  it is a code problem.
- **Track C** is a different project with a different owner and a different
  budget. Not a version of this one.

---

### Track A: nothing is stopping this

Eight changes. All use data we already hold. No approvals, no dependencies.
Ordered so that if we run out of time, we stop at a sensible place.

**A1. Show the real AI figures.** *One line. Do first.*
Point the reactor layer at `ai_rfps` rather than `ai_rfps_sample` in
`config/metrics.yaml`. On screen the lit rooftops drop from 28 to 8, and the
"sample data" badge comes off because the number is real.
*Why first:* the file in Hilmi's inbox overstates this more than three to one.
This is a correction, not an improvement, and it should not wait behind
anything.

**A2. Bring in `CBP used`.** *Half a day.*
Add the column to the build so every category carries it, and put it on the
title deed alongside the blueprint counts.
*What you see:* click any lot and the card says whether that blueprint has
ever actually been used.
*Why:* it is the number that changes the argument, and right now it is
invisible.

**A3. The empty building.** *A day or two.*
A new visual state: a finished building with its lights off and no traffic at
the door. 40 of the 44 built lots become empty buildings.
*What you see:* a skyline that is built but dark.
*What you say on stage:* "We have written 44 blueprints. Four of them have
ever been used. This is what that looks like."
*Why:* this is the strongest thing in the whole project and it currently
cannot be seen at all.

**A4. The journey, as the spine of the story.** *A day, mostly words.*
Adopt Hilmi's Traditional, Connected, Smart, Autonomous as the organising
narrative, using the five stages defined in `JOURNEY-SCORE.md`. Rewrite the
legend, reorder the guided tour to walk the arc, and put the Networks score
(35%) in the top bar.
*What you see:* the same city, explaining itself as a journey rather than a
set of four unrelated measures.
*Why:* it is the best idea in Hilmi's three notes, it needs no new data, and
two frames of it are already built.

**A5. Journey score by district.** *A day.*
Show the score per district, with the stage mix beside it. No individuals, no
minimum, no caveats needed.
*What you see:* Transmission Infrastructure at 46%, Network Revenue Platforms
at 19%, and why.
*Why:* it answers Hilmi's leaderboard question in the form the data can
actually support.

**A6. Name the pioneers.** *Half a day.*
Nine categories are at stage 4. Mark them on the map and list them.
*What you see:* nine lots that stand out as the ones that got there.
*Why:* recognition without ranking. Nobody is bottom of a list of pioneers.

**A7. Plots sized by spend, parkland removed.** *Two to three days.*
Hilmi's ask. Plot area becomes proportional to spend; lots stay uniform inside
a plot so the 89 empty ones stay countable.
*What you see:* Managed Services and Outsourcing becomes the biggest thing on
the map, correctly, at 37.7% of spend from 10 categories.
*Why:* geometry starts carrying meaning instead of just counting rows.
*Risk:* the biggest change here and the one most likely to look wrong on the
first attempt. Cut this before A3 if time runs short.

**A8. Traffic means something, or goes.** *A day.*
Bind vehicle density per district to that district's share of spend, or delete
the vehicles.
*Why:* Hilmi's rule, and he is right. Right now they are decoration.

**If time runs out**, the order to stop at is A1, A2, A3, A4. Those four are
the argument. A5 to A8 make it better looking and better evidenced.

---

### Track B: each of these is one email

Nothing here is work. Each is a request, and until it is answered the feature
behind it cannot exist. **Send all four this week**, because the lead time is
theirs, not ours.

**B1. A date on each blueprint record.** *Ask Tomas.*
Created or last-modified, either will do.
*Unlocks:* sleeping builders, active worksites, engagement lighting, and "what
changed this month". Four of the copilot's sections from one column.
*This is the highest-value ask on the list by a distance.*

**B2. Is the flat 100% AVA figure real?** *Ask Kate.*
Still 100% for all 145 in the new extract.
*Unlocks:* building height going back to its intended measure and the
provisional badge coming off. If it is genuinely 100% everywhere, we need to
say so rather than quietly substituting.

**B3. Realised savings per category.** *Ask Kate or finance.*
The workbook has target savings as a percentage on 63 records. Not the same
thing.
*Unlocks:* value earning a building rather than being asserted, which is the
strongest item on the copilot's list.

**B4. Agent counts per category.** *Ask whoever owns Foundry.*
*Unlocks:* the robots idea, honestly rather than decoratively. Lowest priority
of the four.

---

### Track C: the points game

This is Hilmi's SimCity idea and it is a different product, not a later
version of this one. It has a live event stream instead of an extract, an
owner instead of a file, and a governance problem instead of none.

The order matters, and it is not the order people expect:

**C1. Governance, first and now.** Works council engagement in Germany and the
other co-determination markets, plus the DPO. Scoring individual behaviour and
displaying it comparatively is a consultation matter. This has the longest
lead time of anything in the whole plan, and it must start before the first
point is scored, not after the first screenshot circulates.

**C2. Instrumentation, second.** Every point needs an event and every event
needs a system to emit it: AVA, Ariba, SAC, the training platform, the agent
marketplace. Five integrations with five owners. **This is the real cost of
the idea**, and it is invisible in the description.

**C3. Rules, third, with an appeals process.** 500 points for "measurable
business value" against 10 for training is an adjudication problem waiting to
happen, and the argument lands on whoever runs the board.

**C4. Visuals, last.** The city part is the week of work on top of the
quarter. It is the fun bit and it is not the hard bit.

**One design note worth carrying in.** Hilmi's two emails answer each other.
Points accumulate and never decay, so a team that did everything in Q1 and
nothing since keeps its skyscraper forever. His own sleeping-builders idea is
the fix: **height from what you have built, activity from what you are doing
now.** Stock and flow, both visible. Build it that way from the start rather
than discovering it in month four.

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

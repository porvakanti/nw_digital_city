# Delivery plan

How the ten items in `WHAT-WE-BUILD-NEXT.md` actually get done. Internal
working document, not for sharing.

Written 9 September. The all-hands is this month, so the plan is built around
one rule: **every stopping point has to be shippable.** If we run out of time
at any line below, what exists is coherent and true, not half-finished.

---

## The order, and why it is this order

Four batches. Each one ends somewhere we could stop.

| Batch | Items | Rough size | If we stop here |
| --- | --- | --- | --- |
| **1. Truth** | 1, 2 | Half a day | The city stops overstating AI, and carries the best number in the file |
| **2. The argument** | 3, 4 | 2 to 3 days | The adoption gap is visible and the story has a spine |
| **3. The score** | 5, 6, 7 | 2 to 3 days | Every district has a number and the pioneers are named |
| **4. The map** | 8, 9, 10 | 3 to 4 days | Hilmi's visual notes are done |

Total, seven to ten working days with contingency. Batch 4 is the one to cut
if the calendar tightens: it is the most impressive and the least necessary.

---

## Batch 1: truth. Do this first, today

**Item 1, real AI figures.** One line in `config/metrics.yaml`, switching the
reactor layer from `ai_rfps_sample` to `ai_rfps`, plus removing the sample
badge and the seeded column from the build.

**Item 2, blueprint used.** Add `CBP used` to `data/build_city.py`, carry it
into `city.json` as `cbp_used`, and show it on the title deed.

**Also in this batch, unannounced but necessary:** switch the source file to
Tomas's new extract and switch building height from our own market count to
his `Total CBP` column. They agree for 143 of 145 categories and disagree for
two, and his column is the one he maintains, so it should be the one we draw.

**How we will know it worked**
- The whole-city summary reads 8 lit rooftops, not 28.
- A test asserts no metric marked `sample: true` is bound to a visual layer.
- A test asserts the four categories with a used blueprint are exactly A213,
  A251, D408 and D506, so a bad extract cannot pass silently.

**Risk:** low. The riskiest part is the height switch, because it changes two
buildings, and a test will pin which two.

---

## Batch 2: the argument

**Item 3, the empty building.** The real work in this batch. A finished
building whose windows are dark and which has no traffic at its door. It needs
a new material state in the renderer and a rule about when it applies:
blueprint active, `cbp_used` zero.

Forty of the forty-four built lots change appearance, so this will be
immediately obvious and immediately arguable. Get it in front of Praveen the
moment it renders, before polishing.

**Item 4, the arc.** Mostly copy. New legend text, the tour reordered to walk
Traditional to Autonomous, and the progress figure in the top bar. The stage
definitions come straight from `JOURNEY-SCORE.md`, so there is one definition
and not two.

**How we will know it worked**
- A browser check counts dark buildings and asserts 40.
- A browser check asserts the tour visits the four stages in order.
- Read the legend out loud. If it takes more than thirty seconds to explain,
  it is wrong, because that is Hilmi's own bar.

**Risk:** medium, and it is a design risk rather than a technical one. A dark
building has to read as "finished but unused" and not as "broken" or "night
mode". If the first attempt reads wrong, the fallback is a faint outline or a
boarded-up ground floor rather than darkness.

---

## Batch 3: the score

**Item 5, the score in the build.** Compute blueprint, usage and AI components
per category in `data/build_city.py`, and roll up by district and by manager
using the square root of spend. The manager roll-up stays out of `city.json`,
because that file ships to anyone we send the page to and manager identity has
no business in it.

**Item 6, district scores on screen.** A panel showing each district with its
total and the three parts. The parts matter more than the total: five of eight
districts score zero on usage, and that is invisible in a single number.

**Item 7, pioneers.** The nine categories at the top stage get a marker and a
list. Names of people only if they have said yes, and the default is the
category, not the person.

**How we will know it worked**
- A test recomputes Networks from `city.json` and asserts 19, with 16 / 2 / 2.
- A test asserts A251 is the only category at 100.
- A test asserts no manager name appears anywhere in `city.json`.

**Risk:** low technically. The real risk is presentational: a score invites
comparison, so every screen showing it must show the three parts beside it.

---

## Batch 4: the map

**Item 8, plots sized by spend.** The largest change in the plan. The layout
engine currently packs plots by category count; it needs to pack them by spend
while keeping lots even inside each plot, and the eight districts still have
to tile without overlapping or leaving holes.

**Item 9, traffic means something.** Vehicle density per district set from its
spend share, and anything unjustifiable deleted. Small, and satisfying.

**Item 10, landmarks.** One tier added to `config/metrics.yaml` for categories
live in seven or more markets. Three qualify.

**How we will know it worked**
- A test asserts plot areas are in the same rank order as plot spend.
- A test asserts every one of the 145 lots is inside its own plot and no two
  plots overlap.
- A test asserts exactly three landmarks, and that A221 is one of them.

**Risk:** high, and it is the reason this batch is last. Treemap layouts look
wrong long before they are wrong, and the failure mode is a map that is
technically correct and unreadable. If two attempts do not look right, keep
the current layout and remove the parkland only. That still delivers most of
what Hilmi asked for.

---

## Rules for the whole run

**Every batch ends green.** `run.py test` passes: unit tests, the agent's
question set, the browser suite from the file, against the service, and on an
emulated phone. Nothing gets committed on top of a red suite.

**Every batch ends with a package.** `run.cmd package` builds the single file
and drives it in a browser before handing it over. If Praveen wants to show
someone at any point, the thing to show already exists.

**One PR per batch**, so review is possible and a batch can be dropped without
unpicking the others.

**No new placeholder data, ever.** We have just spent a week removing some.
Anything not real either does not appear or is badged on screen.

**Data changes get a test that pins the numbers.** Every finding we say out
loud (8 lit, 4 used, 19 overall, 3 landmarks) becomes an assertion, so a
future extract that quietly changes them fails the suite instead of surprising
somebody on stage.

---

## What could derail this, and the answer

**A third extract arrives mid-flight.** Likely, and fine. The build reads a
named file and the tests pin the numbers, so a new extract either passes or
tells us exactly which figure moved. Budget half a day for it.

**The empty building reads badly.** Covered above: fall back to an outline or
a boarded frontage.

**The treemap fights back.** Covered above: cut to removing the parkland only.

**Someone asks for the points economy before the all-hands.** The answer is
prepared and it is no, with reasons: it needs an event stream from five
systems, an owner, and a works council conversation with a long lead time.
That conversation is worth starting now precisely so it is not on this
critical path.

**The date column arrives early.** The best kind of problem. It unblocks eight
of Hilmi's ideas at once. It does not go into this plan; it starts the next
one, after the all-hands.

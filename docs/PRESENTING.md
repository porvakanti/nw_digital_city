# Walking somebody through it

Twelve minutes of city, then questions. This file is the sequence, the words
that go with each beat, what should be on screen while they are said, and the
answer to every question the walkthrough reliably provokes.

[DEMO.md](DEMO.md) is the operating manual: how to open it, what should
happen, what to do when it does not. This file is what to say.
[READING-THE-CITY.md](READING-THE-CITY.md) is the interpretation behind both,
and is the one to read before either.

---

## Before opening it

Six checks, two minutes.

1. **Decide which artefact.** The Cloud Run URL if there is one, otherwise
   `NW Digital City.html` from `run.cmd package`. Do not open
   `renderer/index.html` from a shared location and hope: it loads four sibling
   files and shows a blank page if any of them is missing.
2. **Check the badge on the ask bar.** It names the model that is answering. If
   it reads **local rules, no model**, that is a working state, not a broken
   one, and there is a line for it below. Know which of the two states is live
   before starting rather than finding out at beat 2.
3. **Ask one question and press `R`.** Warms the model, pays the Cloud Run cold
   start, and proves the network path. On a Cloud Run service where first
   response time matters, redeploy with `--min-instances 1` beforehand.
4. **Full screen, and hide the bookmarks bar.** The panels are positioned
   against the viewport edges.
5. **Collapse the Scoreboard panel** with its header. It is opened deliberately
   at beat 8, and it is a distraction before then.
6. **Zoom the browser to 100%.** The city sizes itself to the viewport; a
   zoomed page is a smaller city, not a larger one.

One decision to make in advance: whether to say the word *agent* early or late.
Saying it early invites the question of what the model is doing, which is
answered properly at beat 2 with the Agent panel on screen. Later reads better.

---

## The arc, in one table

| # | Do this | What it establishes | Time |
| --- | --- | --- | --- |
| 1 | Let it assemble | The estate is one object, and it is bigger than expected | 60s |
| 2 | Type `batteries` | Plain English resolves to one of 145 lots | 90s |
| 3 | Read the lot | Four measures, each bound to a column | 120s |
| 4 | Click a neighbour, hover a third | Every pixel is queryable | 60s |
| 5 | `Where are the biggest gaps?` | Spend without a blueprint behind it | 90s |
| 6 | Press `P` | The size of the unclaimed work | 60s |
| 7 | Press `N` | Adoption, which is the uncomfortable one | 90s |
| 8 | Open the Scoreboard | Position, ranked, without argument | 60s |
| 9 | Press `K` | Four asks | 45s |

Nine beats, about eleven minutes uninterrupted. The order is deliberate: the
city is credible before any figure has to be defended, and the adoption gap
lands after the picture is already trusted.

Pressing `T` runs the same sequence with a card for each beat, advancing on a
click. Use it when driving and talking at once is one thing too many. Driving
it by hand reads better, because typing a question is the demonstration.

---

## Beat 1: the wide view

**Do.** Open it. Do not talk over the assembly; it takes about six seconds and
holds attention on its own.

**Say.**

> This is the Networks category estate. Eight districts, one for each Level 2
> area. Thirty one plots inside them, one per Level 3 group. And 145 lots, one
> for every Level 4 category. Nothing here is invented: it is the blueprint
> tracker, the spend extract and the AI pipeline, rendered.

Then, pointing at the counters top left:

> Fifty six of those 145 lots have a blueprint. Eighty nine are bare ground.
> The whole estate is €760m of addressable spend.

**On screen.** Eight coloured blocks, roads between them, traffic moving, two
trams on the raised lines at the back. Top left: 56 developed, 89 empty lots,
21 markets, €760m. The rail across the bottom sits near the left-hand end of
Traditional.

**If asked why the blocks are different sizes.** A district is as wide as the
number of categories it holds. Access Radio/Fixed holds 37 and is the largest.
Lot area inside a plot follows spend per category, square-root compressed,
because the largest plot is 400 times the smallest and drawn literally the
small end would be one pixel.

**If asked about the dark ground between districts.** Undeveloped land. It
carries no meaning and no data. District plates are rectangles sized to hold
the widest row of plots, so a district with uneven rows has spare ground inside
its kerb.

**Hold this line back until somebody asks.** Managed Services and Outsourcing
has 10 categories and carries €286m of the €760m, which is 38% of the estate in
two plots. That is more than the next two districts put together, in a block
that reads as small because it holds 10 categories.

---

## Beat 2: ask it something

**Do.** Type `batteries` into the ask bar. One word, lower case, no code.

**Say, while it is flying.**

> That was plain English. It resolved to D504, looked up its figures and drove
> the city to it. Every tool it called is listed on the right, in the order it
> called them.

**On screen.** The Agent panel lists `find_category`, `get_metrics`, `render`.
The builder crosses the city and lands beside the lot. The lot is demolished
and rebuilt in order: foundation, floors, property, roof light. The card on the
right names the category and its four measures.

**The point to make here, and the one a review comes back to:**

> The model decides which lot and what kind of question. It never sees a
> figure. Spend, adoption, scores, owners: none of that is in the prompt. The
> browser resolves every number locally from a file that shipped with the page.
> So nothing on screen can have been invented by the model, and no commercially
> sensitive value leaves the environment.

**If asked what happens on a question it cannot answer.** Type `banana bread`
later, at beat 9. It says it cannot find that rather than guessing, and the
Agent panel shows the resolution failing rather than a fabricated lot.

**If the badge says local rules, no model.** Say it plainly and move on:

> The model is not reachable from here, so the browser is routing this with its
> own rules. It handles every question in this walkthrough. The badge says which
> is answering, always, so nobody has to guess.

---

## Beat 3: read one lot

**Do.** Stay on D504 Batteries. Point at each part as it is named.

**Say.**

> Four measures, and they are built in the order they are named.
>
> The **foundation** is whether a blueprint exists at all. Green for active,
> amber for draft, nothing for bare ground.
>
> The **height** is the journey score, which is the composite: 40 points for
> the blueprint existing and spreading, 35 for anybody using it, 25 for AI
> readiness. Batteries is five floors on 40 out of 100.
>
> The **houses** are spend, on the Monopoly ladder. One house up to €1m, two to
> €5m, three to €20m, four to €50m, and above that a single hotel. Batteries
> carries €39m, so four houses.
>
> The **light on the roof** is AI readiness: whether the rules are structured
> enough that a request for proposal has actually been drafted by a model.

**On screen.** Green foundation, a five-floor tower, four green houses along
the front of the lot, a lit roof.

**If asked why the hotel matters.** Six lots carry one. Four of them stand on
an active blueprint and one on a draft. The sixth is A311 Field Maintenance:
€75m, the largest single category in the estate, and no blueprint at all. A
hotel on bare ground is spend with nothing governing it, and there are 20 lots
in that shape holding €176m between them.

**If asked whether the houses are progress.** No, and this is the one layer
that is not. Spend is recorded whether or not a blueprint exists. The houses
say how much is at stake on that lot, not how far it has come.

**If asked about the monuments.** Eight lots have one instead of a building.
They are earned by the composite score, threshold 50, capped at ten so they
stay scarce, and assigned from the markets that have adopted the blueprint.
A251 Network Professional Services scores 100 and carries Big Ben. A monument
replaces the building, not the property: the lot keeps its houses or its hotel,
and the lot itself is widened to hold the monument. Both the threshold and the
cap are single lines in `config/metrics.yaml`, and reassignment happens at
every build with nothing tracked by hand.

---

## Beat 4: everything is queryable

**Do.** Hover a building in a neighbouring plot. Then click it. Then click bare
ground to clear. Then start typing `net` in the ask bar and let the suggestions
appear.

**Say.**

> Hover anything and it says what it is. Click it and you get the title deed:
> the definition, the markets, the four measures with their thresholds, the
> score broken into its three components. The marker goes on top of the
> building and the card sits beside it, never over it.
>
> And the ask bar completes as you type, with the lot code beside each match,
> so a category nobody can spell is still one keystroke away.

**On screen.** A hover label under the cursor. On click, a yellow pin above the
building, the card on the right, and a speech bubble beside the lot rather than
over it.

**If asked how many people this is for.** The Scoreboard has a People tab, and
it ranks blueprint owners by the score of what they hold. Names come from the
tracker under the disclosure policy in `config/metrics.yaml`; nothing else
identifying is in the derived dataset, and the source workbook is never
committed.

---

## Beat 5: where the gaps are

**Do.** Type `Where are the biggest gaps?`

**Say.**

> Eighty nine of 145 lots are bare ground. The agent ranks them by what is at
> stake and flies to the largest.

**On screen.** It lands on A311 Field Maintenance and reports 89 empty lots,
the biggest worth €75m with no blueprint.

**The line to land.**

> That is one category, €75m, and no blueprint at all: a hotel standing on
> bare ground. It is not buried in a tab of a spreadsheet. It took one question
> in plain English to find it.

**If asked whether the estate is really that empty.** Fifty six lots have a
blueprint record, 44 of them active, 12 draft only. The 89 are categories where
no blueprint has been started. That is the tracker's own position at the
extract date.

---

## Beat 6: what could be built

**Do.** Press `P`.

**Say.**

> Everything already built goes grey. What rises in its place is what the
> record already justifies: 12 categories with a draft blueprint, and 20 with
> no blueprint but real spend behind them. Each one only as tall as its own
> record supports.
>
> Nothing here is a forecast. There is no model of the future in this
> application. It is what is already on the sheet, drawn.

**On screen.** The light drops, built lots drain to grey, 32 lots rise in cyan
in a wave across the map with a beam over each. The caption reads 12 drafts and
20 lots carrying €176m.

**Do.** Press `P` again to come back.

---

## Beat 7: after dark

**Do.** Press `N`.

**Say.**

> Night does two jobs.
>
> The roofs are AI readiness. Eight categories out of 145 have had a request
> for proposal drafted by a model. Eight columns of light, and 137 dark roofs.
>
> Then the windows. Four buildings in the whole city keep their lights on,
> because four blueprints have ever been used for a live sourcing event. Fifty
> two of the 56 built lots are drained to grey with the windows dark.

Pause before the next line.

> Fifty six blueprints exist. Four have been used. That is the gap, and it is
> not a slide about adoption, it is a dark city.

**On screen.** Night. Street lamps on alternate kerbs. Eight roof columns.
Four lit buildings: D506, A251, D408 and A213. The caption names the 8 of 145.

**If asked which four.** Construction Services/Civil Works, Network
Professional Services, Self-Build Fibre and installation services, and Global
Testing. All four hold a monument as well, because using a blueprint is worth
20 marks and carries a category past the monument threshold on its own.

**If asked whether that is a data problem.** Partly, and say so. `cbp_used`
arrived in the 9 September extract and counts sourcing events run through a
blueprint. Four is what it reports. What it cannot tell you is whether a
blueprint was used informally without being recorded.

---

## Beat 8: the position, ranked

**Do.** Press `R` for daylight. Open the Scoreboard panel. Start on Districts,
then switch to Categories.

**Say.**

> One score, three components: 40 points for the blueprint existing and
> spreading, 35 for anybody using it, 25 for AI readiness. Networks scores 19
> out of 100.
>
> Look at where the 19 comes from. Sixteen of the 40 coverage points, 1.6 of
> the 35 usage points, 1.7 of the 25 AI points. The estate has been documented
> and not adopted. That is the whole diagnosis in three figures.

Switch to Categories.

> Per category the score is discrete, because it is a sum of fixed rungs.
> A251 scores 100, A213 85, D506 75. A district score is a spend-weighted
> average of its categories, so it lands anywhere: Access Radio/Fixed reads 28,
> and no single category in it scores 28.

**On screen.** The Scoreboard ranks eight districts, top to bottom. The rail
across the bottom of the screen shows the estate near the left-hand end of
Traditional.

**If asked why the rail says Traditional.** The four stages are the maturity
arc, and 19 of 100 sits at the beginning of it. The rail is not a target, it is
a position, and it moves when usage moves rather than when documentation does.

**If asked to defend the weightings.** They are three lines in
`config/metrics.yaml`. Changing them changes the scoreboard, the rail and the
monuments at the next build, with no code change. The weighting is a judgement,
and it is configurable because it is a judgement. What the current split says
is that a blueprint written and spread everywhere, and used by nobody, tops out
at 40 of 100.

**Press `H` here if the question turns into an argument.** The explainer is
generated from the same config that drives the drawing, so it cannot drift from
what is on screen. It has the rung table, the worked examples, and the section
on why a district scores a figure no category does.

---

## Beat 9: the four asks

**Do.** Press `K`.

**Say.**

> Four asks, and they are the reason for all of it.

Read the four as they appear. Do not paraphrase them: they are short, and
they are what the rest of it is for.

**On screen.** The city dims, four numbered asks take the screen, signed off
"Blueprints today. Smart procurement tomorrow." A click anywhere returns.

**Then hand it over.** Press `R` and leave the wide city on screen.

> Type a category, a district, a market or a whole question. Twenty one markets
> resolve by name. It is one URL and there is nothing to install.

---

## Questions that come up, with the answers

| Question | Answer |
| --- | --- |
| Is this real data? | The blueprint tracker, the spend extract and the AI pipeline, each at its own extract date, which is recorded in the data and shown in the explanation. Owner names are in the derived set under the disclosure policy; the source workbook is never committed and the build refuses to write output if it finds a name or an email address in the figures. |
| Where does the AI actually sit? | One call, to work out which of 145 lots a question means and what kind of question it is. Everything else, the figures, the tools, the animation, the scoring, is in the browser. |
| What does a question cost? | About 2,500 tokens in, 60 out. Only typed questions cost anything. Clicking, night mode, the tour and the scoreboard cost nothing. |
| What if the model is down? | The browser answers from its own rules and the badge says so. Every question in this walkthrough works without a model. |
| Can it be wrong about a category? | It can resolve to the wrong lot. Every wrong resolution becomes a case in `run.sh eval`, so it stays fixed. A category the city does not have is dropped rather than passed through. |
| Is there a trend? | No. No source carries a history. Every figure is the position at the extract date, and the application states that rather than implying movement. |
| Why a city and not a dashboard? | A dashboard makes 145 categories a scrollable list, where every row costs the same attention. A city makes size, emptiness and darkness visible at once, and the outliers find you. |
| Could this cover more than Networks? | The geography is the category tree, and the build reads a spend extract and a blueprint tracker. Another organisation is another extract, not another application. |
| Who owns the gaps? | The People tab ranks blueprint owners by the score of what they hold. |
| How long did this take? | Answer with the shape, not the duration: one container, one data file, one config file, and the explanation is generated from the config so it cannot drift. |
| Is it in the marketplace? | It is one entry in `data/agents.json` with a deep link, which needs no code change in Foundry. Embedding it in the page is about ten lines there and one environment variable here. See [DEPLOY.md](DEPLOY.md). |
| Can it be deployed internally? | Same container, three environment variables. There is no model to provision: Gemini on Vertex AI is a publisher model. See [GCP-SETUP.md](GCP-SETUP.md). |

---

## Drills

Knowing these in advance is cheaper than working them out live.

**A question hangs.** The service waits six seconds, then the browser answers
with its own rules and the badge changes to *model did not answer*. Do not
retype the question into the silence. Say what happened and continue.

**A question resolves to the wrong lot.** Say so, click the right lot instead,
and note the question afterwards. The recovery is one click and the honesty
costs nothing.

**429, 503 or repeated timeouts.** The free tier's rate limit, which is per
model. Put `NW_MODEL=gemini-3.5-flash-lite` in `.env` and restart, or continue
on the browser's rules.

**Black screen.** No WebGL in that browser. Chrome.

**The page opens blank.** `renderer/index.html` on its own. Use the packaged
single file or the URL.

**A panel is in the way.** Click its header to collapse it, or drag the
header to move it. The body scrolls on its own and the scroll does not reach
the city behind it.

**Forgotten where the reset is.** `R`. It returns daylight, the wide view and
nothing selected, from any state.

---

## What not to do

- **Do not read the explainer out.** Press `H` only when a question needs a
  table to answer it, and close it again.
- **Do not call the score a target.** It is a summary of stages reached, it
  flatters coverage over value, and the application says so in its own caveats.
- **Do not defend the weightings as objective.** They are a judgement, they are
  configurable, and saying that is stronger than defending them.
- **Do not narrate the animation.** It is six seconds and it holds attention
  without commentary.
- **Do not promise the embedded marketplace view.** The deep link works today
  with a data change. The embedded surface is a small change in Foundry that
  nobody has asked for yet.
- **Do not claim potential mode is a plan.** It draws what the record already
  justifies. There is no forecast in the application.

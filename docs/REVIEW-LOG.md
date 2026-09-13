# Review findings, and how to check each one

Twenty-nine findings from a walkthrough of the running application, what was
done about each, and how to verify it on the page. Every row is checkable in
the interface: nothing here asks you to read the source.

Open the packaged file (`NW Digital City.html`) or `run.cmd serve`, and dismiss
the welcome card. Where a row says **press N**, that is night mode; **H** opens
the explanation.

Three findings were answered rather than changed, and they are marked as such.
Two are decisions that could reasonably go the other way, and they are marked
too.

---

## A. The figure and the landmarks

**1. The mark on the front of the figure.**
The supplied logo, at `renderer/vest-mark.png`, named by `city.vest_mark` in
the config and inlined by the build as a data URI so it survives into the
single-file bundle. A club shirt was not used: the kit is third-party
intellectual property and this is going into an internal estate.

The vest was reshaped for it. A real hi-vis has two full-length vertical bands
and a horizontal one, and drawn front-on at this scale that is a capital H,
which is exactly what a viewer reported seeing. The verticals are now shoulder
straps and the band has dropped to the waist, which leaves the whole chest for
the mark.

`city.vest_mark` also takes `speechmark`, which draws the device as geometry
and needs no asset; `none`, for a plain vest; a `data:` URI already inlined;
or any other word, which is set as text on a badge. Replacing the logo is
replacing one PNG.

Keep any replacement small. It is base64-encoded into the bundle and drawn
about a centimetre across, so 128 pixels square is already more than the plate
can show; the current one costs 23KB encoded against a 1MB file.
*Check:* at the default zoom the figure carries the mark on a red chest, and
no letter. Zoom in and it resolves. It stays the same at night, because print
on a vest is reflective and is drawn unlit.

**2 and 8. Landmark scale against the buildings.**
A monument replaces the building rather than standing on it, on a lot widened
to the ground its shape needs, up to two and a half cells. Every assembly
clears the tallest plain tower by construction rather than by luck of the
data.

The shapes are sized to a common **silhouette area**, not a common height.
One height was the first rule and it did not work: the shapes are nowhere
near a common proportion, so Big Ben at the same height as the Parthenon
occupied a seventh of the screen and both towers read as splinters that had
to be looked for. Equal area alone is no good either, since the clocktower
would have to stand fifteen units to match a colonnade's mass. So area,
bounded by a height band: a tower is allowed to be tall, because being tall
is what a tower is. What makes the set read as one class is the stone and the
terrace, which every one of them has.
*Check:* find any monument at the default zoom. It is taller than every plain
building and stands on visibly more ground. Big Ben and the Berlin TV Tower
are now the tallest things in the city at about 12.5 units against 7.5 for
the wide shapes and 6.4 for the tallest plain tower.

**8, second half. A221 was the tallest on markets adopted.**
Height is the journey score now, so A221 is a five-floor block at 40 out of
100. It is live in sixteen markets, more than twice the next, and has never
been used.
*Check:* type `A221`. The reading is "40 out of 100 on the journey. Connected:
one blueprint, several markets. Never used, live in 16 markets."

**9. A landmark marker on the title deed.**
A sandstone chip with the monument's name sits directly under the category
title, and a row lower down gives the reason it was earned.
*Check:* click any monument lot. The chip reads, for example, "The Parthenon",
and "Earned it" reads "scores 60 out of 100, and Greece has adopted this
blueprint".

**19. What the condition for a landmark is.**
Stated in three places: the legend, under Journey progress, says "Landmark at
50+"; the deed says which market and why; the explanation has the full table.
*Check:* read the indented line in legend item 2, then press **H** and find
The monuments.

---

## B. The arc

**5 and 22. Clicking a lot left the arc reading the organisation.**
The arc now reads the selected category first, with the organisation figure
retained on the line below it, so both markers are explained.
*Check:* click any lot. The arc reads "A251 100 / 100", the stage, and the
three components, with "Networks overall 19 / 100" below. Press **R** and it
returns to the organisation reading.

**6. Definitions for Traditional, Connected, Smart and Autonomous.**
Two readings per stage, both from the config. A short one on the rail, where
there is room for a few words, and a definition in the explanation, where
there is room to say what the band actually requires. The first version of the
table carried the short reading in both places, and a stage named is not a
stage defined.

The explanation's table gives each stage its score range, how many of the 145
lots are in it, and what it means in terms of the marks:

| Stage | Score | Lots | Requires |
| --- | --- | --- | --- |
| Traditional | 0 to 39 | 121 | Anything short of a blueprint live in more than one market |
| Connected | 40 to 53 | 17 | The rules written and live in several markets, and nothing else |
| Smart | 54 to 74 | 4 | The blueprint plus a sourcing event, worth 20, or a generated brief, worth 15 |
| Autonomous | 75 to 100 | 3 | Written, in repeated use, and generating its own briefs |

The counts are computed from the data rather than written down, so the table
cannot claim a distribution the estate does not have.
*Check:* click lots with different scores and read the line under the rail.
Then press **H** and find The score.

**12. "Skyscraper, across XX markets" was not a useful reading.**
The reading leads with the score, then the stage it reaches, then what is and
is not carrying it. A score of nought has its own wording, because drafting a
blueprint already scores ten, so nought means there is no blueprint at all.
*Check:* type `A251`, then `A221`, then `A311`. The third is bare ground and
the rail says "Traditional: no blueprint yet", not "a blueprint exists".

---

## C. What the city is showing

**4. District sizing, and the space outside the coloured block.**
*Answered, and the layout tightened.* The coloured kerb is the district
boundary. The paler slabs inside it are plots, one per Level 3 group. The grey
between the plots is the district's own ground, and the grey outside the kerb
is street. Leased Lines has a large plate because it holds sixteen categories,
and only some of that plate is plots.

The dead space was real and is now much smaller: the gap between plots was
halved, districts pack deepest-first with each row centred, and the margin
round the whole city is sized from the tallest thing that actually stands
rather than from the tallest the tiers allow, and per lot rather than as
though every lot stood on the boundary. The plate came down from 171 × 189.

It then went back up to 142 × 170, because the margin turned out to be too
small rather than too large. It is there so a tall object near the edge has
ground behind it under this projection, and it had been sized from the
buildings alone: the tram viaducts are taller than most of them and run on
the ring road *outside* the districts, so their distance from the block
counts against them rather than for them. They were five units short and
their overhead wire was standing against the void. A check now measures every
lot and the viaducts against the plate.
*Check:* look at any district. Kerb, then plots, then the street outside. The
remaining grey inside a district is genuinely unused ground, and the
explanation says so.

**7. What height and width mean.**
Height is the journey score. Lot area is spend, square-root compressed, and it
is now on the card.
*Check:* legend item 2 for height. Then click any lot and read the Land row:
"Among the largest lots in the city, because FLM & Field Operations averages
€35m across its 8 categories".

**10. Whether markets adopted is the right measure for height.**
*A decision.* It is not, and height moved to the journey score. Market reach is
a count with no denominator: no source says which markets a category applies
to, so a category live in both of its two relevant markets scores worse than
one live in five of twenty. It also barely varied, putting 48 of 56 buildings
at reach one or two. The score counts stages, has a ceiling, and spreads the
same 56 buildings over five bands. `market_reach` is still in the config as an
alternative binding and still on the card.
*Check:* press **H**, read What is drawn and what drives it, where each layer
shows the measure behind it as `height ← journey_score`.

**11. A step-by-step explanation of the city.**
Press **H**, or the button at the foot of the legend. The ground, every layer
with the measure behind it and how its values map to tiers, the score and its
stages, how a monument is earned, and a closing section on what the data
cannot tell you.
*Check:* open it and read it end to end. It is generated from the config, so if
a layer binding is ever changed this page changes with it.

**20. Grey against glowing windows.**
Occupancy is legend item 4, drawn as a facade with three panes in the state
being described. A monument follows the same rule.

**No building in the city currently has lit windows.** All four categories anybody has run a sourcing event through scored
high enough to earn a monument, and a monument has no windows, so the signal
appears as floodlighting instead. The legend says so, counted from what is
standing rather than asserted, so the line corrects itself the day a used
category does not have a monument on it.
*Check:* read legend item 4 and the indented line under it. Then press **N**:
the four that light up are the four in use, and all four are monuments.

**24. Lot size and traffic were not discoverable.**
The legend's opening paragraph names both. The deed's Land row says where the
lot sits in the range and why. The explanation's ground section gives the
compression and the reason for it.
*Check:* read the legend's first block, then any lot's Land row.

---

## D. Night

**3 and 18. No reactor light on the rooftops at night.**
Eight categories have a generated brief, and each carries a reactor that runs
from dark through a flicker to a full glow, with a beam over it after dark.

The beam used to be on the top rung alone, so four of the eight lit rooftops
had nothing to read at a distance: a disc under a unit across disappears at
the default camera, and the city looked as though four categories had AI
activity when eight do. A first attempt now gets a short beam and repeated use
a tall one, which keeps both facts and keeps them in order.

The beam also tapers, narrow at the roof and full at the top. A straight
cylinder is the same width thirteen units up as it is at the roofline, which
reads as a bar rather than as light leaving something, and it puts the widest
part where there is nothing behind it to compete with. Not too narrow at the
base: at a fifth of the top width the two thin beams came to a point and
looked broken.
*Check:* press **N**. Eight rooftop lights: tall beams on A212, A251, A213 and
A314, which have two generated briefs each, and short ones on D506, D303, D513
and D333, which have one.

**21. The four lit lots did not stand out at night.**
Every one of the four categories anybody has run a sourcing event through
earned a monument, so when the monument replaced the building the lit-window
layer stopped encoding anything: the only four lots carrying the signal were
the only four with no windows to put it in. Monuments now follow the same rule
as the buildings. By day an unused monument's stone is washed towards the same
cold neutral as an unused facade; by night a used one is floodlit.
*Check:* press **N**. Four monuments come up warm and four stay dark. The warm
four are the only four categories in Networks anybody has used: D506 and A251
in Access Radio/Fixed, D408 in Fixed, and A213 in Managed Services and
Outsourcing.

The outlines on the eighty-nine empty lots also dim after dark. They are drawn
unlit, so their opacity is their brightness whatever the hour, and at the
daylight setting they turned into a wireframe mesh over the whole city at
night with the four that matter lost inside it.
*Check:* press **N** and look for the outlines. They are still there, and they
no longer compete with anything.

---

## E. Panels and cards

**13. The agent panel overlapped the scoreboard.**
Fixed, and asserted: a check measures every panel on a desktop viewport and
fails if any two intersect.
*Check:* open the agent trace by asking a question. Nothing covers anything
else. Panel headers can also be dragged.

A second fault in the same area was found later and fixed. The panels pass the
pointer through so the transparent gaps in their bounding boxes do not block
the city, and a scrollbar belongs to the panel element rather than to a child:
on the two panels that scroll, grabbing the scrollbar did nothing and the drag
fell through to the canvas, which panned the city. The same rule was stopping a
click on the explanation's backdrop from closing it. The scrollbars are also
wider now, because a target a few pixels across is one you aim at and miss.
*Check:* make the window short enough that the legend and an open card both
overflow, then drag each scrollbar. The panel scrolls and the city stays
still. Click outside the explanation and it closes.

**14, 23 and 27. The scoreboard was not self-explanatory.**
Renamed from Journey, which was the same word as the score it ranks by. Every
row names its three components against the ceiling each is scored out of, so
the colour key at the foot of the panel is gone.
*Check:* the panel is titled Scoreboard, and a row reads "blueprint 18 of 40 ·
used 4 of 35 · AI 6 of 25". Switch to People: the leader reads 28 of 40, 19 of
35, 14 of 25, which is what those three numbers were.

**26. The cards needed more of the board game in them.**
The deed carries the Monopoly rent ladder's equivalent: "Still on the table",
the marks not yet earned, named as the thing somebody would have to do.
*Check:* click A311, the largest empty lot. It reads "40 for finishing the
blueprint · 35 for running a sourcing event through it · 25 for generating the
brief from the rules".

**15. A monument hidden by the district label.**
The label no longer floats over the district. It is cut into the district's own
ground, in a strip reserved along the near edge, so it cannot cover anything.
*Check:* read all eight names. Then press **N**: they light up in their own
district colour, the colour the kerb carries.

**16. A monument partly hidden by a neighbouring building.**
Monuments are on the ground on widened lots, and a check measures every
footprint against every other and fails on any overlap.
*Check:* look at each of the eight. None is behind or inside anything.

**28. The speech bubble covered the marker pin.**
The bubble was anchored above the figure's head, and it tracked a constant
scale while the pin tracked the live one, so the two drifted apart as the
camera pulled back.

Fixed twice. The bubble moved above the pin, which uncovered the pin and left
the bubble over the building instead: the figure stands at the foot of
whatever is selected, so on anything tall the words landed on the roof, and
"The Parthenon stands here" was printed across the Parthenon.

Now the pin marks the **lot** while one is selected, sitting above whatever is
built on it, and the bubble goes **beside** that lot rather than above it,
cleared of the lot's own width on screen with the tail pointing back at the
pin. It picks the side with less in the way and can slide up or down to dodge
a panel, because the title deed opens on the right the moment a lot is
selected and the legend holds the left; the tail is drawn wherever the pin
ends up relative to the bubble, so it keeps pointing at the right thing. With
nothing selected the pin goes back over the figure's head, because then the
figure is the thing worth finding.
*Check:* click a monument, a plain tower and an empty lot. The pin is on top
of each; the bubble is beside it and covers neither the lot nor a panel. A
check measures this against the lot's projected silhouette rather than its
bounding box, because a lot projects to a hexagon and half of its bounding
box is empty corner.

---

## F. The agent

**25. "Germany" gave a count and its largest category.**
A market now gets its score, where it ranks, how many of its blueprints
anybody has used, and the monuments it supplies. Markets holding fewer
blueprints than the score's minimum are listed but not ranked, the same rule
the people board runs on.
*Check:* type `Germany`, then `Italy`, then `which markets are doing best`.
Italy holds two blueprints, one of them the only category in Networks at 100,
and rolls up above Germany's twenty-three: it is deliberately withheld from the
ranking, because that is an artefact of the denominator and not a finding.

**29. A nonsense question flew to a lot.**
The resolver has a floor measured against the data rather than guessed: the
weakest legitimate name match scores 0.485 and the strongest nonsense match
0.419, so the floor sits between them.
*Check:* type `ply recommend a good italian restaurant`. It declines and says
what it does accept.

**17. Only four hotels for six qualifying categories.**
*Answered.* Six categories are over the hotel threshold. Four have a live
blueprint and so have something to build on. A308 is drafted, which is the
yellow marked-out lot, and A311 has no blueprint at all. A hotel on bare
ground would say a building exists where none does.
*Check:* click A311. Property reads Hotel and Blueprint reads Empty lot: the
spend has earned it and nothing has been built to put it on. A check in the
suite asserts exactly this list.

---

## Still open

| Item | Why it is open |
| --- | --- |
| The Colosseum is unclaimed | A251 is the only qualifying category holding Italy, and UK is first in the preference order, so Big Ben wins. One of the two must go unassigned. Reordering `landmarks.by_market` swaps which. |
| "How do I reset my password" zooms the city out | The word trips the reset intent. Tightening the pattern risks the legitimate phrasings. |
| District plates are 34% to 56% plots | Closing it needs a two-dimensional packer rather than shelf packing, for a few per cent each. |
| No date in any source | The one thing blocking any view of what changed and when. It needs a change at the source. |

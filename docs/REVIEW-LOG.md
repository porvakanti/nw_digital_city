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

**1. The mark on the hero character's chest.**
A wordmark on a name badge across the chest, set from `city.vest_wordmark` in
the config, in the interface typeface. A club shirt was not used: the kit is
third-party intellectual property and this is going into an internal estate.

The vest itself was reshaped for it. A real hi-vis has two full-length
vertical bands and a horizontal one, and drawn front-on at this scale that is
a capital H, which is exactly what a viewer reported seeing. The verticals are
now shoulder straps and the band has dropped to the waist, which leaves the
whole upper chest for the name.

The badge is dark letters on a pale patch rather than white on the vest red.
At the default zoom the whole figure is about forty pixels tall, so no
lettering survives; a pale bar across the chest still reads as a name badge,
where white letters on red read as nothing.
*Check:* at the default zoom the figure carries a pale badge. Zoom in and it
reads. It stays legible at night, because print on a vest is reflective and is
drawn unlit.

**2 and 8. Landmark scale against the buildings.**
A monument replaces the building rather than standing on it, on a lot widened
to the ground its shape needs, up to two and a half cells. All nine shapes are
drawn to one height so the set reads as one class of object, and the assembly
always clears the tallest plain tower by construction rather than by luck of
the data.
*Check:* find any monument at the default zoom. It is taller than every plain
building and stands on visibly more ground. Then compare two: Big Ben is a
needle on one cell, the pyramids are a range on two and a half, and both
finish at the same height.

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
Each stage carries a one-line definition, from the config, shown on the arc.
The explanation has the score range for each.
*Check:* click lots with different scores and read the line under the rail.
Then press **H** and find The score, which gives Traditional 0 to 39,
Connected 40 to 53, Smart 54 to 74, Autonomous 75 to 100.

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
rather than from the tallest the tiers allow. The plate went from 171 × 189 to
132 × 160.
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

Worth knowing before anybody asks: **no building in the city currently has lit
windows.** All four categories anybody has run a sourcing event through scored
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
*Check:* press **N**. Eight rooftop lights with beams, on D506, A212, A251,
D303, D513, A213, D333 and A314.

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
The bubble is anchored above the pin rather than above the head, and it tracks
the figure's live scale rather than a constant, so the two no longer drift
apart as the camera pulls back.
*Check:* ask any question. The yellow pin stays visible under the bubble at
every zoom.

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

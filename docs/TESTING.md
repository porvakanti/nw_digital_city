# Testing

Two ways to check this, and you need both. The automated suite proves the
numbers and the wiring. Only a person can say whether the city reads as a
city.

---

## Part 1: the automated suite

One command, from the repository root:

```
py run.py test
```

On Mac or Linux, `python3 run.py test`. It takes about two minutes, makes its
own virtual environment the first time, and finishes with one verdict rather
than five summaries to interpret.

### What runs, in order

| Stage | What it proves | Fails if |
| --- | --- | --- |
| **1. Data and privacy** | 180 assertions over `city.json`, the figures every document quotes, the plan parser, the model ladder and the service, including the whole security suite | a figure quoted in a document no longer matches the data, or a name, a contact detail or an API key could reach anyone |
| **2. The agent's question set** | the questions from the walkthrough, end to end, against whatever `.env` names | a question that worked yesterday now resolves to the wrong place, or to nowhere |
| **3. The renderer from a file** | the city opens, draws, answers and stays usable on a phone screen | a lot overlaps another, a plot contradicts its spend, a control lands off-screen, or the console throws |
| **4. The renderer against the service** | the served page finds its own endpoint, asks for a plan and acts on the answer | the deployed path is broken, which the file path cannot see |
| **5. The file we send** | the inlined single file does all of the above on its own | inlining broke something, and the file in somebody's inbox is a blank page |

Stages 3 to 5 need a browser. If they are skipped, the command says so and
prints the two commands that enable them. Enabling them is required once: those stages
are the only thing that can see a broken renderer.

### The security suite, specifically

27 assertions, and they exist because this repository sits next to a workbook
with blueprint owner names and email addresses in it.

- **Secrets.** No credential in any tracked file, `.env` ignored and untracked,
  `.env.example` holds no real key, nothing baked into the container image.
- **Personal data.** No contact detail anywhere in the output at any setting.
  Names permitted only where `config/metrics.yaml` says so and only in the
  field meant to carry them. The source workbooks are not tracked.
- **What gets distributed.** The packager builds from a named list and never
  walks a folder, because a directory walk is how a workbook ends up in a zip.
  The single file carries no contact details.
- **Web exposure.** The key stays server-side. Framing refused unless an origin
  is named. The plan endpoint cannot return an error to the browser, because a
  500 there would take a live demo down with it.
- **Renderer safety.** No `eval`, no `new Function`. Whatever somebody types
  reaches the DOM as text.
- **Data integrity.** The score weights total 100. District totals agree with
  the whole. No placeholder metric drives a visual layer, and no field with
  `sample` in its name survives into the published data at all.

Two of these were written after a real mistake. The placeholder rule exists
because generated AI-RFP figures were overstating the picture by more than
three times in a file that was already circulating. The reachability rule
exists because a Close button sat off the edge of a phone screen and the suite
at the time could not see it.

### The document check, specifically

53 of those assertions read the documents and rebuild each figure they quote
out of `city.json`. A stale number in a document is worse than a stale number
in code: nothing fails, the error is not surfaced, and the figure gets repeated. Six
were wrong when the check was written, left over from before the category
manager cells were parsed properly, and the failure names the document and the
exact string to change.

### Running one part

```
py run.py eval                 the agent's questions only
py run.py build                rebuild city.json from the workbook
.venv/bin/python3 -m unittest tests.test_security -v
.venv/bin/python3 -m unittest tests.test_docs -v
node tests/smoke.js            the browser pass on its own
```

---

## Part 2: the manual walkthrough

Work through this and note anything that does not match. The figures below come
from the current extract and are what the screen should say.

Open it: double-click **NW Digital City.html**, or run `py run.py` and let it
open a browser. Chrome or Edge. Give it a couple of seconds to draw.

### A. It opens and the shape is right

1. Eight coloured districts, 31 paler plots inside them, 145 squares of land.
2. The ground between districts is dark grey. It is undeveloped land and means
   nothing. If it looks green or interesting, that is a bug.
3. Drag to rotate, scroll to zoom, drag with the right button to pan.
4. The header reads **56 developed / 89 empty lots** and **€760m**.
5. The panel top right reads **4** blueprints in use. That number is the point
   of the whole thing, and it should be the sharpest figure on the screen.

### B. The four measures, one at a time

6. **Bare ground.** Most of the city. 89 lots with nothing on them.
7. **Yellow outlines, no foundation.** 12 lots. Drafted, not live.
8. **Green foundations.** 44 lots. Live somewhere.
9. **Height.** Type **A251**. It is **A251**, the tallest thing in the city at
    100 out of 100, and the only category that has done the whole journey. Then
    type **A221**: live in 16 markets, never used, and a five-floor block.
    Height is progress now, not spread.
10. **The score, broken down.** With **A251** selected, the title deed's
    **Journey progress** row reads `Skyscraper (100)` with a bar filled end to
    end and `blueprint 40 of 40`, `used 35 of 35`, `AI 25 of 25` beneath it.
    Then type **D513**: the same number of components, `blueprint 40 of 40`,
    `used 0 of 35`, `AI 15 of 25`, and a bar with no green in it. The card and
    the scoreboard must agree on both, because they are drawn by the same two
    functions. A total with no split is the fault this step exists to catch.
11. **Houses and hotels.** Six red hotels only: A206, A310, A311, D408, D403,
    A308. If you can find a seventh, that is a bug.
12. **Rooftop lights.** Eight, and only eight: A212, A213, A251, A314, D303,
    D333, D506, D513.

### C. Occupancy, the newest layer

13. Most built buildings look drained towards grey with dark windows.
14. Four do not: **A213**, **A251**, **D408**, **D506**. Full district colour,
    lit windows.
15. Press **N** for night. The city goes dark and those four stay lit. That
    contrast is the point of the layer, so it has to read clearly: if it is hard
    to see, say so.
16. Press **N** again to come back.

### D. The arc

17. Bottom of the screen: Traditional, Connected, Smart, Autonomous, with a
    marker on the rail.
18. It reads **Networks 19 / 100 · 40% written, 5% used, 7% with AI**.
19. The marker sits early on the rail, in Traditional. Nothing is anywhere near
    Autonomous, and that is honest.
20. Click any lot. A second marker appears showing where that category sits
    against the whole.

### E. The scoreboard, three views

21. **Districts.** Eight rows, highest first. Access Radio/Fixed 28,
    Transmission Infrastructure 23, Energy 22, Fixed 20, Managed Services and
    Outsourcing 19, Leased Lines 13, Software and Core 12, Network Revenue
    Platforms 9.
22. Five of the eight have **nothing** on the usage bar. That is the finding.
23. **Categories.** 145 rows. A251 at the top on 100, the only category in
    Networks that has done the whole journey. A213 85, D506 75, D408 60.
24. **People.** 30 rows out of 38 people. The eight below three categories are
    withheld on purpose: one category and one blueprint is a coin toss, not a
    track record.
25. Every row shows three bars and names all three components against the
    ceiling each is scored out of, never just a total. The leader reads
    **blueprint 28 of 40 · used 19 of 35 · AI 14 of 25**. Check that split
    against second place: the leader is first because of real usage, and that
    is visible in the components and invisible in the total.
26. Click any row. The camera should fly to the relevant place.

**This is the view to look at hardest.** It puts colleagues in an order. If
anything about it feels wrong to show, that is the finding worth reporting.

### F. The landmarks

27. 8 monuments, one per category scoring 50 or more on the journey. The
    monument marks progress; the shape says which market it travelled to:

| Code | Category | Monument | From |
| --- | --- | --- | --- |
| A251 | Network Professional Services | Big Ben | UK, score 100 |
| A213 | Global Testing | Brandenburg Gate | Germany, score 85 |
| D506 | Construction Services/Civil Works | The Pyramids | Egypt, score 75 |
| A212 | Operations Support System (OSS) Services | Berlin TV Tower | Germany, score 65 |
| D408 | Self-Build Fibre & installation services | The Parthenon | Greece, score 60 |
| D513 | Power Supply | Hagia Sophia | Turkey, score 55 |
| D333 | TV Software | Rozafa Castle | Albania, score 55 |
| A314 | Access Transmission Services | Palace of the Parliament | Romania, score 50 |

28. Each stands **in place of** its building, on the ground, on a low stone
    terrace. The lot underneath is widened to the ground the shape needs, so a
    monument lot is visibly larger than its neighbours as well as taller:
    every monument clears every plain tower. All eight are drawn to one
    height, because the monument marks that the threshold was passed and the
    score itself is on the title deed, the arc and the scoreboard.
29. Each monument comes from a market that actually adopted that blueprint.
    Hover one and the tooltip names it; click it and the card carries the name
    beside the category and the reason it was earned lower down.
30. Germany supplies two, because it carries two high scorers and 23 of the
    112 blueprint records, more than any other market.
31. A221 has **no** monument, though it is live in 16 markets. It has never
    been used, and the threshold is progress now. That is the intended
    consequence, not a fault.

### G. Land follows money

32. The largest place in the city is **FLM & Field Operations**, at €283m.
33. Compare **Managed Services and Outsourcing** (10 lots, €286m) against
    **Access Radio/Fixed** (37 lots, €86m). The small district with the money
    should be obviously dense with large lots.
34. No lot should ever overlap another. The suite checks all 145, but trust
    your eyes too.
35. Roads are busier near expensive districts. Subtle by design. Check it is
    not so subtle as to be invisible.

### H. The agent

36. Type each of these into the box and check where it lands:

| Type this | Should go to |
| --- | --- |
| `A221` | that category |
| `batteries` | D504 |
| `field maintenance` | A311 |
| `how is energy doing` | the Energy district |
| `worst in software and core` | Software and Core |
| `packet switching` | that plot |
| `Germany` | every lot Germany has adopted |
| `banana bread` | nothing, gracefully |

37. Leaderboard questions. The scoreboard should open on the named board,
    and the spoken answer should name whoever is at the top of it:

| Type this | Should open | And say |
| --- | --- | --- |
| `who is doing best` | People | the top manager, with the three components |
| `who is doing well` | People | the same |
| `who is the top category manager` | People | the same, not a category |
| `show me the leaders` | People | the same |
| `who is behind` | People | the board, lowest of interest |
| `which district is doing best` | Districts | Access Radio/Fixed on 28 |
| `the category leaderboard` | Categories | A251 on 100 |
| `which category is doing best` | flies to a lot | A251, 100 out of 100 |

38. Two things to watch on those. The sentence must name the same thing that
    is top of the board it opened, and a ranking must quote the measure it
    actually sorted on. Both used to be wrong: every one of these answered
    with A221, which leads on blueprint reach and has never been used, and
    asking for a category *manager* named a category.
39. `which category leads on spend` and `biggest category by value` should
    still rank by money, not by the score.

40. Market questions answer about markets, which is a dimension the
    scoreboard does not have a view for:

| Type this | Should say |
| --- | --- |
| `which markets are doing best` | a ranking of the markets holding three blueprints or more |
| `which market is furthest behind` | the same ranking, from the bottom |
| `Germany` | 23 blueprints, its score and rank, how many are used, and the two monuments it supplies |
| `Italy` | its score, and that two blueprints is too few to rank |
| `UK` | its score, and that it supplies Big Ben |

    Italy is the one to look at. Two blueprints, one of them the only category
    in Networks at 100, roll up above Germany's twenty-three. Quoting that as
    a rank would be a league table nobody could defend, so it is withheld the
    same way a manager below three categories is.

41. A district answer carries its score and its place, not only its size:
    `how is Energy doing` reads **Energy scores 22 out of 100, 3rd of the
    eight districts**.

42. Start typing a category name. Suggestions should appear.
43. Hover any lot. A label names it with its status and spend, and on one of
    the eight monument lots it names the monument and the market it came from.
44. Ask something awkward on purpose. It should decline rather than invent.

### I. The explanation

45. Every district name is cut into the ground along the near edge of its own
    plate, not floating over it. All eight are set at the same size, so the
    three long ones are on two lines: the constraint is width, not the strip,
    and one line of "Managed Services and Outsourcing" across a district 33
    units wide cannot be set any larger. Press **N** and they light up in
    their own district colour, the same colour the kerb carries.
46. Click **The full explanation** at the foot of the legend, or press **H**.
47. The sheet is generated from `config/metrics.yaml`, so it is the one place
    to check that the words and the drawing still agree. Every layer is listed
    with the measure behind it, in `layer <- metric` form. If a binding was
    changed and this page was not, the page is wrong and a test will say so.
48. The last section is **What this does not tell you**: no time dimension,
    adoption depth unmeasured, a score is a summary, and the people view ranks
    portfolios rather than people. Read it as a reviewer who has been handed
    the conclusion and not the data. If any of it reads as an excuse rather
    than a caveat, say so.

### J. The keys

49. **T** guided tour. Watch it end to end. The Close button must be reachable.
50. **N** night. **P** what we could build. **K** the ask. **R** resets.
    **H** opens the full explanation, and Escape closes it.
51. Every one of these should also work as a button, because not everybody
    knows the keys.

### K. On a phone

52. `py run.py serve lan`, then open the address it prints on a phone on the
    same wifi. **You cannot do this by sending the HTML file: iOS will not open
    a downloaded HTML file in a browser.** The URL is the only way in.
53. Buttons replace the keyboard shortcuts.
54. Nothing is laid over anything else, and the page does not scroll sideways.
55. Pinch to zoom, drag to rotate.
56. Open the tour. The Close button must be on the screen.
57. Type a question. It should still work.

### L. Try to break it

58. Resize the window to something narrow and tall, then very wide.
59. Zoom all the way in, then all the way out.
60. Click a lot, then another, then the same one twice.
61. Press every key during the tour.
62. Open the browser console (F12) and look for red. There should be none.

---

## Reporting what you find

Useful: what you did, what happened, what you expected. A screenshot for
anything visual.

Most useful of all: **anything that looks like it means something but does
not.** Every part of this picture is supposed to encode something real, and a
shape that reads as significant while carrying no information is the worst
failure mode this project has.

## Known soft spots, so you are not reporting these back

- **Building height is a substitute.** The proper column is AVA Sourcing
  adoption, which reads a flat 100% for all 145 categories, so using it would
  make every building an identical tower and the skyline would say nothing.
  Height is market count instead, and is badged provisional on screen.
- **No source we hold has a date.** So the city cannot show what changed this
  month, and cannot tell a standing start from a slow decline.
- **20 categories have a blueprint and no recorded spend**, 14 live and 6
  drafted. The map
  therefore holds empty lots with money on them and built lots with none.
  Whether that is a data gap or genuinely nothing is an open question with the
  data owners.

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
| **1. Data and privacy** | 127 assertions over `city.json`, the figures every document quotes, the plan parser, the model ladder and the service, including the whole security suite | a figure quoted in a document no longer matches the data, or a name, a contact detail or an API key could reach anyone |
| **2. The agent's question set** | the questions from the stage script, end to end, against whatever `.env` names | a question that worked yesterday now resolves to the wrong place, or to nowhere |
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

18 of those assertions read the documents and rebuild each figure they quote
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
10. **Houses and hotels.** Six red hotels only: A206, A310, A311, D408, D403,
    A308. If you can find a seventh, that is a bug.
11. **Rooftop lights.** Eight, and only eight: A212, A213, A251, A314, D303,
    D333, D506, D513.

### C. Occupancy, the newest layer

12. Most built buildings look drained towards grey with dark windows.
13. Four do not: **A213**, **A251**, **D408**, **D506**. Full district colour,
    lit windows.
14. Press **N** for night. The city goes dark and those four stay lit. That
    contrast is the point of the layer, so it has to read clearly: if it is hard
    to see, say so.
15. Press **N** again to come back.

### D. The arc

16. Bottom of the screen: Traditional, Connected, Smart, Autonomous, with a
    marker on the rail.
17. It reads **Networks 19 / 100 · 40% written, 5% used, 7% with AI**.
18. The marker sits early on the rail, in Traditional. Nothing is anywhere near
    Autonomous, and that is honest.
19. Click any lot. A second marker appears showing where that category sits
    against the whole.

### E. The journey panel, three views

20. **Districts.** Eight rows, highest first. Access Radio/Fixed 28,
    Transmission Infrastructure 23, Energy 22, Fixed 20, Managed Services and
    Outsourcing 19, Leased Lines 13, Software and Core 12, Network Revenue
    Platforms 9.
21. Five of the eight have **nothing** on the usage bar. That is the finding.
22. **Categories.** 145 rows. A251 at the top on 100, the only category in
    Networks that has done the whole journey. A213 85, D506 75, D408 60.
23. **People.** 30 rows out of 38 people. The eight below three categories are
    withheld on purpose: one category and one blueprint is a coin toss, not a
    track record.
24. Every row shows three bars, never just a total. Check the leader's split
    against the second place: the leader is first because of real usage, and
    that is visible in the bars and invisible in the number.
25. Click any row. The camera should fly to the relevant place.

**This is the view to look at hardest.** It puts colleagues in an order. If
anything about it feels wrong to show, that is the finding worth reporting.

### F. The landmarks

26. 8 monuments, one per category scoring 50 or more on the journey. The
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

27. Each stands **in place of** its building, on the ground, on a low stone
    terrace. The lot underneath is widened to the ground the shape needs, so a
    monument lot is visibly larger than its neighbours as well as taller:
    every monument clears every plain tower. All eight are drawn to one
    height, because the monument marks that the threshold was passed and the
    score itself is on the title deed, the arc and the scoreboard.
28. Each monument comes from a market that actually adopted that blueprint.
    Hover one and the tooltip names it; click it and the card carries the name
    beside the category and the reason it was earned lower down.
29. Germany supplies two, because it carries two high scorers and 23 of the
    112 blueprint records, more than any other market.
30. A221 has **no** monument, though it is live in 16 markets. It has never
    been used, and the threshold is progress now. That is the intended
    consequence, not a fault.

### G. Land follows money

31. The largest place in the city is **FLM & Field Operations**, at €283m.
32. Compare **Managed Services and Outsourcing** (10 lots, €286m) against
    **Access Radio/Fixed** (37 lots, €86m). The small district with the money
    should be obviously dense with large lots.
33. No lot should ever overlap another. The suite checks all 145, but trust
    your eyes too.
34. Roads are busier near expensive districts. Subtle by design. Check it is
    not so subtle as to be invisible.

### H. The agent

35. Type each of these into the box and check where it lands:

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

36. Leaderboard questions. The journey panel should open on the named board,
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

37. Two things to watch on those. The sentence must name the same thing that
    is top of the board it opened, and a ranking must quote the measure it
    actually sorted on. Both used to be wrong: every one of these answered
    with A221, which leads on blueprint reach and has never been used, and
    asking for a category *manager* named a category.
38. `which category leads on spend` and `biggest category by value` should
    still rank by money, not by the score.
39. Start typing a category name. Suggestions should appear.
40. Hover any lot. A label names it with its status and spend.
41. Ask something awkward on purpose. It should decline rather than invent.

### I. The keys

42. **T** guided tour. Watch it end to end. The Close button must be reachable.
43. **N** night. **P** what we could build. **K** the ask. **R** resets.
44. Every one of these should also work as a button, because not everybody
    knows the keys.

### J. On a phone

45. `py run.py serve lan`, then open the address it prints on a phone on the
    same wifi. **You cannot do this by sending the HTML file: iOS will not open
    a downloaded HTML file in a browser.** The URL is the only way in.
46. Buttons replace the keyboard shortcuts.
47. Nothing is laid over anything else, and the page does not scroll sideways.
48. Pinch to zoom, drag to rotate.
49. Open the tour. The Close button must be on the screen.
50. Type a question. It should still work.

### K. Try to break it

51. Resize the window to something narrow and tall, then very wide.
52. Zoom all the way in, then all the way out.
53. Click a lot, then another, then the same one twice.
54. Press every key during the tour.
55. Open the browser console (F12) and look for red. There should be none.

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

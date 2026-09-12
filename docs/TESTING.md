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
| **1. Data and privacy** | 105 assertions over `city.json`, the plan parser, the model ladder and the service, including the whole security suite | a figure quoted in a document no longer matches the data, or a name, a contact detail or an API key could reach anyone |
| **2. The agent's question set** | the questions from the stage script, end to end, against whatever `.env` names | a question that worked yesterday now resolves to the wrong place, or to nowhere |
| **3. The renderer from a file** | the city opens, draws, answers and stays usable on a phone screen | a lot overlaps another, a plot contradicts its spend, a control lands off-screen, or the console throws |
| **4. The renderer against the service** | the served page finds its own endpoint, asks for a plan and acts on the answer | the deployed path is broken, which the file path cannot see |
| **5. The file we send** | the inlined single file does all of the above on its own | inlining broke something, and the file in somebody's inbox is a blank page |

Stages 3 to 5 need a browser. If they are skipped, the command says so and
prints the two commands that enable them. It is worth doing once: those stages
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

### Running one part

```
py run.py eval                 the agent's questions only
py run.py build                rebuild city.json from the workbook
.venv/bin/python3 -m unittest tests.test_security -v
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
9. **Height.** Find **A221** (type it in the box). 16 storeys, the tallest thing
   in the city. Most buildings are one or two.
10. **Houses and hotels.** Six red hotels only: A206, A310, A311, D408, D403,
    A308. If you can find a seventh, that is a bug.
11. **Rooftop lights.** Eight, and only eight: A212, A213, A251, A314, D303,
    D333, D506, D513.

### C. Occupancy, the newest layer

12. Most built buildings look drained towards grey with dark windows.
13. Four do not: **A213**, **A251**, **D408**, **D506**. Full district colour,
    lit windows.
14. Press **N** for night. The city goes dark and those four stay lit. That
    single frame is the argument, so it has to land: if the difference is hard
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

26. Five monuments, one per category whose blueprint reached five or more
    markets:

| Code | Category | Monument | From |
| --- | --- | --- | --- |
| A221 | Spring 2/R - SW/PS | Big Ben | UK, 16 markets |
| A251 | Network Professional Services | The Colosseum | Italy, 8 markets |
| D406 | Spring 2/R - HW | The Parthenon | Greece, 7 markets |
| A201 | Installation/Commissioning | The Pyramids | Egypt, 5 markets |
| D504 | Batteries | Brandenburg Gate | Germany, 5 markets |

27. Each replaces the tower rather than sitting on top of it, so it is visible
    from a normal camera angle.
28. Each monument comes from a market that actually adopted that blueprint.
    Click one and the card says which.
29. Are they readable at a glance from across the city, or do they just look
    like odd buildings? Worth an opinion.

### G. Land follows money

30. The largest place in the city is **FLM & Field Operations**, at €283m.
31. Compare **Managed Services and Outsourcing** (10 lots, €286m) against
    **Access Radio/Fixed** (37 lots, €86m). The small district with the money
    should be obviously dense with large lots.
32. No lot should ever overlap another. The suite checks all 145, but trust
    your eyes too.
33. Roads are busier near expensive districts. Subtle by design. Check it is
    not so subtle as to be invisible.

### H. The agent

34. Type each of these into the box and check where it lands:

| Type this | Should go to |
| --- | --- |
| `A221` | that category |
| `batteries` | D504 |
| `field maintenance` | A311 |
| `how is energy doing` | the Energy district |
| `worst in software and core` | Software and Core |
| `packet switching` | that plot |
| `Germany` | every lot Germany has adopted |
| `who is doing best` | a ranking, highest first |
| `banana bread` | nothing, gracefully |

35. On that second-to-last one: it ranks by **blueprint reach**, because that
    is the default measure for a ranking question. Now that the journey score
    and the People view exist, "who is doing best" arguably ought to mean the
    journey score instead, and "who" arguably ought to mean people rather than
    categories. Worth a view on which answer you would want on stage. Related:
    `who is doing well` currently resolves to nothing at all.
36. Start typing a category name. Suggestions should appear.
37. Hover any lot. A label names it with its status and spend.
38. Ask something awkward on purpose. It should decline rather than invent.

### I. The keys

39. **T** guided tour. Watch it end to end. The Close button must be reachable.
40. **N** night. **P** what we could build. **K** the ask. **R** resets.
41. Every one of these should also work as a button, because not everybody
    knows the keys.

### J. On a phone

42. `py run.py serve lan`, then open the address it prints on a phone on the
    same wifi. **You cannot do this by sending the HTML file: iOS will not open
    a downloaded HTML file in a browser.** The URL is the only way in.
43. Buttons replace the keyboard shortcuts.
44. Nothing is laid over anything else, and the page does not scroll sideways.
45. Pinch to zoom, drag to rotate.
46. Open the tour. The Close button must be on the screen.
47. Type a question. It should still work.

### K. Try to break it

48. Resize the window to something narrow and tall, then very wide.
49. Zoom all the way in, then all the way out.
50. Click a lot, then another, then the same one twice.
51. Press every key during the tour.
52. Open the browser console (F12) and look for red. There should be none.

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
- **20 categories have a live blueprint and no recorded spend.** The map
  therefore holds empty lots with money on them and built lots with none.
  Whether that is a data gap or genuinely nothing is an open question with the
  data owners.

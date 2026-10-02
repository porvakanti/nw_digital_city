# The product film

A silent 1080p film of the city, cut from recordings of the renderer driving
itself. One command rebuilds the whole thing:

```
python3 run.py film
```

Everything the film is made of is in [film.yaml](film.yaml): the nine shots,
what the browser is asked to do for each, which part of each recording the cut
draws on, how long every beat runs, and what the three text frames say. There
is nothing to edit anywhere else.

```
python3 run.py film            record anything missing, then cut
python3 run.py film record     re-record every shot, then cut
python3 run.py film cut        cut from the recordings already on disk
```

Everything is written to `film/out/`, and none of it is tracked: the
recordings and intermediate beats are more than sixty megabytes of footage
that nothing downstream reads, and the finished `NW-Digital-City.mp4` is
distributed outside the repository rather than carried by every clone.

## The three stages

**Record.** `film/record.js` opens `renderer/index.html` from disk in Chromium
and keeps one video per shot. `file://` is the strictest environment the city
runs in, and it is the one the recordings should show. Interface elements that
carry reading instructions, keyboard hints or touch controls are hidden, and so
is the model badge: without an endpoint it reads as an unfinished product
rather than as the development affordance it is.

**Trim.** Every recording opens on the welcome dialog, and the shoot cannot
say when it clears. The recording clock and the wall clock do not agree when
the frames come from a software renderer, so a head trim timed by the shoot
leaves the dialog in the picture, which is what happened to the first cut of
all nine shots. It is measured from the frames instead: the dialog's button is
the only saturated red in the middle of an unfocused city, so counting red
pixels inside a fixed window finds the last frame that still shows it. The
window, the thresholds and the safety margin are under `record.trim`.

**Cut.** Each beat is encoded on its own to identical settings and the beats
are joined with the concat demuxer, which keeps the joins frame accurate
without a second encode of the footage. Joins are straight cuts. The only
dissolves are the fade up at the start, the fade to black before the end
frame, and the text frames fading through their own alpha.

## Why the text is drawn rather than burnt in

The ffmpeg that imageio-ffmpeg ships carries no `drawtext` filter, so every
word on screen is drawn by `film/cards.py` as a PNG with an alpha channel and
composited by the `overlay` filter. That constraint turned out to be worth
keeping even where `drawtext` exists: a card that is an image can be faded
independently of the footage under it, and its layout can be checked without
running an encode.

Figures on a card are never literals. A card names a path into
`data/city.json` and the value is read when the frame is drawn:

```yaml
rows:
  - {figure: totals.with_blueprint, label: categories have a blueprint, colour: white}
  - {figure: totals.in_use,         label: have ever been used,         colour: red}
```

A refreshed extract therefore cannot leave a wrong number burnt into a picture
that nobody will think to check. `tests/test_film.py` holds the rest of the
config to the same standard: every category and district the shots fly to has
to exist in `city.json`, and every key a shot presses has to be one the
renderer still binds.

## What is not here

The film is delivered silent, with a blank stereo track so it opens in an
editor and in a slide deck without an audio error. The narration and the music
go on afterwards.

The narration is not tracked, for the same reason `docs/PRESENTING.md` is
not: it is written to be spoken by one person, and it is not part of what this
repository hands over.

## Requirements

`node` and `playwright` for recording, and Pillow, numpy and imageio-ffmpeg
for the rest. `run.py` installs the Python side into `.venv` on first use.
Recording takes several minutes of browser and encoder time, which is why it
is its own command and not a stage of `run.py test`.

# The reel

A narrated, scored two-minute cut, built as motion graphics over the live
city rather than as a recording of it. It is made to move people to act:
write a blueprint, use it, and let AI build on it. Five acts:

| Act | What it shows |
| --- | --- |
| The promise | Procurement as a city: one plot of land, then all 145 categories sized by spend, flown onto the plan while a blueprint is defined, as the city rises |
| The climb | One street in one take: empty ground, a draft, a blueprint live across markets, one in use with AI, then the category at 100. Each lot rebuilds as the camera arrives, with the stage rail and the three parts of the score filling beneath it |
| The challenge | Where Networks stands: 56 with a blueprint, 44 active; a night flight past the 8 roofs lit by AI and the 4 buildings lit by use; 19 out of 100, the first of four stages |
| The agent | The product on a floating stage. Atlas is asked for Batteries and flies across the city to build it; then asked what could be built, and the city it could be rises |
| The vision | The lift from using what is written, then write it, use it, let AI build on it |

Version 4 is what `film/reel/` builds now: 150 seconds. Version 3 is commit
`64c7da2`, version 2 is commit `b5d118d` and version 1 is commit `8ff73ad`;
check any of them out and run the same command to rebuild it. Version 4
calls the spend year to date, pushes in on the ask box while each question
is typed, and turns Atlas to face the camera once it lands. Version 3 says Networks Digital City, flies the
night mode roof to roof past the eight reactors and the four lit landmarks,
follows Atlas, the guide figure, as it is asked for Batteries and flies
across the city to build it, and sweeps through the city it could be as it
rises. Both of those moments are slowed: the page's clock runs at a third of
the film's while they play.

One command rebuilds the whole thing:

```
python3 run.py film
```

Everything the film is made of is in [film.yaml](film.yaml): the nine shots,
what the browser is asked to do for each, which part of each recording the cut
draws on, how long every beat runs, and what the three text frames say. There
is nothing to edit anywhere else.

```
python3 run.py film            record anything missing, then cut
python3 run.py film record     re-record every shot, then cut
python3 run.py film cut        cut from the recordings already on disk
```

Everything is written to `film/out/`, and none of it is tracked: the
recordings and intermediate beats are more than sixty megabytes of footage
that nothing downstream reads, and the finished `NW-Digital-City.mp4` is
distributed outside the repository rather than carried by every clone.

## The three stages

**Record.** `film/record.js` opens `renderer/index.html` from disk in Chromium
and keeps one video per shot. `file://` is the strictest environment the city
runs in, and it is the one the recordings should show. Interface elements that
carry reading instructions, keyboard hints or touch controls are hidden, and so
is the model badge: without an endpoint it reads as an unfinished product
rather than as the development affordance it is.

**Trim.** Every recording opens on the welcome dialog, and the shoot cannot
say when it clears. The recording clock and the wall clock do not agree when
the frames come from a software renderer, so a head trim timed by the shoot
leaves the dialog in the picture, which is what happened to the first cut of
all nine shots. It is measured from the frames instead: the dialog's button is
the only saturated red in the middle of an unfocused city, so counting red
pixels inside a fixed window finds the last frame that still shows it. The
window, the thresholds and the safety margin are under `record.trim`.

**Cut.** Each beat is encoded on its own to identical settings and the beats
are joined with the concat demuxer, which keeps the joins frame accurate
without a second encode of the footage. Joins are straight cuts. The only
dissolves are the fade up at the start, the fade to black before the end
frame, and the text frames fading through their own alpha.

## Why the text is drawn rather than burnt in

The ffmpeg that imageio-ffmpeg ships carries no `drawtext` filter, so every
word on screen is drawn by `film/cards.py` as a PNG with an alpha channel and
composited by the `overlay` filter. That constraint turned out to be worth
keeping even where `drawtext` exists: a card that is an image can be faded
independently of the footage under it, and its layout can be checked without
running an encode.

Figures on a card are never literals. A card names a path into
`data/city.json` and the value is read when the frame is drawn:

```yaml
rows:
  - {figure: totals.with_blueprint, label: categories have a blueprint, colour: white}
  - {figure: totals.in_use,         label: have ever been used,         colour: red}
```

A refreshed extract therefore cannot leave a wrong number burnt into a picture
that nobody will think to check. `tests/test_film.py` holds the rest of the
config to the same standard: every category and district the shots fly to has
to exist in `city.json`, and every key a shot presses has to be one the
renderer still binds.

## What is not here

The film is delivered silent, with a blank stereo track so it opens in an
editor and in a slide deck without an audio error. The narration and the music
go on afterwards.

The narration is not tracked, for the same reason `docs/PRESENTING.md` is
not: it is written to be spoken by one person, and it is not part of what this
repository hands over.

## Requirements

`node` and `playwright` for recording, and Pillow, numpy and imageio-ffmpeg
for the rest. `run.py` installs the Python side into `.venv` on first use.
Recording takes several minutes of browser and encoder time, which is why it
is its own command and not a stage of `run.py test`.

# The reel

A narrated, scored two-minute cut, built as motion graphics over the live
city rather than as a recording of it. It is made to move people to act:
write a blueprint, use it, and let AI build on it. Five acts:

| Act | What it shows |
| --- | --- |
| The promise | Procurement as a city: one plot of land, then all 145 categories sized by spend, flown onto the plan while a blueprint is defined, as the city rises |
| The climb | One street in one take: empty ground, a draft, a blueprint live across markets, one in use with AI, then the category at 100. Each lot rebuilds as the camera arrives, with the stage rail and the three parts of the score filling beneath it |
| The challenge | Where Networks stands: 56 with a blueprint, 44 active; a night flight past the 8 roofs lit by AI and the 4 buildings lit by use; 19 out of 100, the first of four stages |
| The agent | The product on a floating stage. Atlas is asked for Batteries and flies across the city to build it; then asked what could be built, and the city it could be rises |
| The vision | The lift from using what is written, then write it, use it, let AI build on it |

Version 2 is what `film/reel/` builds now. Version 1 is commit `8ff73ad`:
check it out and run the same command to rebuild it. Version 2 opens on the
metaphor and defines a blueprint, shows night mode as it is (eight roofs lit
by AI, four sets of windows lit by use), names the agent Atlas and lets it
raise the city that could be, and says Network rather than NW.

One command rebuilds the whole thing:

```
python3 run.py reel             narration, score, picture, mix
python3 run.py reel audio       narration, score and mix only
python3 run.py reel picture     the picture only
python3 run.py reel mux         join a picture and a mix already on disk
```

It writes `film/out/NW-Digital-City-Reel.mp4`: 1920x1080, 30 fps, AAC
stereo. Like the silent film, it is not tracked; it is rebuilt with the
command above or distributed outside the repository.

## The teaser

A 53-second cut of the reel for leaders outside Networks: it is called
Digital City, never says Networks and never shows the spend. Its message is
the game itself: the more a category adopts, the higher it climbs, from
traditional to autonomous, and a district league turns that into a
competition. `teaser.json` lists the spans of the reel it is cut from, its
own narration and its marks; the city and the camera are the reel's, and the
director draws the teaser's graphics, burned-in captions and transitions
over them. The tests check that no span reaches the spend and that the
narration never names Networks.

```
python3 film/reel/teaser.py             narration, captions, score, picture, mix
python3 film/reel/teaser.py audio       narration, captions, score and mix only
python3 film/reel/teaser.py picture     the picture only
python3 film/reel/teaser.py mux         join a picture and a mix already on disk
```

It writes `film/out/Digital-City-Teaser.mp4`, small enough to send as it is.

## What is in `film/reel/`

| File | What it does |
| --- | --- |
| `cues.json` | The timeline: every narration line with when it starts, and the marks each chapter, cut and hit is placed on. Picture and score both read it |
| `clock.js` | Loaded into the page before anything else. Puts the page on a virtual clock the capture advances a frame at a time, and routes every render through a hook that can swap the camera |
| `director.js` | One function of time that decides the frame: the camera, which state the city is in, and every piece of type and graphics drawn over it, composited over the rendered frame with a tilt-shift, a bloom and a motion smear |
| `capture.js` | Drives Chromium: loads the renderer from disk, advances the clock, screenshots each frame and pipes it to the encoder. Also renders single stills for review |
| `voice.py` | Synthesises each narration line with a neural voice, cached by its text |
| `music.py` | Synthesises the score from nothing: 120 bpm in D minor, cut to the same marks as the picture, one layer added per rung of the climb |
| `teaser.json`, `teaser.py` | The teaser's cut list, narration and marks, and its build: captions timed from the narration, its own score, the cuts rendered in parallel |
| `build.py` | Runs the above, renders the picture in parts in parallel, mixes the narration over the score with the score ducked under it, and muxes |
| `fonts/` | Inter Tight and JetBrains Mono, both under the SIL Open Font License |

## Why a virtual clock

A software renderer draws a 1080p frame of the city in about half a second,
so a real-time recording of a moving camera stutters. On the virtual clock
every frame is exactly one thirtieth of a second after the last, however long
it took to draw, and any frame can be rendered on its own and comes out the
same each time. The renderer is not modified: the camera, the city's states
and the agent are all driven through `window.NWCity` and the hook in
`clock.js`.

The same clock gives slow motion: `window.__reel.rate` sets how many
seconds of the page's time pass per second of film. And `Math.random` is
seeded, so the people and the guide figure wander the same way on every
render.

## Figures

Every figure drawn on screen is read from `data/city.json`, or from the asks
screen the renderer computes, when the reel renders. The narration cannot be:
it is spoken. `tests/test_reel.py` checks each figure the narration speaks
against `city.json`, so a refreshed extract that moves one fails the suite
rather than leaving a stale number in the voice-over. The same test checks
that each lot on the climb still stands on the rung it is there to show.

## Reviewing without a full render

```
node film/reel/capture.js --stills 23,48.5,101 --dir film/out/reel/stills
```

writes one JPEG per time given, each played into from a second before it so
anything animated has its real history.

## Requirements

`node` and `playwright` for the picture; numpy, scipy and edge-tts for the
sound; imageio-ffmpeg for encoding. The narration is synthesised by a network
service the first time each line is built, and cached after that.

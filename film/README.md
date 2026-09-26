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

Everything is written to `film/out/`. The finished file,
`NW-Digital-City.mp4`, is tracked, so it can be taken from the repository
without a twenty minute rebuild. The recordings and the intermediate beats are
not: together they are more than sixty megabytes of footage that nothing
downstream reads.

Tracking a derived file is a trade rather than a rule. Nothing else derived
here is tracked, and this one is carried by every clone from the commit that
adds it onward. Take it out of `.gitignore` when the rebuild costs less than
the weight.

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
| The promise | One plot of land, then all 145 categories as a grid sized by spend, flown onto the plan as the city rises |
| The climb | One street in one take: empty ground, a draft, a blueprint live across markets, one in use with AI, then the category at 100. Each lot rebuilds as the camera arrives, with the stage rail and the three parts of the score filling beneath it |
| The challenge | Where Networks stands: 44 blueprints written, the lights out, 4 ever used, 19 out of 100 |
| The agent | The product on a floating stage, asked which category is doing best |
| The vision | The city it could be, the lift from using what is written, then write it, use it, let AI build on it |

One command rebuilds the whole thing:

```
python3 run.py reel             narration, score, picture, mix
python3 run.py reel audio       narration, score and mix only
python3 run.py reel picture     the picture only
python3 run.py reel mux         join a picture and a mix already on disk
```

It writes `film/out/NW-Digital-City-Reel.mp4`: 1920x1080, 30 fps, AAC
stereo. Unlike the silent film, it is not tracked: at over fifty megabytes
it is past the size a repository should carry, so it is rebuilt with the
command above or distributed outside the repository.

## What is in `film/reel/`

| File | What it does |
| --- | --- |
| `cues.json` | The timeline: every narration line with when it starts, and the marks each chapter, cut and hit is placed on. Picture and score both read it |
| `clock.js` | Loaded into the page before anything else. Puts the page on a virtual clock the capture advances a frame at a time, and routes every render through a hook that can swap the camera |
| `director.js` | One function of time that decides the frame: the camera, which state the city is in, and every piece of type and graphics drawn over it, composited over the rendered frame with a tilt-shift, a bloom and a motion smear |
| `capture.js` | Drives Chromium: loads the renderer from disk, advances the clock, screenshots each frame and pipes it to the encoder. Also renders single stills for review |
| `voice.py` | Synthesises each narration line with a neural voice, cached by its text |
| `music.py` | Synthesises the score from nothing: 120 bpm in D minor, cut to the same marks as the picture, one layer added per rung of the climb |
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

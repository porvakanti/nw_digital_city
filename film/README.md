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

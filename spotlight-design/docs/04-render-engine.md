# 04 · Render engine

The engine is a port of `reference/engine/`, the code that made the demo
films. Its design is proven. The port does three things:

1. It makes the format generic, instead of a hand-written script per film.
2. It swaps the voice to Google Cloud Text-to-Speech.
3. It makes rendering chunkable and parallel.

## Two models: storyboard and timeline

| | Storyboard | Timeline |
|---|---|---|
| Who edits it | The user, through the UI, and the AI draft | Nobody; it is compiled |
| Time | Relative: beats, moments with in and out points in the recording | Absolute: every cut and line has `at` and `dur` in seconds |
| Lives in | Firestore (`versions/{v}.storyboard`) | GCS (`renders/{film}/{v}/timeline.json`) |
| Schema | `storyboard.schema.json` | `timeline.schema.json` |

`apps/api/app/compile.py` turns a storyboard into a timeline. It is a pure
function, unit-tested with fixtures.

### Storyboard (what the user shapes)

```json
{
  "template": "standard",
  "accent": "#e60000",
  "title": { "name": "Obligation Management", "promise": "Every obligation, every purchase order." },
  "voice": { "id": "en-GB-<chosen>", "rate": 1.0, "pronounce": { "D2C": "D to C" } },
  "beats": [
    { "kind": "problem", "narration": "Every contract makes promises. | But checking them is manual, | so broken promises rarely become claims.",
      "moments": [ { "in": 1.0, "out": 5.0 }, { "in": 10.0, "out": 12.9 } ] },
    { "kind": "answer", "narration": "Meet Obligation Management.", "moments": [ { "in": 17.6, "out": 20.2 } ] },
    { "kind": "how", "narration": "It checks every order against the contract, | and flags the breach.",
      "moments": [ { "in": 43.0, "out": 49.0, "callout": { "text": "Lead time: 6 weeks", "box": [0.62, 0.30, 0.30, 0.12] } } ] },
    { "kind": "result", "narration": "So no value is left on the table.",
      "moments": [ { "in": 64.5, "out": 68.0, "badge": { "big": "£107,806", "small": "CLAIM CALCULATED" } } ] }
  ],
  "masks": [ { "box": [0.05, 0.02, 0.20, 0.05], "from": 0, "to": 999, "fill": "auto" } ],
  "end": { "tagline": "Promises, kept." }
}
```

- `|` marks a phrase break. The engine inserts the pause instead of leaving
  it to the voice: 0.16 s after a comma, 0.38 s after a full stop, question
  mark or colon. This is the "phrased" technique that gives the films their
  measured pace.
- Boxes and masks are **fractions of the source frame** (x, y, w, h), so
  they are independent of resolution.
- Moments keep the recording's own times; the compiler maps them to film
  time.

### Compiling to a timeline

1. **Synthesise every phrase** (cached by `hash(text, voice, rate)`), and
   measure each one after trimming the silence at its start and end.
2. **Set each beat's length** to whichever is longer: its narration plus
   padding (0.4 s lead-in, 0.6 s tail), or the minimum it needs to show its
   moments. Moments then **stretch or compress to fill the beat**: playback
   speed is clamped to 0.8 to 1.35×. If a moment would need more than that,
   hold its last frame or ask the user to trim. The user never times
   anything.
3. **Add** the title (3 s) and end card (5 s). If the total misses the
   template target by more than 15%, report it as a warning in the editor's
   length meter, not as an error.
4. **Write cuts and lines** with absolute `at` values. Cuts carry the beat
   kind, so the band can show THE PROBLEM, THE ANSWER and so on.
5. **Build captions** from phrase timings. Split any caption over 48
   characters, preferring a comma or full stop nearest the middle (see
   `reference/engine/caption_split.py`). Apply the pronunciation map in
   reverse, so captions show "D2C" while the voice says "D to C".
6. **Set score cues:** a hit at each beat start, a lift on the result beat,
   the end-card chord.

### Timeline (what the renderer reads)

The essentials, mirroring `reference/examples/montage5.json`:

```json
{
  "fps": 30, "width": 1920, "height": 1080, "length": 92.4,
  "accent": "#e60000", "band": { "top": 930 },
  "sources": { "rec": { "uri": "gs://…/mezzanine.mp4", "fps": 30, "w": 1920, "h": 1080 } },
  "cuts": [
    { "id": "c03", "at": 3.0, "dur": 7.2, "beat": "problem", "source": "rec", "in": 1.0, "out": 5.0,
      "cam": [[0, 0, 0, 1920], [1, 64, 36, 1792]], "effects": [], "transition": "wipe" }
  ],
  "lines": [ { "id": "l01", "at": 3.4, "dur": 5.9, "text": "Every contract makes promises." } ],
  "captions": [ { "a": 3.4, "b": 5.1, "text": "Every contract makes promises." } ],
  "masks": [ { "box": [96, 22, 384, 54], "from": 0, "to": 92.4, "fill": "#f4f4f5" } ],
  "title": { "at": 0, "dur": 3.0, "name": "Obligation Management", "promise": "…" },
  "end": { "at": 87.4, "dur": 5.0, "name": "Obligation Management", "tagline": "Promises, kept." },
  "score": { "preset": "lift", "bpm": 114, "key": "D", "hits": [3.0, 10.2, 13.6], "lift": [70.1, 82.4] }
}
```

## Picture: film-kit and the stage

Port `reference/engine/kit.js` and `stage.html` to TypeScript in
`packages/film-kit`.

**Kit primitives (keep the behaviour):**

| Group | Primitives |
|---|---|
| Easing and maths | `clamp`, `ramp`, `lerp`, `eio`, `eo5`, `ei`, `back` |
| Text | `rise` (text rises through a mask), `slam` (oversized text snaps into place), `label` (mono kicker), `typed` |
| Overlays | `scrim`, `badge`, `captions` |
| Transitions | `wipe`, `flash`, `fadeBlack` |
| Finish | vignette plus seeded grain, by frame number |
| Camera | `camAt` (eased keyframes), `toScreen` |

**The stage, `frame(T)`:**
1. Find the cut at `T`.
2. Draw the source frame through the cut's camera.
3. Paint the masks.
4. Draw the effects.
5. Draw the transitions.
6. Draw the band and the beat pill.
7. Draw the captions.
8. Fade in and out, then apply the finish.

`frame(T)` must stay a pure function of the timeline and `T`. That one rule
gives you live preview, parallel chunks and golden tests.

### Effect library (v1)

Each effect is a function `(ctx, T, cut, params)`. It is declared in the
schema with its own parameter shape, so the editor can offer it as a
choice.

| Effect | What it shows | Ported from |
|---|---|---|
| `titleCard` | Kicker, name (slam), accent bar, promise (rise) over a scrim | per-film title code (e.g. `reference/examples/obligation.js`) |
| `callout` | An outlined box on a region of the recording, with a label | `outline()` in the obligation film |
| `badge` | Pill with big text and small text | `KIT.badge` |
| `bigNumber` | A counting number with a caption | `proof()` in `reference/examples/montage.js` |
| `chips` | A list of short chips appearing in sequence | `chips()` in the obligation film |
| `tag` | A top-left pill | `tag()` in the obligation film |
| `band` | Bottom band: captions, beat pill, film name, progress rail | `band()` in `reference/examples/montage.js` |
| `endCard` | Brand mark, name, accent bar, tagline | `endCard()` in the obligation film |

**Camera presets:** the user never edits keyframes. The compiler picks one
per moment:
- **gentle push-in** (the default);
- **focus**, centred on the callout's box when the moment has one;
- **hold**, for title cards.

Ensure the visible area keeps the masks in frame.

### Renderer (worker)

- **Frames:** for its chunk, `frames.py` extracts only the spans of the
  mezzanine the chunk needs, as JPEG at quality 3, the same approach as
  `reference/engine` (`extract.py`). The stage page loads them by index.
  Never load the whole recording into the browser.
- **Drawing:** `render.mjs` opens `stage.html` from `file://` in headless
  Chromium. Use `--allow-file-access-from-files`, and use **XHR, not
  fetch**, for local JSON: recent Chromium blocks `fetch()` on `file://`
  (we hit this). The renderer:
  1. calls `frame(T)` for each frame;
  2. screenshots it as a JPEG at quality 94;
  3. pipes it into ffmpeg: `-c:v libx264 -preset medium -crf 16 -pix_fmt
     yuv420p -r 30`.
- **Chunks:** task `i` of `N` renders frames `[a_i, b_i)`. Boundaries snap to
  the nearest cut start within ±2 s.
  - Each chunk is a closed group of pictures, so `concat` with stream copy
    is seamless.
  - The grain and every random element are seeded by frame number, never
    by task.
- **Speed:** budget about 0.12 to 0.18 seconds per frame on 4 vCPUs. With
  `N = ceil(frames / 900)` tasks, capped at 10, a 90-second film renders in
  about 2 minutes of wall time.

## Sound

### Narration

- Google Cloud Text-to-Speech, **three British English voices** for the
  user to choose from, for example two female and one male, of different
  characters. They're chosen in an audition in Phase 1: read the same test
  script with the candidates (Chirp 3 HD, Studio, Neural2) and compare them
  with the demo films.
  - The voices are **configuration, not code**. `TTS_VOICES` is a JSON list
    of `{id, name, description, rate}`, and the first one is the default.
  - Each voice has a **6-second sample** ("Every contract makes promises.
    But checking them is manual…"). The worker generates the samples on
    deploy, stores them in `media/voice-samples/`, and `GET /api/voices`
    serves them.
  - A voice can be removed from the list later. Films that already use it
    keep their cached narration and still render.
- Synthesise **phrase by phrase** (the parts split by `|`), then join them
  with engine-controlled pauses. Caption timing then comes from measured
  phrase lengths, so it works with any voice, including ones without SSML
  timepoints.
- **Voice chain** (port from `reference/engine/build.py` `narration()`):
  1. high-pass at 85 Hz;
  2. a gentle presence lift (2.5 to 6 kHz at 0.25);
  3. compression (threshold 0.18, ratio 3);
  4. normalise;
  5. a short room reverb at 0.07.
- **Cache** phrases in GCS by hash. Re-renders after small edits only
  re-synthesise the lines that changed.

### Score

- Port `reference/engine/music.py`, then turn the per-film `compose()`
  functions into **presets**: `lift` (the default demo-film score, 114 to
  120 bpm in D minor), `calm`, `drive`. Each preset takes the timeline's
  cues:
  - hits at beat starts;
  - risers into the answer and the result;
  - a lift section on the result;
  - the end chord.
- **Mix** (from `build.py` `audio()`):
  1. duck the score under the voice (depth 0.42);
  2. `tanh` soft-clip;
  3. limit;
  4. normalise to **−16 LUFS integrated, −1 dBTP**. This differs from the
     demo films, which were mixed louder; −16 suits laptops and Teams.
  5. Write `mix.wav`, `voice.wav` and `music.wav`.

## Outputs

| File | Spec |
|---|---|
| `film.mp4` | 1920×1080, 30 fps, H.264 High at CRF 18 (about 8 to 12 Mbps), AAC at 192 kbps, `+faststart` |
| `captions.srt` | From the timeline captions, with the written forms |
| `thumbnail.jpg` | The title-card frame, 1280×720 |
| `draft.mp4` (previews) | 960×540, 15 fps, CRF 26, no grain |

## Masks and confidentiality

- Masks are painted **in the stage, under the effects**. They are sampled
  colour fills (`fill: "auto"` takes the median colour at the box's edge)
  or blur fills.
- The AI suggests boxes, and the user confirms them; only confirmed boxes
  apply.
- **Draft and final renders always apply masks.** No path produces an
  unmasked frame.
- **Tracked masks** (a box that follows scrolling content): use the
  reference stage's `tracked` spans. The v1 UI offers only static boxes per
  moment, which covers almost every case. Tracked masks come in v2.

## Golden tests

`fixtures/` holds three **synthetic** recordings: generated UI screens with
invented data and invented names, not real tools. Each has a storyboard.
`make golden`:

1. compiles each storyboard;
2. renders 12 fixed frames per film;
3. compares them with the stored PNGs (SSIM ≥ 0.98).

The tests must pass before any change to film-kit, stage, compile or
renderer merges.

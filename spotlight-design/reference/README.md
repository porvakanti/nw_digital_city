# Reference engine

This is the code the VP&C demo films were made with, copied as it was.
**Port from it. Don't import it.** It was written for one person producing
films by hand, so every film had its own script and timeline.

| File | What it is | Port to |
|---|---|---|
| `engine/kit.js` | House-style canvas primitives: easing, `rise`, `slam`, `label`, `scrim`, `wipe`, `flash`, `badge`, `captions`, `finish` (vignette and grain), `camAt` | `packages/film-kit/src/kit.ts` |
| `engine/stage.html` | The stage: `setup()` and `frame(T)`. It draws the source through a camera, masks (`hide`, `tracked`), the film script, transitions and captions. It loads JSON with XHR, because Chromium blocks `fetch()` on `file://`. | `packages/film-kit/src/stage.ts` and `apps/worker/renderer/stage.html` |
| `engine/render.js` | Playwright drives the stage frame by frame and pipes JPEGs to ffmpeg. It also takes stills. | `apps/worker/renderer/render.mjs` (add frame ranges for chunks) |
| `engine/build.py` | Narration phrase by phrase (`phrased()`), the voice chain, captions, the default score `compose()`, the mix, mux | `packages/audio` and `apps/worker/worker/stitch.py` |
| `engine/reel_build.py` | Shared audio helpers: `read_wav`, `compress`, `duck`, `limit` | `packages/audio/mix.py` |
| `engine/music.py` | The procedural music toolkit: instruments, pads, arps, risers, booms, the reverb and sidechain mix | `packages/audio/score.py` (presets) |
| `engine/voice.py` | The **old** voice client (edge-tts). **Don't port the client.** Keep only the caching idea, and use Google Cloud TTS instead. | `packages/audio/tts.py` |
| `engine/caption_split.py` | Splits captions longer than 48 characters, preferring punctuation | `packages/audio/captions.py` |
| `examples/obligation.*` | A single film: timeline JSON and its script with bespoke effects (ledger, depth gauge, chips, end card) | The source of effects: `titleCard`, `callout`, `chips`, `tag`, `endCard` |
| `examples/montage.js`, `montage5.json`, `montage_score.py` | The community-call film: band, beat pills, progress rail, `bigNumber`, roadmap chips, and a score driven by chapter cues | The source of `band`, `bigNumber`, beat pills and score presets. The blueprint for v2 montages. |
| `fonts/` | Inter Tight (variable) and JetBrains Mono 500, under the SIL Open Font Licence | `packages/film-kit/fonts/` |

**Known behaviour to keep:**
- **Pure frames:** frames are pure functions of `T`. The grain is seeded per
  frame.
- **Pacing:** pauses go between phrases (0.16 s after a comma, 0.38 s after
  a full stop), not inside the voice.
- **Ducking:** the score ducks under the voice (depth 0.42), then goes
  through a `tanh` soft clip and a limiter.

**Known behaviour to change:**
- **Loudness:** the demo films were mixed at about −12.5 LUFS. Use −16 LUFS.
- **Captions:** the demo films' captions were burned in only. Also export
  SRT.
- **Timing:** timelines were written by hand with absolute times. The
  product compiles them from storyboards.

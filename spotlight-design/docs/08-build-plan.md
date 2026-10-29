# 08 · Build plan

Build in this order. Each phase ends with working software and passing
acceptance tests, and each phase's PR must keep earlier phases green. Stop
at the end of a phase for review before starting the next.

## Phase 0: Scaffold (about 1 day)

**Build:**
- The repository layout from `03-repo-structure.md`.
- `pnpm` and `uv` workspaces, `Makefile`, lint configs.
- Three Dockerfiles and three `cloudbuild.yaml` files.
- `infra/terraform` skeleton.
- `make dev`: Vite, FastAPI, the Firestore and Storage emulators
  (`fake-gcs-server`), and the worker callable locally.
- `GET /api/healthz`, and a web page that calls it.
- CI running lint and tests.

**Acceptance:**
- `make dev` starts everything, and the page shows "API OK".
- `make lint test` passes in CI.
- Each Docker image builds separately.
- Changing only `apps/web/**` triggers only the web build (dry run).

## Phase 1: Schema and engine (about 3 to 4 days)

This is the core: port `reference/engine` to the new structure, with no UI
yet.

**Build:**
- `timeline.schema.json` and `storyboard.schema.json`, with generated
  TypeScript and Pydantic types.
- `packages/film-kit`: kit primitives, effects, stage `frame(T)` in
  TypeScript.
- `packages/audio`:
  - Cloud TTS phrase synthesis with cache;
  - a voice audition script (`make audition`) that reads one test script
    in every candidate British voice, so the team can pick the three;
  - narration chain;
  - captions with splitting;
  - score presets (`lift`) from `music.py`;
  - mix with loudness.
- `apps/api/app/compile.py`: storyboard to timeline.
- `apps/worker`: frames, chunk render, stitch. A CLI that runs
  `compile → render → stitch` on a local storyboard and recording.
- `fixtures/`: three synthetic recordings and storyboards, plus golden
  frames.

**Acceptance:**
- `python -m worker.cli fixtures/obligation-like/storyboard.json` produces a
  film MP4 that plays. It shows:
  - a title card and the problem, answer, how-it-works and result beats;
  - the band with beat pills and captions;
  - an end card;
  - a mixed score at −16 LUFS (±1).
- A frame rendered in 4 chunks matches the same frame rendered in 1 chunk,
  pixel-identical before encoding.
- `make golden` passes. The obligation-like fixture's frames look like the
  house style; compare by eye with `reference/examples` before freezing the
  goldens.
- Captions never exceed 48 characters, and the pronunciation map shows
  written forms in captions.

## Phase 2: Films, upload and prepare (about 2 days)

**Build:**
- Auth middleware: verify the IAP JWT. A dev bypass with a fake user, only
  when `ENV=dev`.
- Films and versions CRUD.
- Resumable signed upload.
- The `prepare` job: mezzanine, proxy, scrub strip, poster.
- Firestore rules and the web listener.
- Screens: Your films, New film, and the upload progress.

**Acceptance:**
- **Happy path:** upload a 3-minute MP4 and see "Recording ready" with a
  poster within 2 minutes.
- **Bad files:** a 20-minute file or a non-video file is rejected with a
  plain-language message.
- User A can't read user B's film (API test plus rules test).

## Phase 3: AI draft and storyboard editor (about 4 to 5 days)

**Build:**
- The `AIProvider` interface, `GeminiProvider`, and the placeholder
  `ClaudeProvider`.
- The draft endpoint, with validation and retry.
- `suggest_line` and `find_sensitive`.
- Screens:
  - Voice picker on New film: three cards, each with a ▶ sample, plus a
    voice switch in the storyboard.
  - Brief.
  - Drafting.
  - Storyboard:
    - beat cards;
    - moment trimmer on the scrub strip;
    - narration editor with ▶ preview;
    - callout and badge editors;
    - mask tool;
    - pronunciation;
    - length meter;
    - live canvas preview using film-kit.
- Autosave.

**Acceptance:**
- For each fixture recording plus brief, the draft returns a valid
  storyboard in under 90 seconds, within ±20% of the target length.
- Invalid model output gets one retry, then an empty template with a note.
  It never shows a raw error.
- The canvas preview of a beat matches the renderer's frame at the same
  time (SSIM ≥ 0.97).
- A user can do everything with the keyboard and a screen reader (beat
  cards, buttons, form fields), meeting WCAG 2.2 AA for the editor
  controls.
- Each of the three voices plays its sample, and changing the voice
  re-voices the whole film on the next preview.
- With `AI_ENABLED=false`, the storyboard starts empty and everything else
  works.

## Phase 4: Render, preview and outputs (about 3 days)

**Build:**
- The render endpoint: compile, then TTS, then parallel render tasks, then
  stitch.
- Progress in Firestore, a stuck-job sweep, and one auto-retry.
- Draft quality (540p, 15 fps).
- Outputs: MP4, SRT, thumbnail, with signed download URLs.
- Screens: Preview, Rendering, Ready.
- Duplicate version, share link, Teams or email notification.

**Acceptance:**
- **Final render time:** a 90-second fixture renders in under 4 minutes of
  wall time with 6 tasks. A draft renders in under 2 minutes.
- Killing one render task mid-way leads to a successful automatic retry,
  and the user sees only "Taking a little longer…".
- The SRT matches the captions burned into the picture.
- Masks are present in draft and final frames (golden check on a masked
  fixture).

## Phase 5: Hardening and deployment (about 2 to 3 days)

**Build:**
- Terraform for everything in `07-deploy-gcp.md`.
- **Sign-in: to be implemented by the platform team** (IAP with Entra ID,
  reusing their existing setup). In this phase, only document what the app
  expects: the IAP audience and the optional group check.
- Cloud Armor.
- Monitoring and alerts.
- Retention rules.
- Hard delete.
- Optional DLP.
- The third-party notices file.
- Load test: 10 concurrent final renders.

**Acceptance:**
- A fresh project can be stood up from `infra/` plus the documented manual
  sign-in setup from the platform team in under a day.
- Once the platform team has set up sign-in, a user outside the allowed
  group is refused at IAP.
- An API call without a valid IAP JWT gets 401.
- 10 concurrent renders all finish, with no task over 30 minutes.
- Deleting a film removes every object and document (verified by a script).

## After v1 (backlog)

- Montages: several films, chapters, a progress rail. The
  `reference/examples/montage*` files are the blueprint.
- Tracked masks for scrolling content.
- More score presets and accents.
- SharePoint or Stream publishing.
- Translated narration and captions.
- Usage dashboard.
- Brand presets per function.
- Switching to Claude when it becomes available on Vertex AI: set
  `AI_PROVIDER=claude`, then run the provider contract tests.

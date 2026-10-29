# 02 · Architecture

## The big picture

```mermaid
flowchart LR
  user([Colleague's browser])

  subgraph edge[Google Cloud: edge]
    lb[External HTTPS load balancer<br/>+ Cloud Armor]
    iap[Identity-Aware Proxy<br/>sign-in via Entra ID]
  end

  subgraph run[Cloud Run]
    web[web<br/>React SPA, static]
    api[api<br/>FastAPI]
  end

  subgraph jobs[Cloud Run Jobs: the worker image]
    prep[prepare<br/>probe, transcode, proxy, thumbnails]
    draftjob[render: draft<br/>480p, 1 task]
    finaljob[render: final<br/>1080p, N parallel tasks]
    stitch[stitch<br/>concat chunks, mux audio]
  end

  subgraph data[Data]
    fs[(Firestore<br/>films, versions, jobs)]
    gcsU[(GCS uploads<br/>raw recordings)]
    gcsM[(GCS media<br/>mezzanine, proxy, frames)]
    gcsR[(GCS renders<br/>MP4, SRT, thumbnail)]
  end

  subgraph ai[Vertex AI and Google APIs]
    gemini[Gemini<br/>video understanding, drafting]
    claude[Claude on Vertex<br/>later, via provider switch]
    tts[Cloud Text-to-Speech<br/>British English voice]
  end

  notify[Email / Teams webhook]

  user --> lb --> iap
  iap -->|/| web
  iap -->|/api| api
  user -. signed URL upload .-> gcsU
  user -. signed URL playback .-> gcsM
  user -. signed URL download .-> gcsR

  api --> fs
  api -->|run job| prep
  api -->|run job| draftjob
  api -->|run job| finaljob
  api --> gemini
  api -. later .-> claude
  api --> tts

  prep --> gcsU
  prep --> gcsM
  prep --> fs
  draftjob --> gcsM
  draftjob --> tts
  draftjob --> gcsR
  finaljob --> gcsM
  finaljob --> tts
  finaljob --> gcsR
  finaljob -->|last task| stitch
  stitch --> gcsR
  stitch --> fs
  stitch --> notify
```

## Components

| Component | Runs as | Language | Responsibility |
|---|---|---|---|
| **web** | Cloud Run service (nginx serving static files) | TypeScript, React, Vite | All screens. Uploads go straight to storage, and the storyboard editor shows a live canvas preview using `film-kit`. |
| **api** | Cloud Run service | Python, FastAPI | Films and versions (CRUD), signed URLs, the brief, AI drafting, line suggestions, voice preview of one line, starting jobs, job status, share links. Checks the IAP identity on every request. |
| **worker** | Cloud Run Jobs, one image with three modes | Python and Node, with Chromium and ffmpeg | `prepare`: probes and transcodes the upload, makes a proxy and thumbnails. `render`: draft or final; final splits into chunks across tasks. `stitch`: concatenates the chunks, mixes and muxes, writes the outputs. |
| **timeline-schema** | Shared package | JSON Schema, generating TS and Pydantic | The film contract (see `04-render-engine.md`). |
| **film-kit** | Shared package | TypeScript, bundled to one ES module | The house-style canvas effects, ported from `reference/engine/kit.js`. Used by the web preview and the worker's stage page. |
| **audio** | Python module in the worker | Python, numpy | Narration from TTS, phrase pauses, captions, the score generator (ported from `music.py`), ducking, mix and loudness. |

**Why the worker is one image with modes:** `prepare`, `render` and
`stitch` all need ffmpeg, and two of them need Chromium. One image means one
build and one set of patches. Each Cloud Run Job sets its mode, CPU and
memory separately.

## Flow 1: create a film and upload

```mermaid
sequenceDiagram
  autonumber
  actor U as Colleague
  participant W as web
  participant A as api
  participant S as GCS uploads
  participant J as Job: prepare
  participant F as Firestore

  U->>W: New film (name, length, accent)
  W->>A: POST /api/films
  A->>F: create film + version v1 (status: uploading)
  A-->>W: filmId, resumable upload URL (signed, 1 h)
  W->>S: PUT recording (resumable, progress bar)
  W->>A: POST /api/films/{id}/versions/1/uploaded
  A->>J: run job prepare(filmId, version)
  J->>S: read raw recording
  J->>J: ffprobe → reject if > 15 min or unreadable
  J->>J: transcode mezzanine 1080p30 CFR (H.264, high quality)
  J->>J: proxy 540p + scrub strip (1 thumb/s) + poster
  J->>F: media ready (duration, size, paths)
  W-->>F: listens (Firestore SDK, read-only rules) → "Recording ready"
```

## Flow 2: brief and AI draft

```mermaid
sequenceDiagram
  autonumber
  actor U as Colleague
  participant W as web
  participant A as api
  participant G as Gemini (Vertex AI)
  participant F as Firestore

  U->>W: answers four questions
  W->>A: PUT /api/films/{id}/versions/1/brief
  W->>A: POST /api/films/{id}/versions/1/draft
  A->>G: recording (gs:// proxy URI) + brief + template + schema
  G-->>A: storyboard JSON (beats, moments, narration, callouts, masks)
  A->>A: validate against schema, clamp to template length, snap moments to recording
  A->>F: save storyboard (status: draft-ready)
  A-->>W: storyboard
  W->>U: Storyboard screen
```

## Flow 3: edit, then preview a line

```mermaid
sequenceDiagram
  actor U as Colleague
  participant W as web
  participant A as api
  participant T as Cloud TTS

  U->>W: edits narration for "The problem"
  W->>A: PATCH storyboard (debounced autosave)
  U->>W: ▶ hear this line
  W->>A: POST /api/voice/preview {text, voice, pronunciations}
  A->>T: synthesise (cached by hash)
  T-->>A: audio
  A-->>W: short-lived URL → plays
```

## Flow 4: render (final)

```mermaid
sequenceDiagram
  autonumber
  participant W as web
  participant A as api
  participant F as Firestore
  participant R as Job: render (N tasks)
  participant T as Cloud TTS
  participant S as GCS
  participant X as Job: stitch

  W->>A: POST /api/films/{id}/versions/1/render {quality: final}
  A->>A: compile storyboard → timeline.json (absolute timings)
  A->>T: synthesise narration phrases (cached)
  A->>A: measure phrases → final timings, captions, score cues
  A->>S: write timeline.json, narration.wav, captions.json
  A->>R: run job render(task count = N)
  A->>F: job queued
  par each task i of N
    R->>S: read timeline + only the source spans it needs
    R->>R: headless Chromium draws frames [chunk i] → H.264 chunk
    R->>S: write chunk_i.mp4
    R->>F: progress (frames done)
  end
  A->>X: run job stitch (when all N succeed)
  X->>S: concat chunks (stream copy), build score, mix, loudness, mux
  X->>S: film.mp4, captions.srt, thumbnail.jpg
  X->>F: version status: ready
  X-->>W: (Firestore listener) Ready + notification
```

**Why chunks:** one browser draws about 6 to 8 frames a second. A 90-second
film at 30 fps is 2,700 frames, so one task takes about 6 minutes, and 6
tasks take about 1 minute. Because frames are a pure function of time
(see the guardrails), a chunk can start at any frame. Chunk boundaries snap
to cut points, so the encoder never splits a scene. Audio is built once, in
`stitch`, so the chunks carry picture only.

**Draft renders** are the same pipeline at 960×540 and 15 fps in one task.
They skip the film grain and use faster encoder settings.

## State machine (per version)

```mermaid
stateDiagram-v2
  [*] --> uploading
  uploading --> preparing: upload complete
  preparing --> brief: media ready
  preparing --> failed: unreadable / too long
  brief --> drafting: draft requested
  drafting --> storyboard: draft ready
  drafting --> storyboard: draft failed (empty storyboard offered)
  storyboard --> previewing: preview requested
  previewing --> storyboard: preview ready
  storyboard --> rendering: final requested
  rendering --> ready: stitch done
  rendering --> storyboard: failed (reason shown, one auto-retry first)
  ready --> [*]
```

A version that is **ready** can't be changed. **Duplicate** makes a new
version starting from `storyboard`.

## API surface (v1)

| Method and path | Purpose |
|---|---|
| `GET /api/me` | Who am I (from the IAP identity) |
| `GET /api/films` / `POST /api/films` | List my films / create one |
| `GET /api/films/{id}` / `PATCH` / `DELETE` | Read, rename or delete a film |
| `POST /api/films/{id}/versions/{v}/upload-url` | Resumable signed upload URL |
| `POST /api/films/{id}/versions/{v}/uploaded` | Upload done → start `prepare` |
| `PUT /api/films/{id}/versions/{v}/brief` | Save the four answers |
| `POST /api/films/{id}/versions/{v}/draft` | AI draft of the storyboard |
| `GET` / `PATCH /api/films/{id}/versions/{v}/storyboard` | Read or autosave the storyboard |
| `POST /api/films/{id}/versions/{v}/suggest-line` | AI rewrite of one line |
| `POST /api/voice/preview` | Speak one line |
| `POST /api/films/{id}/versions/{v}/render` | `{quality: draft \| final}` |
| `GET /api/films/{id}/versions/{v}/outputs` | Signed URLs for MP4, SRT, thumbnail |
| `POST /api/films/{id}/versions/{v}/duplicate` | New version from this one |
| `POST /api/films/{id}/versions/{v}/share` | 30-day share link (signed-in viewers) |

Status updates come through Firestore listeners in the browser, using
security rules that let a user read only their own films. The API stays
stateless.

# 03 · Repository structure and packages

One repository with three deployables. The frontend and backend build and
deploy independently (separate Dockerfiles, separate Cloud Build triggers
filtered by path, separate Cloud Run services). They share only the two
packages under `packages/`.

```
spotlight/
├── CLAUDE.md
├── Makefile                         # dev, test, golden, lint
├── package.json                     # pnpm workspace root (web + packages)
├── pnpm-workspace.yaml
├── pyproject.toml                   # uv workspace root (api + worker + audio)
├── .github/ or cloudbuild/          # CI: lint, test, golden; path-filtered triggers
│
├── apps/
│   ├── web/                         # ── FRONTEND (deploys alone) ──
│   │   ├── Dockerfile               # build with node, serve with nginx
│   │   ├── cloudbuild.yaml
│   │   ├── nginx.conf               # SPA fallback, cache headers, CSP
│   │   ├── .env.example
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx, App.tsx, routes.tsx
│   │       ├── api/                 # typed client generated from OpenAPI
│   │       ├── screens/             # Films, NewFilm, Brief, Drafting, Storyboard, Preview, Rendering, Ready
│   │       ├── storyboard/          # BeatCard, MomentTrimmer, MaskTool, LengthMeter, LinePlayer
│   │       ├── preview/             # CanvasPreview: film-kit on a <canvas>, scrub/play
│   │       ├── upload/              # resumable GCS upload with progress
│   │       ├── ui/                  # design tokens, buttons, inputs, toasts
│   │       └── firebase.ts          # Firestore listener for status (read-only)
│   │
│   ├── api/                         # ── BACKEND API (deploys alone) ──
│   │   ├── Dockerfile
│   │   ├── cloudbuild.yaml
│   │   ├── .env.example
│   │   ├── pyproject.toml
│   │   └── app/
│   │       ├── main.py              # FastAPI app, routers, CORS off (same origin)
│   │       ├── auth.py              # verify IAP JWT, map to user
│   │       ├── routes/              # films.py, versions.py, storyboard.py, voice.py, render.py, share.py
│   │       ├── store/               # firestore.py, gcs.py (signed URLs)
│   │       ├── ai/
│   │       │   ├── provider.py      # AIProvider protocol + factory (AI_PROVIDER env)
│   │       │   ├── gemini.py        # Vertex AI Gemini implementation
│   │       │   ├── claude.py        # Claude on Vertex AI: placeholder, same interface
│   │       │   └── prompts/         # draft_storyboard.md, suggest_line.md, find_sensitive.md
│   │       ├── compile.py           # storyboard → timeline.json (absolute timings)
│   │       ├── voice.py             # Cloud TTS client + phrase cache (shared with worker via packages/audio)
│   │       └── jobs.py              # start Cloud Run Job executions with overrides
│   │
│   └── worker/                      # ── BACKEND JOBS (deploys alone) ──
│       ├── Dockerfile               # FROM Playwright image (Chromium) + ffmpeg + Python
│       ├── cloudbuild.yaml
│       ├── .env.example
│       ├── worker/
│       │   ├── main.py              # entry: MODE=prepare|render|stitch
│       │   ├── prepare.py           # ffprobe, transcode mezzanine/proxy, thumbnails, scrub strip
│       │   ├── frames.py            # extract only the spans a chunk needs (JPEG frames)
│       │   ├── render_chunk.py      # drives Node renderer for frames [a, b)
│       │   ├── stitch.py            # concat, score, mix, loudness, mux, SRT, thumbnail
│       │   └── progress.py          # Firestore progress updates
│       └── renderer/                # Node: Playwright + stage.html
│           ├── render.mjs           # ported from reference/engine/render.js, chunk-aware
│           └── stage.html           # ported from reference/engine/stage.html, loads film-kit
│
├── packages/
│   ├── timeline-schema/             # THE CONTRACT
│   │   ├── timeline.schema.json     # JSON Schema (draft 2020-12)
│   │   ├── storyboard.schema.json   # editor-level model (beats), compiled to timeline
│   │   ├── gen/ts/                  # generated TypeScript types (json-schema-to-typescript)
│   │   └── gen/py/                  # generated Pydantic v2 models (datamodel-code-generator)
│   ├── film-kit/                    # house-style canvas effects (TypeScript → one ESM bundle)
│   │   ├── src/kit.ts               # easing, text (rise, slam, label), scrim, wipe, flash, captions, finish
│   │   ├── src/effects/             # titleCard, callout, badge, chips, tag, bigNumber, band, endCard
│   │   ├── src/stage.ts             # frame(T) for a timeline: source draw, masks, effects, captions
│   │   └── fonts/                   # Inter Tight, JetBrains Mono (+ licences)
│   └── audio/                       # Python: tts.py, captions.py, score.py (from music.py), mix.py
│
├── fixtures/                        # invented sample recordings (synthetic UI) + storyboards + golden frames
├── infra/
│   ├── terraform/                   # project services, buckets, Firestore, SAs, Cloud Run, Jobs, IAP, LB
│   └── README.md
└── docs/                            # this design pack
```

## Separate deployment, concretely

| | web | api | worker |
|---|---|---|---|
| Image | `web:<sha>` | `api:<sha>` | `worker:<sha>` |
| Build trigger paths | `apps/web/**`, `packages/film-kit/**`, `packages/timeline-schema/**` | `apps/api/**`, `packages/audio/**`, `packages/timeline-schema/**` | `apps/worker/**`, `packages/**` |
| Runs as | Cloud Run service `spotlight-web` | Cloud Run service `spotlight-api` | Cloud Run Jobs `spotlight-prepare`, `spotlight-render`, `spotlight-stitch` |
| Exposed | LB path `/*` | LB path `/api/*` | not exposed |
| Service account | `sa-web` (no data access) | `sa-api` | `sa-worker` |

The web container serves static files only. It holds no secrets and calls
nothing but `/api` (same origin through the load balancer), the signed GCS
URLs, and Firestore listeners. The API and worker never serve HTML.

## Packages and versions

Pin exact versions in lockfiles when Phase 0 scaffolds the repository. The
majors below are the ones to target; take the latest minor at scaffold time.

### Frontend (apps/web, packages/film-kit)

| Package | Target | Use |
|---|---|---|
| Node.js | 22 LTS | build runtime |
| pnpm | 9.x | workspaces |
| react, react-dom | 19.x | UI |
| vite | 6.x | build |
| typescript | 5.x (strict) | everywhere |
| @tanstack/react-query | 5.x | server state |
| react-router | 7.x | routing |
| firebase (modular SDK) | 11.x | Firestore listeners only |
| zod | 3.x | runtime checks at the edges |
| vitest, @testing-library/react | latest | unit tests |
| @playwright/test | same version as the worker | end-to-end tests |
| json-schema-to-typescript | latest | type generation |

### API (apps/api)

| Package | Target | Use |
|---|---|---|
| Python | 3.12 | runtime |
| uv | latest | env and lockfile |
| fastapi, uvicorn[standard] | latest | HTTP |
| pydantic | 2.x | models (generated from the schema) |
| google-cloud-firestore | 2.x | state |
| google-cloud-storage | 2.x | signed URLs |
| google-cloud-run | latest | start Job executions with overrides |
| google-genai | 1.x | **Gemini on Vertex AI** (`vertexai=True`) |
| anthropic[vertex] | latest | **placeholder**: Claude on Vertex, used only when `AI_PROVIDER=claude` |
| google-cloud-texttospeech | 2.x | line previews (shared code in `packages/audio`) |
| google-auth | 2.x | IAP JWT verification |
| ruff, mypy, pytest, httpx | latest | quality |

### Worker (apps/worker, packages/audio)

| Package | Target | Use |
|---|---|---|
| Base image | `mcr.microsoft.com/playwright:v1.<N>-noble` | Chromium matched to Playwright |
| playwright (Node) | **same `1.<N>`** as the base image | drives the stage page |
| ffmpeg | distro package (6.x or 7.x) | probe, transcode, encode, concat, mux. It runs as a separate program, so no linking. |
| Python | 3.12 (installed in the image) | worker modes and audio |
| numpy, scipy | 2.x, 1.x | score synthesis, filters, mix |
| google-cloud-texttospeech | 2.x | narration |
| google-cloud-firestore, google-cloud-storage | 2.x | state and media |
| pyloudnorm | latest | loudness normalisation (−16 LUFS integrated, −1 dBTP) |

**Licences:**
- ffmpeg runs as a separate program on internal infrastructure, so there's
  no distribution and no LGPL/GPL obligation in practice. Record it in the
  third-party notice anyway.
- Inter Tight and JetBrains Mono are under the SIL Open Font Licence.
- The score is synthesised by our own code, so it has no music licence.
- Google TTS output is licensed under the Cloud terms.

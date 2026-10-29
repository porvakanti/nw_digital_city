# CLAUDE.md: Spotlight

Spotlight turns a screen recording of an internal AI tool into a short,
narrated, captioned and scored film in the house style. Colleagues upload a
recording, answer four questions, review an AI-drafted storyboard and press
render. They need no video or coding skills.

Read these before writing code, in this order:

1. `docs/01-product.md`: who it is for and the user journey
2. `docs/02-architecture.md`: components and flows
3. `docs/03-repo-structure.md`: where code lives, packages and versions
4. `docs/04-render-engine.md`: the film format and the engine
5. `docs/05-ai-assist.md`: the Gemini integration
6. `docs/06-security.md` and `docs/07-deploy-gcp.md`
7. `docs/08-build-plan.md`: work through it phase by phase

`reference/` holds the engine the original demo films were made with. Port
from it. Don't import it as-is, and don't edit it: it is the known-good
baseline that golden tests compare against.

## Architecture in one paragraph

Three deployables in one repository. `apps/web` is a React single-page app,
served as static files from its own Cloud Run service. `apps/api` is a
FastAPI service on Cloud Run. It owns projects, signed upload URLs, AI
drafting and job dispatch. `apps/worker` is one container image that runs as
Cloud Run Jobs for media preparation and for rendering. The browser draws
frames on a canvas in headless Chromium, Python builds the audio, and ffmpeg
encodes. Shared code lives in `packages/`: the timeline schema (one source of
truth, generated to TypeScript and Pydantic) and the film kit (the canvas
effects, used by both the editor preview and the renderer). State is in
Firestore, media is in Cloud Storage, and sign-in is Entra ID through IAP.

## Guardrails (never break these)

- **No unofficial services.** Voice comes from Google Cloud Text-to-Speech.
  Never use `edge-tts` or any reverse-engineered endpoint. AI comes from
  Vertex AI through `apps/api/app/ai/provider.py`; no other path calls a
  model.
- **Don't build sign-in.** Entra ID through IAP is to be implemented by the
  platform team, reusing their existing setup. The API only verifies the IAP
  JWT header (`x-goog-iap-jwt-assertion`) and reads the user from it. Local
  development uses a fake user, and only when `ENV=dev`. Don't create Entra
  app registrations, Identity Platform tenants or IAP configuration.
- **The frontend and backend deploy separately.** `apps/web` never imports
  from `apps/api` or `apps/worker`, and the reverse is also true. They share
  only `packages/timeline-schema` and `packages/film-kit`. Each app has its
  own Dockerfile and `cloudbuild.yaml`.
- **Rendering is deterministic.** A frame is a pure function of the timeline
  and time `T`. Use no `Date.now()`, no `Math.random()` without a seed, and
  no wall-clock animation. This is what lets renders split into chunks
  across parallel tasks and be compared in tests.
- **Rendering never runs inside a request.** It always runs as a Cloud Run
  Job execution, and progress is written to Firestore.
- **Recordings are confidential.** No media, script or prompt text goes to
  logs. Buckets are private, and the browser gets short-lived signed URLs
  only. Masks the user draws are always applied before any frame is encoded.
- **No real people in fixtures, tests or examples.** Use invented names and
  invented data. Don't name a target persona or job title anywhere in the UI
  or copy. The product is for everyone.
- **Assets stay local.** Fonts are bundled (`packages/film-kit/fonts`), and
  nothing loads from a public CDN at render time.
- **Pin every dependency** in lockfiles (`pnpm-lock.yaml`, `uv.lock`). The
  worker's Playwright version must match its Chromium base image.

## Conventions

- **TypeScript:** strict mode, ES modules, `pnpm` workspaces. React with
  Vite. Server state through TanStack Query. Components are small, and
  styling uses CSS modules with design tokens.
- **Python:** 3.12, managed with `uv`. Use FastAPI and Pydantic v2. Type
  hints everywhere; `ruff` formats and lints, and `mypy --strict` runs on
  `apps/api`.
- **The timeline schema is the contract.** Change
  `packages/timeline-schema/timeline.schema.json` first, regenerate the
  types (`pnpm gen:types`), then update the code. The CI check fails if the
  generated files are stale.
- **Tests:**
  - Unit tests: `vitest` and `pytest`.
  - API tests against the Firestore emulator.
  - Render golden tests: render chosen frames of the fixture films in
    `fixtures/`, then compare with a perceptual-diff tolerance.
  - End-to-end tests: Playwright against a local stack (`make dev`).
- **Commits:** small and focused. The message says what changed and why.
- **Configuration:** everything comes from environment variables, documented
  in `docs/07-deploy-gcp.md` and in each app's `.env.example`.

## Commands (create these in Phase 0)

```
make dev            # web, api, Firestore and Storage emulators, plus a local worker
make test           # every unit and integration test
make golden         # render the fixture films' golden frames and compare
make lint           # ruff, mypy, eslint, tsc
pnpm gen:types      # regenerate TypeScript and Pydantic types from the schema
```

## Definition of done (for every phase)

- The phase's acceptance tests in `docs/08-build-plan.md` pass in CI.
- `make lint` and `make test` are clean, and golden frames are unchanged
  unless the change was intended and reviewed.
- Every new environment variable is documented. Every new GCP permission is
  added to `infra/` and `docs/07-deploy-gcp.md`.
- The feature works for a user with no technical knowledge: it uses plain
  words, shows no error codes, and the next step is always obvious.

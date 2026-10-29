# 07 · Deploying on GCP (for the platform team)

The steps are written for the person deploying. `infra/terraform/` in the
repository should encode everything here. This page is the checklist and the
reasoning behind it.

## 1. Project and region

- One project per environment: `…-spotlight-dev`, `…-spotlight-prod`.
- **One EU region for everything** (Cloud Run, Jobs, buckets, Vertex AI,
  Firestore location), for example `europe-west4` or `europe-west1`.
  Check that the chosen Gemini model and Cloud TTS voices are available
  there.

**APIs to enable:**
- `run.googleapis.com`
- `artifactregistry.googleapis.com`
- `cloudbuild.googleapis.com`
- `firestore.googleapis.com`
- `storage.googleapis.com`
- `aiplatform.googleapis.com`
- `texttospeech.googleapis.com`
- `iap.googleapis.com`
- `identitytoolkit.googleapis.com` (Identity Platform)
- `secretmanager.googleapis.com`
- `compute.googleapis.com` (load balancer)
- `dlp.googleapis.com` (optional)

## 2. Data

- **Firestore** in Native mode, in the region. Deploy the indexes and
  security rules from `infra/firestore/`.
- **Buckets:** `<proj>-spotlight-uploads`, `<proj>-spotlight-media` and
  `<proj>-spotlight-renders`.
  - Uniform access and public access prevention on.
  - Lifecycle rules: uploads 7 days, `media/frames/` 3 days,
    `media/tts-cache/` 90 days.
  - CORS on uploads, media and renders for the app's origin (`PUT`, `GET`,
    `HEAD`; exposed headers include `x-goog-resumable`).
- **Artifact Registry:** a Docker repository `spotlight` in the region.

## 3. Runtime services

| Name | Type | Image | CPU / memory | Scaling | Timeout | Service account |
|---|---|---|---|---|---|---|
| `spotlight-web` | Cloud Run service | `web` | 1 / 512 MiB | 0 to 3 | 60 s | `sa-web` |
| `spotlight-api` | Cloud Run service | `api` | 2 / 2 GiB | 1 to 10 (min 1 for snappy UI) | 300 s (AI draft can take about 60 s) | `sa-api` |
| `spotlight-prepare` | Cloud Run Job | `worker`, `MODE=prepare` | 4 / 8 GiB | per execution | 30 min | `sa-worker` |
| `spotlight-render` | Cloud Run Job | `worker`, `MODE=render` | 4 / 4 GiB | tasks 1 to 10, parallel 10 | 30 min per task | `sa-worker` |
| `spotlight-stitch` | Cloud Run Job | `worker`, `MODE=stitch` | 2 / 4 GiB | 1 task | 15 min | `sa-worker` |

- **Ingress:** `spotlight-web` and `spotlight-api` accept **internal and Cloud Load
  Balancing** traffic only. Jobs have no ingress.
- The API starts Job executions with **per-execution overrides**
  (environment variables `FILM_ID`, `VERSION`, `QUALITY`, `CHUNKS`, and the
  task count) through the Cloud Run Admin API.
- **Stitching after parallel tasks:** the last render task to finish (an
  atomic counter in Firestore) starts `spotlight-stitch`. A Cloud Scheduler
  sweep every 5 minutes retries stuck jobs once.

## 4. Edge: load balancer, IAP, Entra ID

> **Status: to be implemented by the platform team**, reusing the IAP and
> Entra ID setup already built for other apps. The steps below describe
> what the app expects. They are not part of the Claude Code build.

1. **Global external Application Load Balancer** with a managed certificate
   for the internal host name (for example `spotlight.<domain>`).
   - Backends: serverless network endpoint groups for `spotlight-web` (`/*`)
     and `spotlight-api` (`/api/*`).
   - **Cloud Armor** policy: optional office or VPN IP allow-list, plus the
     OWASP preconfigured rules.
2. **IAP** on both backend services.
   - Use **external identities**: Identity Platform, one tenant.
   - Provider: **OIDC → Microsoft Entra ID**.
     - In Entra, create an app registration *Spotlight*.
     - Set the redirect URI to the Identity Platform handler,
       `https://<project>.firebaseapp.com/__/auth/handler`, or your custom
       auth domain.
     - Scopes: `openid email profile`.
     - Optional: a group claim.
   - Give access only to the Entra group *Spotlight-Users*, through
     the IAP condition or the API's group check.
3. Record the **IAP audience** of the API backend service. The API needs it
   to verify JWTs (`IAP_AUDIENCE`).

## 5. Builds (frontend and backend separately)

There are three Cloud Build triggers on the main branch, each **path
filtered** (see `03-repo-structure.md`). Each one:

1. builds its image, tagged with the commit SHA;
2. pushes it to Artifact Registry;
3. deploys only its own service or job:
   - `web`: `gcloud run deploy spotlight-web`
   - `api`: `gcloud run deploy spotlight-api`
   - `worker`: `gcloud run jobs update spotlight-prepare`, `spotlight-render` and
     `spotlight-stitch`, all to the same image

Pull requests run lint, unit tests and golden tests only, with no deploy.

## 6. Configuration

| Variable | App | Example | Notes |
|---|---|---|---|
| `GCP_PROJECT`, `GCP_REGION` | api, worker | `…-spotlight-prod`, `europe-west4` | |
| `BUCKET_UPLOADS`, `BUCKET_MEDIA`, `BUCKET_RENDERS` | api, worker | | |
| `IAP_AUDIENCE` | api | `/projects/…/global/backendServices/…` | JWT verification |
| `ALLOWED_GROUP` | api | `Spotlight-Users` | optional group check |
| `AI_ENABLED` | api | `true` | kill switch |
| `AI_PROVIDER` | api | `gemini` | `claude` later |
| `GEMINI_MODEL`, `GEMINI_FAST_MODEL` | api | the latest models available on our AI platform | configuration only |
| `CLAUDE_MODEL`, `CLAUDE_REGION` | api | (empty until available) | placeholder |
| `TTS_VOICES` | api, worker | JSON list of three voices `{id, name, description, rate}`, first is the default | chosen at audition, never hard-coded |
| `RENDER_MAX_TASKS` | api | `10` | |
| `NOTIFY_WEBHOOK` | worker | Teams incoming webhook (Secret Manager) | optional |
| `DLP_SCAN` | api | `false` | optional |
| `VITE_FIREBASE_*` | web (build time) | Firestore config for listeners | public config, no secrets |

## 7. Monitoring

- Log-based metrics for:
  - render success and failure;
  - render time per minute of film;
  - AI draft latency and validation failures.
- Alerts:
  - render failure rate above 5% in an hour;
  - any job stuck over 30 minutes;
  - API 5xx above 1%.
- Uptime check on `/api/healthz`, through the load balancer with an IAP
  service account.

## 8. Cost (indicative, per finished 90-second film)

| Item | Estimate |
|---|---|
| Render: 2,700 frames at about 0.15 s on 4 vCPUs, about 7 vCPU-minutes in total | about €0.05 to €0.10 |
| Prepare and stitch | about €0.02 |
| Draft previews (2 to 3 per film) | about €0.03 |
| Gemini (draft plus suggestions) | about €0.05 to €0.50, depending on recording length and model |
| Cloud TTS | under €0.01 (cached) |
| Storage (1 to 3 GB per film per month) | about €0.05 a month |
| **Fixed:** API minimum instance, load balancer, Cloud Armor | about €40 to €80 a month |

At 50 films a month, the running cost is well under €150 a month.

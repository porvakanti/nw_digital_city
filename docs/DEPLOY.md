# Deployment and marketplace registration

## 1. Purpose and scope

This document specifies how NW Digital City is deployed and how it is
registered in the VP&C Agent Marketplace.

Provisioning of the inference service is in [GCP-SETUP.md](GCP-SETUP.md).
Component structure and security controls are in
[ARCHITECTURE.md](ARCHITECTURE.md). Verification procedures are in
[TESTING.md](TESTING.md).

## 2. Current state

| Aspect | State |
| --- | --- |
| Distribution | A single self-contained HTML document, built on demand. |
| Hosting | None. The application runs from local storage with no server. |
| Inference | Not provisioned. Queries are routed by deterministic local rules. |
| Marketplace presence | None. |

## 3. Target state

| Aspect | Target |
| --- | --- |
| Hosting | One Cloud Run service, one URL, one container. |
| Inference | Vertex AI, addressed by the runtime service account. |
| Marketplace presence | One catalogue entry with a deep link. |
| State | None. No database, no session store, no persistence of any kind. |
| Rollback unit | One Cloud Run revision. |

## 4. Deployment architecture

```
   Agent Marketplace (Foundry, Streamlit)
        |  a row in Foundry's data/agents.json, and either
        |   - a control that opens the application in a new tab   <- phase 1
        |   - an inline frame of the same URL                     <- phase 2
        v
   Cloud Run: one container, one URL
     +-- the page          static: renderer/, approximately 1MB, no state
     +-- the service       FastAPI, /plan and /health only
             |
             |  identifiers only: codes, titles, districts, plots, markets.
             |  no spend, no score, no personal data.
             v
        Vertex AI, Gemini as a publisher model
        addressed by the runtime service account. No API key.
```

Four properties of this topology are material to a deployment review:

| Property | Basis |
| --- | --- |
| Single artefact | The page and the service are one container: one rollout, one URL to allow-list, one revision to roll back. No database, no session store, no state. |
| No credential in the deployment | `NW_PROVIDER=vertex` authenticates by the Cloud Run service account, which holds one role, `roles/aiplatform.user`. Nothing to rotate and nothing to disclose. |
| No sensitive value reaches the model | The prompt carries identifiers. Measures are resolved in the browser from the dataset embedded in the delivered page. See [GCP-SETUP.md](GCP-SETUP.md#8-disclosure-boundary). |
| Degrades to operational | Where the model is unreachable or not approved, the browser routes queries by local rules and the interface reports the answering path. Deployment of the model is not a precondition for use of the application. |

## 5. Distribution options

| Option | Produces | Inference | Applicability |
| --- | --- | --- | --- |
| 1. Single document | `run.cmd package` writes `NW Digital City.html`, the application inlined into one file. No infrastructure, no accounts. | Local rules only | Initial review rounds. No approvals required. |
| 2. Static host | The `renderer` folder served from any static host, including a Cloud Storage bucket with website hosting enabled. | Local rules only | Circulation to a team. |
| 3. Cloud Run | A URL with the inference service behind it. | Vertex AI | Pilot and corporate deployment. Specified in section 6. |

`run.cmd package` also writes `nw-digital-city.zip`, the application as separate
files. `renderer/index.html` is not distributable on its own: it loads four
sibling files and renders an empty page without them.

## 6. Deployment procedure

### 6.1 Platform selection

| | Streamlit Community Cloud | Cloud Run |
| --- | --- | --- |
| Input | A repository | A container image |
| Build definition | `requirements.txt` | `Dockerfile` |
| Output | A URL | A URL |
| Idle behaviour | Sleeps | Scales to zero at no cost |
| Configuration | Application settings | `--set-env-vars`, or Secret Manager |

The application is a three-dimensional scene with its own camera and animation
loop, served alongside a small web service. Streamlit renders Python widgets
and would host it in an inline frame, which adds a layer without benefit.
Cloud Run serves it directly.

The container image is built by Cloud Build from the `Dockerfile` at the
repository root: Python 3.12, four packages, `app` and `renderer` copied in,
uvicorn as the entry point. No container tooling is required locally beyond the
`gcloud` CLI.

### 6.2 Deployed artefacts

```
Dockerfile          the image: FastAPI and the renderer, nothing else
deploy/cloudrun.sh  builds the image and deploys the service
```

The same image runs on a local host, on Cloud Run and in a corporate
environment. Only environment variables differ. A cold start is a Python
process and a few hundred kilobytes of static files.

### 6.3 Procedure

```bash
PROJECT=your-gcp-project ./deploy/cloudrun.sh
```

The script enables the required APIs, creates an Artifact Registry repository,
creates a service account holding one role (`roles/aiplatform.user`, permitting
Vertex AI invocation and no other read access in the project), builds the image
with Cloud Build, deploys the service and prints its URL.

`REGION`, `SERVICE`, `PROVIDER`, `MODEL` and `FRAME_ANCESTORS` are overridable
by environment variable.

The service is deployed with `NW_PROVIDER=vertex`, which authenticates by the
service account's application default credentials. **No API key exists anywhere
in the deployed system.** The Google AI Studio key is confined to local
development.

Step-by-step provisioning, including the verification that must precede
deployment, is in
[GCP-SETUP.md](GCP-SETUP.md#63-verify-model-availability).

### 6.4 Upload control

The Cloud Build upload is governed by `.gcloudignore`, which is committed
rather than inferred by `gcloud` from `.gitignore`. The source extract in
`data/raw` contains blueprint owner names and email addresses, and its
exclusion from the build is stated explicitly rather than left as a side effect
of another file. The script refuses to execute if `.gcloudignore` is absent.

The `Dockerfile` is the second control: it copies `app` and `renderer` by name,
so an upload carrying more than intended could not introduce it into the image.

## 7. Scaling and cost

The service is deployed with `--min-instances 0 --max-instances 4`, 1 CPU and
512Mi. At zero traffic it incurs no cost. The only per-request cost is one
Vertex AI call of approximately 2,500 input tokens, and only for a typed query:
the visualisation, the animation and all agent tools execute in the browser.

Setting `--min-instances 1` in advance of a session where first-request latency
matters removes the cold start from the first query. It is a single flag and is
reversible.

## 8. Environment requirements

The environment owner confirms the following:

1. A Google Cloud project, and authorisation to deploy a container to Cloud Run
   within it.
2. Vertex AI enabled, and which Gemini models are available in the region.
   This should be established by the verification procedure in
   [GCP-SETUP.md](GCP-SETUP.md#63-verify-model-availability) rather than from a
   model identifier supplied from record: identifiers change and are retired,
   and an incorrect one produces a service in which every query returns 404.
3. Whether unauthenticated ingress is permitted, or whether the service must
   sit behind IAP or the standard reverse proxy. The script sets
   `--allow-unauthenticated`; where that is not permitted the flag is removed
   and the service placed behind the standard ingress control.
4. The origin serving the Agent Marketplace, required for `FRAME_ANCESTORS`.
5. Whether egress from Cloud Run to `*-aiplatform.googleapis.com` is permitted.
   On a restricted VPC this may require Private Google Access or a Serverless
   VPC connector, which is a network change rather than a change to this
   application.

There is no model to provision and no endpoint to create: Gemini on Vertex AI
is a publisher model available in any project with the API enabled. Where an
environment offers a dedicated endpoint instead, the assessment and the
required code change are in
[GCP-SETUP.md](GCP-SETUP.md#11-alternative-a-dedicated-endpoint).

## 9. Agent Marketplace registration

### 9.1 Integration model

Foundry, the VP&C Agent Marketplace, is a Streamlit application. Each agent is
a row in its own `data/agents.json` carrying name, description, ownership,
sample prompts and a link; the detail page is rendered from that row.
Registration is, in the normal case, the addition of one entry to that file.

Foundry's playground contract assumes a conversational agent: an adapter
accepts a message and returns reply text, and the detail page renders a chat
panel. For platforms that cannot be embedded, such as Emplay and Looker, it
renders a sample transcript and a control that opens the agent in a new tab.

This agent is not conversational. Its response is a change of state in a
visualisation rather than text. It therefore takes the second form, which
requires no change to Foundry.

### 9.2 Catalogue entry

```json
{
  "id": "nwc",
  "name": "NW Digital City",
  "tagline": "Ask about any Networks category and watch it build itself.",
  "about": "NW Digital City turns the Networks category blueprint estate into a city: 8 districts, 31 plots and 145 category lots. Ask about a category, a district or a market in plain English and it finds it, works out how it is doing on blueprint status, adoption, spend and AI readiness, and renders it. Scoped to the Networks organisation.",
  "maturity": "pilot",
  "platform": "GCP",
  "function": "Sourcing",
  "locked": false,
  "audience": "category managers, sourcing leads and anyone curious about blueprint coverage",
  "owner": "VP&C Digital",
  "owner_role": "VP&C",
  "owner_initials": "VP",
  "how": [
    "You ask about a category, a district or a market in plain English",
    "It resolves what you meant, runs its tools over the blueprint extract, and drives the city",
    "Every tool call it makes is shown on screen as it makes it"
  ],
  "sample_prompts": [
    "How is Energy doing?",
    "Where are the biggest gaps?",
    "What could we build?"
  ],
  "canned_reply": "Energy: 7 of 18 lots built, €47m of spend. The biggest empty lot is D511, worth €12m, with no blueprint.",
  "deep_link": "https://nw-digital-city-XXXX.europe-west1.run.app/"
}
```

`deep_link` is the URL printed by the Cloud Run deployment.

### 9.3 Integration options

| | Phase 1: deep link | Phase 2: embedded surface |
| --- | --- | --- |
| Foundry change | None. A `CityPlayground` adapter with `embeddable = False` produces the behaviour already used for Emplay and Looker. | Approximately 10 lines in `foundry/pages/agent.py` to branch on adapter kind and render `st.components.v1.iframe(url, height=720)`. |
| Change here | None | Set `NW_FRAME_ANCESTORS` to the marketplace origin. |
| Reviewer cost | One click to open in a new tab | None |
| Status | Available on a data change alone | Ready on this side |

The application already implements its half of phase 2: with
`NW_FRAME_ANCESTORS` set it sends `Content-Security-Policy: frame-ancestors
<origin>`, permitting the marketplace to frame it and no other origin. Unset,
it denies all framing, which is the appropriate default.

**Recommendation.** Implement phase 1 first. It requires a data change and no
code. Phase 2 introduces a new concept into the playground contract and should
be justified by a second consumer rather than the first.

### 9.4 Change summary

| Objective | Change required |
| --- | --- |
| List the agent in the marketplace | One entry in Foundry's `data/agents.json` |
| Make the control functional | `deep_link`, set to the Cloud Run URL |
| Render inline instead | Approximately 10 lines in `foundry/pages/agent.py`, and `NW_FRAME_ANCESTORS` set here |

## 10. Corporate environment configuration

| Setting | Cloud Run pilot | Corporate |
| --- | --- | --- |
| `NW_PROVIDER` | `vertex` | `vertex` |
| `NW_PROJECT` | the pilot project | the corporate project |
| `NW_REGION` | `europe-west1` | as approved |
| `NW_MODEL` | `gemini-3.5-flash` | as available in that region |
| Ingress | `--allow-unauthenticated` | per the standard ingress control |
| `NW_FRAME_ANCESTORS` | marketplace origin | marketplace origin |

No code differs between the two. The provider is implemented behind an
interface for this purpose.

## 11. Offline distribution

`renderer/index.html` opens from local storage with no server and no network.
The visualisation, the sequencing, the measures, the guided walkthrough and the
local routing rules all function. This path is independent of the deployment
and remains available irrespective of its state.

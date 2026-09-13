# Model service provisioning

## 1. Purpose and scope

This document specifies how to provision the inference service that NW Digital
City calls, on a Google Cloud project, and how to transfer that provisioning to
a corporate environment.

The procedure is identical for a pilot project and a corporate one. Only the
project identifier, the region and the party executing the change differ.

Application deployment is in [DEPLOY.md](DEPLOY.md). Component structure and
security controls are in [ARCHITECTURE.md](ARCHITECTURE.md). Verification
procedures are in [TESTING.md](TESTING.md).

## 2. Current state

| Aspect | State |
| --- | --- |
| Default provider | `mock`. Deterministic local routing, no network dependency. |
| Development provider | `gemini`, authenticated by a Google AI Studio key held in `.env`, which is excluded from version control. |
| Deployed provider | Not provisioned. |
| Application dependency on the model | Query routing only. All measures are resolved in the browser from the embedded dataset. |
| Behaviour without a model | Full function except natural-language routing, which falls back to deterministic local rules. |

## 3. Target state

| Aspect | Target |
| --- | --- |
| Provider | Vertex AI, Gemini publisher model. |
| Authentication | Application default credentials of the Cloud Run runtime service account. No API key in the deployed system. |
| Authorisation | One role, `roles/aiplatform.user`. |
| Network path | Cloud Run to the regional Vertex AI endpoint. |
| Configuration surface | Three environment variables. No code change between environments. |
| Failure behaviour | Deterministic local routing, with the answering path named on the interface. |

## 4. Model access model

Gemini on Vertex AI is a publisher model. It is addressed by name on a regional
endpoint:

```
POST https://{region}-aiplatform.googleapis.com/v1/projects/{project}
     /locations/{region}/publishers/google/models/{model}:generateContent
```

No endpoint resource is created, no machine type is selected, no capacity is
reserved and no cost accrues while the service is idle.

Two consequences govern the rest of this document:

1. Provisioning consists of API enablement and a single IAM binding. It creates
   no infrastructure and requires no capacity planning.
2. A request to provision a model endpoint does not apply to this integration.
   Section 11 assesses the alternative where an organisation mandates a
   dedicated endpoint, and states the code change it requires.

## 5. Prerequisites

| Requirement | Notes |
| --- | --- |
| A Google Cloud project with billing enabled | Project-level `owner` or equivalent is sufficient for the procedure in section 6. |
| The `gcloud` CLI | `winget install Google.CloudSDK` on Windows, `brew install --cask google-cloud-sdk` on macOS. |
| A POSIX shell | The deployment script is a shell script. Git for Windows provides one. |
| A clone of this repository | The deployment script and the provider layer are both in it. |

## 6. Provisioning procedure

### 6.1 Select the project

```bash
gcloud auth login
gcloud config set project YOUR-PROJECT-ID
gcloud config get-value project
```

### 6.2 Enable the required APIs

```bash
gcloud services enable \
  aiplatform.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com
```

| API | Function |
| --- | --- |
| `aiplatform.googleapis.com` | Vertex AI. The inference service. |
| `run.googleapis.com` | Cloud Run. Hosts the container. |
| `cloudbuild.googleapis.com` | Builds the container image from the repository. |
| `artifactregistry.googleapis.com` | Stores the built image. |

The deployment script in section 6.4 performs this step as well. Executing it
separately establishes which services are enabled on the project before any
deployment is attempted.

### 6.3 Verify model availability

This step is a precondition for every step that follows. Model unavailability
and application misconfiguration present identically at the application layer,
so the model path is verified independently before the application is deployed.

```bash
PROJECT=$(gcloud config get-value project)
REGION=europe-west1
MODEL=gemini-3.5-flash

curl -s -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  "https://${REGION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${REGION}/publishers/google/models/${MODEL}:generateContent" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Reply with the single word: ready"}]}]}'
```

**Exit criterion.** The response is JSON containing generated text.

| Response | Cause | Resolution |
| --- | --- | --- |
| `404` | The model name is not available in that region. Model identifiers change and are retired on the provider's schedule. | Set the region to `global`, which addresses the endpoint without a regional prefix and is handled by the application, or select a currently available identifier from the Model Garden. `NW_MODEL` is a configuration value for this reason. |
| `403` | The API is not enabled on the project, or the calling principal lacks Vertex AI access. | Complete section 6.2, and confirm the principal holds `roles/aiplatform.user` or equivalent. |
| Connection failure | Egress to the Vertex AI host is blocked. | See section 10.1, item 5. |

### 6.4 Deploy the service

```bash
cd /path/to/nw_digital_city
PROJECT=$(gcloud config get-value project) bash deploy/cloudrun.sh
```

Initial execution takes five to ten minutes, predominantly the container build.
The service URL is printed on completion.

The script performs the following, in order:

1. Enables the four APIs listed in section 6.2.
2. Creates an Artifact Registry repository named `apps`.
3. Creates the service account `nw-digital-city@PROJECT.iam.gserviceaccount.com`
   and grants it one role, `roles/aiplatform.user`. The service account can
   invoke Vertex AI and read no other resource in the project.
4. Submits the source to Cloud Build, builds the image and pushes it.
5. Deploys to Cloud Run under that service account with the following
   environment:

| Variable | Value | Function |
| --- | --- | --- |
| `NW_PROVIDER` | `vertex` | Selects the Vertex AI provider, authenticated by application default credentials. |
| `NW_MODEL` | `gemini-3.5-flash` | Model identifier. |
| `NW_PROJECT` | the project | Project the inference quota is attributed to. |
| `NW_REGION` | the region | Regional endpoint to address. |

**No API key exists anywhere in the deployed system.** `NW_PROVIDER=vertex`
authenticates by application default credentials, which on Cloud Run resolve to
the runtime service account. The Google AI Studio key used in development is
confined to the local `.env`, which is excluded from version control and from
the Cloud Build upload.

### 6.5 Verify the deployment

```bash
URL=$(gcloud run services describe nw-digital-city --region europe-west1 \
      --format 'value(status.url)')
curl -s "$URL/health"
```

**Exit criterion.** `/health` reports `{"ready": true, "provider": "vertex",
"model": "..."}`, and the interface at `$URL` names the answering model on the
query bar.

A status of **local rules, no model** indicates that the application is serving
correctly and could not reach Vertex AI. `/health` reports the cause.

### 6.6 Configuration overrides

```bash
PROJECT=my-project REGION=europe-west4 MODEL=gemini-3.5-flash-lite \
  bash deploy/cloudrun.sh
```

`REGION`, `SERVICE`, `PROVIDER`, `MODEL` and `FRAME_ANCESTORS` are all
overridable by environment variable at deployment time.

## 7. Application configuration

No application change is required for a Vertex AI deployment. `app/providers.py`
implements four providers behind one interface, selected by `NW_PROVIDER`:

| `NW_PROVIDER` | Required configuration | Authentication |
| --- | --- | --- |
| `mock` | none | None. Deterministic, no network. The default. |
| `gemini` | `NW_API_KEY` | Google AI Studio key. Development only. |
| `vertex` | `NW_PROJECT`, `NW_REGION` | Application default credentials. No key. |
| `claude` | `NW_API_KEY` | Anthropic API. |

Transition between Google Cloud projects is a change to three values:
`NW_PROJECT`, `NW_REGION` and `NW_MODEL`. It requires no data rebuild, no code
change and no image rebuild.

## 8. Disclosure boundary

The prompt carries identifiers only: category codes, category titles, district
names, plot names and market names. It carries no spend, no adoption measure,
no score and no personal data.

The model determines which category a query refers to and what class of query
it is. The browser resolves the corresponding measures locally, from the
dataset embedded in the delivered page.

Two properties follow, and both are material to a security review:

1. No figure presented by the interface can originate from the model, because
   the model is not supplied with any figure.
2. No commercially sensitive value leaves the environment, including during
   any interim period in which the inference endpoint is not the final one.

The boundary is enforced in `app/plan.py`, which validates the model response
against the permitted identifier lists and discards any category not present
in the dataset.

## 9. Cost model

Measured per query:

| Component | Volume |
| --- | --- |
| System prompt | 2,800 characters |
| Identifier vocabulary | 7,038 characters |
| **Input per query** | **approximately 2,500 tokens** |
| Output per query | approximately 60 tokens |

Only natural-language queries consume inference. The visualisation, the
animation, the scoring, the guided walkthrough and all agent tools execute in
the browser at no inference cost. A twelve-query session consumes approximately
30,000 input tokens.

Cloud Run at `--min-instances 0` costs nothing while the service is idle.
Current per-token pricing should be taken from the provider's pricing page
rather than from this document.

## 10. Transition to a corporate environment

### 10.1 Requirements to confirm with the environment owner

1. A project, and authorisation to deploy a container to Cloud Run within it.
2. `aiplatform.googleapis.com` enabled, and confirmation of which Gemini models
   are available in which region. This should be established by the procedure
   in section 6.3 rather than from a model identifier supplied from record.
3. Whether unauthenticated ingress is permitted. The deployment script sets
   `--allow-unauthenticated`. Where that is not permitted, the flag is removed
   and the service is placed behind the standard ingress control.
4. The origin serving the Agent Marketplace, required for `FRAME_ANCESTORS`.
   See [DEPLOY.md](DEPLOY.md).
5. Whether egress from Cloud Run to `*-aiplatform.googleapis.com` is permitted.
   On a restricted VPC this may require Private Google Access or a Serverless
   VPC connector.

### 10.2 Artefacts to transfer

This repository, which contains the deployment script, the provider layer and
this document. No model configuration is compiled into the application.

### 10.3 Execution sequence

```bash
gcloud config set project THEIR-PROJECT-ID
# section 6.3, with the target region and model identifier
PROJECT=THEIR-PROJECT-ID REGION=their-region MODEL=their-model \
  bash deploy/cloudrun.sh
```

Where section 6.3 succeeds and the deployment completes, the integration is
operational. Where section 6.3 fails, the deployment will still complete and
will produce a service in which every query falls back to local routing.

### 10.4 Degraded operation

Where the model is unreachable, not approved or not yet provisioned, the
application continues to answer every query in the documented walkthrough using
deterministic rules in the browser. The interface reports **local rules, no
model**, so the answering path is never ambiguous.

This is a designed state rather than an error state. An outstanding model
approval does not block evaluation of the application.

## 11. Alternative: a dedicated endpoint

Some environments standardise on a self-deployed model: an open model from the
Model Garden, or a tuned model, deployed to a Vertex AI endpoint with an
identifier. This is a different request path and requires an application change.

```
publisher model   .../publishers/google/models/{model}:generateContent
endpoint          .../endpoints/{endpoint_id}:generateContent
```

The change is confined to one function, `_vertex` in `app/providers.py`, which
constructs the request URL. The endpoint identifier is read from an environment
variable and the second form used when it is set.

| Criterion | Publisher model | Dedicated endpoint |
| --- | --- | --- |
| Provisioning | API enablement and one IAM binding | Endpoint resource, machine type, capacity |
| Cost basis | Per token consumed | Per hour of allocated capacity, irrespective of use |
| Idle cost | None | The full allocation |
| Request format | In use by the application | Gemini endpoints accept the current body; other model families may require `:predict` and a different envelope, which exceeds a URL change |

**Recommendation.** Where both are available, use the publisher model. The
application is idle for the majority of its operating time, which makes the
cost difference the difference between none and a standing allocation.

# Standing up the model on GCP

The same steps on a personal account and on an internal one. Only the project
id, the region and who runs the commands change.

---

## First, the thing that surprises everyone

**There is no model to deploy and no endpoint to create.** Gemini on Vertex AI
is a *publisher model*: it already exists in every project where the API is
enabled, and you call it by name.

```
POST https://{region}-aiplatform.googleapis.com/v1/projects/{project}
     /locations/{region}/publishers/google/models/{model}:generateContent
```

No endpoint resource, no machine type, no minimum instance, no warm-up, nothing
to keep running and nothing to pay for while idle. Enabling the API and holding
one IAM role is the whole of it.

That matters for the handover, because "deploy a model endpoint" is a job that
takes a platform team a week, and this is not that job. What the internal
environment has to provide is a project with the API on and a service account
with one role. If somebody offers to provision a dedicated endpoint instead,
[read the last section](#if-you-are-given-a-real-endpoint-instead) before
agreeing: it works, it costs money by the hour, and it needs a two-line code
change.

---

## Part 1: your own account, end to end

### What you need before you start

- A GCP project with billing enabled, which you have.
- The `gcloud` CLI. `winget install Google.CloudSDK` on Windows, `brew install
  --cask google-cloud-sdk` on a Mac.
- The repository, and `bash`. Git for Windows ships `bash`, so if you have Git
  you have it.

### Step 1. Point gcloud at the project

```bash
gcloud auth login
gcloud config set project YOUR-PROJECT-ID
gcloud config get-value project          # confirm it took
```

### Step 2. Turn on the four APIs

The deploy script does this for you, but do it once by hand so you see what is
being switched on and can answer for it later.

```bash
gcloud services enable \
  aiplatform.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com
```

| API | What it is for |
| --- | --- |
| `aiplatform` | Vertex AI. This is the model. |
| `run` | Cloud Run, which hosts the one container. |
| `cloudbuild` | Builds that container from the repository. |
| `artifactregistry` | Stores the built image. |

### Step 3. Prove the model answers, before deploying anything

Do this step carefully. It separates "the model is not available" from "my
application is misconfigured", and those two look identical from inside the
app.

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

You want a JSON reply containing `ready`.

**If it comes back 404**, the model name is not available in that region. Model
names change and Google retires them; this is the single most likely thing to
go wrong, and it is the reason `NW_MODEL` is a setting rather than a constant.
Try `global` as the region (the host then drops the region prefix and becomes
`aiplatform.googleapis.com`, which the application already handles), or pick a
current model from the Model Garden page in the console.

**If it comes back 403**, the API is not enabled on the project or your account
cannot use it.

Do not move on until this returns text. Everything after it assumes the model
answers.

### Step 4. Deploy

```bash
cd /path/to/nw_digital_city
PROJECT=$(gcloud config get-value project) bash deploy/cloudrun.sh
```

Five to ten minutes the first time, mostly the build. It prints the URL.

What the script does, in order:

1. Enables the four APIs, in case step 2 was skipped.
2. Creates an Artifact Registry repository called `apps`.
3. Creates a service account `nw-digital-city@PROJECT.iam.gserviceaccount.com`
   and grants it **one** role: `roles/aiplatform.user`. It can call Vertex AI
   and read nothing else in the project.
4. Uploads the folder to Cloud Build, builds the image, pushes it.
5. Deploys to Cloud Run as that service account, with these environment
   variables:

```
NW_PROVIDER=vertex        use Vertex AI, with the service account's own credentials
NW_MODEL=gemini-3.5-flash which model
NW_PROJECT=<project>      whose quota the call is billed to
NW_REGION=<region>        which regional endpoint to call
```

**No API key exists anywhere in the deployed system.** `NW_PROVIDER=vertex`
authenticates with application default credentials, which on Cloud Run are the
runtime service account's. The Google AI Studio key in the local `.env` is for
development only and never leaves the local host.

### Step 5. Check the deployment from the outside

```bash
URL=$(gcloud run services describe nw-digital-city --region europe-west1 \
      --format 'value(status.url)')
curl -s "$URL/health"
```

`{"ready": true, "provider": "vertex", "model": "..."}` means the service can
reach the model. Then open `$URL` in a browser: the badge on the ask bar names
the model that is answering. If it says **local rules, no model**, the page is
working and the service could not reach Vertex, and `/health` will say why.

### Step 6. Override anything without editing code

```bash
PROJECT=my-project REGION=europe-west4 MODEL=gemini-3.5-flash-lite \
  bash deploy/cloudrun.sh
```

`REGION`, `SERVICE`, `PROVIDER`, `MODEL` and `FRAME_ANCESTORS` all work this
way.

---

## Part 2: what changes in the application

**Nothing, for a normal Vertex deployment.** That is the point of the provider
layer, and it is worth being able to say so plainly when you hand this over.

`app/providers.py` holds four providers behind one interface, chosen by
`NW_PROVIDER`:

| `NW_PROVIDER` | Needs | Auth |
| --- | --- | --- |
| `mock` | nothing | none. Deterministic, no network. The default. |
| `gemini` | `NW_API_KEY` | Google AI Studio key. Local development. |
| `vertex` | `NW_PROJECT`, `NW_REGION` | Application default credentials. No key. |
| `claude` | `NW_API_KEY` | Anthropic API. |

Moving from your account to Vodafone's is three environment variables:
`NW_PROJECT`, `NW_REGION`, `NW_MODEL`. No rebuild of the data, no code change,
no redeploy of anything but the revision.

### The one thing to hold on to

The prompt carries **names only**. Category codes, category titles, district
names, plot names, market names. It carries no spend, no adoption, no score,
and no owner. The model decides *which* lot to fly to and *what kind* of
question was asked; the browser works out what is on the lot, from
`city.json`, locally.

Two consequences worth stating in a review:

- No figure on screen can have been invented by the model, because the model
  never sees a figure.
- No commercially sensitive value leaves the environment, even while the
  endpoint is a temporary one.

`app/plan.py` is where this is enforced: the reply is validated against the
name lists, and a category the city does not have is dropped rather than
passed through.

### What a question actually costs

Measured, not estimated:

| | |
| --- | --- |
| System prompt | 2,800 characters |
| The name lists | 7,038 characters |
| **Per question, in** | **~2,500 tokens** |
| Per question, out | ~60 tokens, one line of JSON |

Only a typed question costs anything. The city, the animation, the scoreboard,
the tour, night mode and every tool the agent runs are all in the browser and
cost nothing. A walkthrough with a dozen questions in it is about 30,000 input
tokens in total. Check the current per-token price in the console rather than
trusting a figure written down here.

Cloud Run at `--min-instances 0` costs nothing while nobody is using it.

---

## Part 3: handing it to the internal team

### What to ask them for

1. A project, and permission to deploy a container to Cloud Run in it.
2. `aiplatform.googleapis.com` enabled, and **which Gemini models are
   available in which region**. Ask for the answer to step 3's curl, not for a
   model name from memory.
3. Whether `--allow-unauthenticated` is permitted. If not, drop the flag and
   put the service behind whatever fronts internal applications.
4. The exact origin the Agent Marketplace is served from, for
   `FRAME_ANCESTORS`. See [DEPLOY.md](DEPLOY.md).
5. Whether egress from Cloud Run to `*-aiplatform.googleapis.com` is open. On a
   locked-down VPC it may need Private Google Access or a Serverless VPC
   connector.

### What they need from you

The repository, and this file. That is the whole handover: the deploy script is
in it, the provider layer is in it, and nothing about the model is compiled in.

### The sequence to run on their side

```bash
gcloud config set project THEIR-PROJECT-ID
# step 3's curl first, with their region and their model name
PROJECT=THEIR-PROJECT-ID REGION=their-region MODEL=their-model \
  bash deploy/cloudrun.sh
```

If the curl in step 3 works and the deploy finishes, it works. If the curl
fails, nothing after it can succeed, and the deploy will produce a service
where every question falls back to the browser's own rules.

### The fallback is not a failure state

If the model is unreachable, unapproved or not yet provisioned, the application
still answers every question in the walkthrough using rules in the browser. The
badge says **local rules, no model** so nobody is misled about what is
answering. A review that stalls on model approval does not stall the
demonstration.

---

## If you are given a real endpoint instead

Some environments standardise on a self-deployed model: an open model from the
Model Garden, or a tuned model, deployed to a Vertex AI **endpoint** with an id.
That is a different URL shape, and it does need a code change.

```
publisher model   .../publishers/google/models/{model}:generateContent
endpoint          .../endpoints/{endpoint_id}:generateContent
```

The change is in one function, `_vertex` in `app/providers.py`, which builds
that URL. Read the endpoint id from an environment variable and use the second
form when it is set.

Two things to weigh before accepting one:

- A dedicated endpoint holds machines. It is billed by the hour whether or not
  anybody asks a question, where the publisher model is billed per token. For
  an application that is idle most of the time, that is the difference between
  nothing and a standing cost.
- The request and response bodies differ between model families. A Gemini
  endpoint takes the body already in use. An open model may want
  `:predict` and a different envelope, which is more than a URL change.

If the environment offers both, take the publisher model.

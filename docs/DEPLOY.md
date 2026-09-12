# Deploying it, and putting it in the Agent Marketplace

## Distribution options

Three, in order of effort.

**1. A single document.** `run.cmd package` writes **`NW Digital City.html`**,
the whole application inlined into one file. No archive, no infrastructure, no
accounts. Everything works except the model, and the agent falls back to its
own routing rules, which
handle every query in the walkthrough.
**For a first review round, do this.**

The same command also writes `nw-digital-city.zip`, which is the city as
separate files for anyone who wants to see how it works. Do not attach
`renderer/index.html` on its own: it is a shell that loads four other files
and opens as a blank page.

**2. Put the folder on a static host, get a link.** The `renderer` folder is
just files: drag it onto <https://app.netlify.com/drop> and you have a public
URL in about ten seconds, or put it in a Google Cloud Storage bucket with
website hosting turned on. Same caveat: no model, everything else works. Good
for "send it round the team".

**3. Cloud Run, for the real thing.** A URL with the model behind it, which is
also what gets deployed internally. This is the rest of this document.

### How Cloud Run compares to Streamlit Community Cloud

You already know the Streamlit flow: point it at a GitHub repo, it works out
how to run it, you get a URL. Cloud Run is the same idea with one extra step in
the middle:

| | Streamlit Community Cloud | Cloud Run |
| --- | --- | --- |
| You give it | a GitHub repo | a container image |
| It works out how to run it from | `requirements.txt` | the `Dockerfile` |
| You get back | a URL | a URL |
| It sleeps when idle | yes | yes, and costs nothing while asleep |
| Secrets | Advanced settings | `--set-env-vars`, or Secret Manager |

**A container image** is the extra concept, and it is simpler than it sounds:
a zip of your code together with the exact operating system and libraries it
needs, so it runs identically everywhere. The `Dockerfile` at the root of this
repo is the recipe for building it, and it is fifteen lines: start from Python
3.12, install four packages, copy in `app` and `renderer`, run uvicorn.

**Why this project needs Cloud Run rather than Streamlit.** Streamlit renders
Python widgets. This is a 3D scene with its own camera and animation loop,
served alongside a small web service. Streamlit would end up hosting it in an
iframe, which adds a layer and gains nothing. Cloud Run just serves it.

**You do not run the Docker command yourself.** `deploy/cloudrun.sh` hands the
folder to Cloud Build, which builds the image in Google's cloud and deploys it.
Nothing needs installing locally except the `gcloud` command.

### What you would actually type, once

```powershell
winget install Google.CloudSDK
gcloud auth login
gcloud config set project YOUR-PROJECT-ID
bash deploy/cloudrun.sh
```

Five to ten minutes the first time, mostly waiting for the build. It prints the
URL at the end. Every deploy after that is the last line again.

`bash` is there because the script is a shell script; Git for Windows installs
`bash`, so if you have Git you have it. Running it from Git Bash works too.

## What actually gets deployed

One container. It holds the page and the small service that answers questions,
so there is one thing to roll out and one URL to hand out. The same image runs
on a local host, on Cloud Run, and in the internal environment; only
environment variables differ.

```
Dockerfile          the image: FastAPI + the renderer, nothing else
deploy/cloudrun.sh  build it and put it on Cloud Run
```

No database, no state, no session store. A cold start is a Python process and a
few hundred kilobytes of static files.

## Cloud Run

```bash
PROJECT=your-gcp-project ./deploy/cloudrun.sh
```

That script does the whole thing: enables the APIs, creates an Artifact
Registry repository, creates a service account holding exactly one role
(`roles/aiplatform.user`, so it can call Vertex AI and read nothing else in the
project), builds the image with Cloud Build, deploys, and prints the URL.

Overridable the same way: `REGION`, `SERVICE`, `PROVIDER`, `MODEL`,
`FRAME_ANCESTORS`.

**What gets uploaded to Cloud Build is decided by `.gcloudignore`**, which is
committed rather than left for gcloud to infer from `.gitignore`. The workbook
in `data/raw` has blueprint owner names and email addresses in it, and that is
not something to keep out of a build by side effect of another file. The
script refuses to run if the file is missing. The Dockerfile is the layer
under that: it copies `app` and `renderer` by name, so even an upload carrying
more than it should could not put it in the image.

It deploys with `NW_PROVIDER=vertex`, which uses the service account's
application default credentials. **No API key exists anywhere in the deployed
system.** The Google AI Studio key is for local development only.

### Scale, and what it costs

`--min-instances 0 --max-instances 4`, 1 CPU, 512Mi. At zero traffic it costs
nothing. The only per-request cost is a Vertex AI call of a few hundred tokens,
and only when somebody types a question: the city itself, the animation and the
tools all run in the browser.

Set `--min-instances 1` ahead of any session where first-request latency
matters, so the first query does not pay for a cold start. One flag, and it can
be reverted afterwards.

### What the environment owner needs to confirm

1. A GCP project, and the ability to deploy a container to Cloud Run in it.
2. Vertex AI enabled, and which Gemini models are available in the region.
3. Whether unauthenticated access is allowed, or whether it has to sit behind
   IAP or the standard reverse proxy. The script uses
   `--allow-unauthenticated`; if that is not permitted, drop the flag and put
   it behind whatever fronts internal apps.
4. The origin the Agent Marketplace is served from, for `FRAME_ANCESTORS`.

## Putting it in the Agent Marketplace

Foundry, the VP&C Agent Marketplace, is a Streamlit app. Every agent on it is a
row in `data/agents.json`: name, tagline, what it does, who owns it, some sample
prompts, and a link. The detail page is rendered from that row. Adding an agent
to the marketplace is, in the normal case, **adding an entry to a JSON file**.

There is one wrinkle. Foundry expects an agent to be a chat: a *playground*
adapter takes a message and returns reply text, and the page draws a chat panel.
Where a platform cannot be embedded, like Emplay and Looker, it shows a sample
transcript and a button that opens the agent in its own tab instead.

This agent is not a chat. The answer is a city moving, not a paragraph. So it
takes the second shape: sample transcript in the marketplace, button that opens
the real thing. That needs no code in Foundry at all.

### 1. An entry in `data/agents.json`

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

`deep_link` is what the Cloud Run deploy prints.

### 2. How it gets tried, and the two options

**Deep link, the recommended option.** Add a `CityPlayground` adapter with
`embeddable = False` and the marketplace behaves exactly as it does for Emplay
and Looker today: the detail page shows the sample transcript, and the button
opens the city in a new tab. **Nothing changes in Foundry's code.** It costs a
reviewer one click.

**Embedded, later.** A third kind of playground alongside chat: an *embedded
surface*, where the adapter gives a URL and the detail page renders
`st.components.v1.iframe(url, height=720)` instead of a chat box. That is a
small change in `foundry/pages/agent.py` to branch on the adapter's kind, and
this service is already ready for its half: set `NW_FRAME_ANCESTORS` to the
marketplace's origin and it sends `Content-Security-Policy: frame-ancestors
<that origin>`, so the marketplace can frame it and nobody else can. Unset, it
refuses everyone, which is the right default.

Do the deep link first. It works today with a data change and no code. Add the
embedded surface when a *second* agent wants one, because a new concept on the
playground contract earns its place at two users, not one.

### In short

| To do this | You change |
| --- | --- |
| List it in the marketplace | one entry in `data/agents.json` |
| Make the button work | `deep_link`, from the Cloud Run URL |
| Show it inside the page instead | ~10 lines in `foundry/pages/agent.py`, and set `NW_FRAME_ANCESTORS` here |

### Where it sits in the marketplace's own story

Foundry's pitch is that anyone in VP&C can discover, try and scale the agents
built across the org. This entry runs on the same GCP estate as the production
agents and is listed alongside them.

## The internal environment

Same image, same command shape, different address. What changes:

| Setting | Cloud Run pilot | Internal |
| --- | --- | --- |
| `NW_PROVIDER` | `vertex` | `vertex` |
| `NW_PROJECT` | the pilot project | the internal project |
| `NW_REGION` | `europe-west1` | whatever is approved |
| `NW_MODEL` | `gemini-3.5-flash` | whichever Gemini is available there |
| Access | `--allow-unauthenticated` | behind whatever fronts internal apps |
| `NW_FRAME_ANCESTORS` | marketplace origin | marketplace origin |

Nothing in the code changes between them. That was the point of putting the
provider behind an interface.

## Offline fallback

`renderer/index.html` opens from local storage with no server and no network.
Everything except the model works: the visualisation, the sequencing, the
figure, the guided walkthrough and the agent's own routing rules. This path is
independent of the deployment and remains available regardless of its state.

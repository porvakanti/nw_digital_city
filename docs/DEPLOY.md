# Deploying it, and putting it in the Agent Marketplace

## What actually gets deployed

One container. It holds the page and the small service that answers questions,
so there is one thing to roll out and one URL to hand out. The same image runs
on a laptop, on Cloud Run, and in the internal environment; only environment
variables differ.

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

It deploys with `NW_PROVIDER=vertex`, which uses the service account's
application default credentials. **No API key exists anywhere in the deployed
system.** The Google AI Studio key is for building on a laptop.

### Scale, and what it costs

`--min-instances 0 --max-instances 4`, 1 CPU, 512Mi. At zero traffic it costs
nothing. The only per-request cost is a Vertex AI call of a few hundred tokens,
and only when somebody types a question: the city itself, the animation and the
tools all run in the browser.

For the all-hands, set `--min-instances 1` the morning of, so the first question
on stage does not pay for a cold start. That is one flag and a few euros for a
day.

### What I need from whoever owns the environment

1. A GCP project, and the ability to deploy a container to Cloud Run in it.
2. Vertex AI enabled, and which Gemini models are available in the region.
3. Whether unauthenticated access is allowed, or whether it has to sit behind
   IAP or the standard reverse proxy. The script uses
   `--allow-unauthenticated`; if that is not permitted, drop the flag and put
   it behind whatever fronts internal apps.
4. The origin the Agent Marketplace is served from, for `FRAME_ANCESTORS`.

## Putting it in the Agent Marketplace

Foundry lists agents from `data/agents.json` and renders each one's detail page
from that entry. Two things are needed.

### 1. An entry in `data/agents.json`

```json
{
  "id": "nwc",
  "name": "NW Digital City",
  "tagline": "Ask about any Networks category and watch it build itself.",
  "about": "NW Digital City turns the Networks category blueprint estate into a city: 8 districts, 31 plots and 145 category lots. Ask about a category, a district or a market in plain English and it finds it, works out how it is doing on blueprint status, adoption, spend and AI readiness, and builds it in front of you. Built for the Networks all-hands, September 2026.",
  "maturity": "pilot",
  "platform": "GCP",
  "function": "Sourcing",
  "locked": false,
  "audience": "category managers, sourcing leads and anyone curious about blueprint coverage",
  "owner": "Praveen Orvakanti",
  "owner_role": "VP&C",
  "owner_initials": "PO",
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

### 2. A playground adapter, or none at all

The existing adapters are all conversational: `send()` takes a message and
returns reply text, and the marketplace renders a chat panel. This agent is not
a chat panel. Its whole point is that the answer is a city moving, not a
paragraph.

There are two honest ways to list it, and the second is better:

**Deep link only.** Set `embeddable = False` on a `CityPlayground` adapter, and
Foundry shows the sample transcript and an "Open agent" button, exactly as it
does for Emplay and Looker today. Nothing new is needed. It costs the reviewer
one click and a new tab.

**Embedded.** A third kind of playground alongside chat: an *embedded surface*.
The adapter declares a URL and the detail page renders it with
`st.components.v1.iframe(url, height=720)` instead of a chat box. That needs a
small change in `foundry/pages/agent.py` to branch on the adapter kind, and
this service already supports being framed: set `NW_FRAME_ANCESTORS` to the
marketplace's origin and it sends `Content-Security-Policy: frame-ancestors
<that origin>`. Unset, it refuses to be framed by anyone, which is the right
default.

I would do the deep link first, because it works today with a data change and
no code, and add the embedded surface once the marketplace has a second agent
that wants one. A "surface kind" on the playground contract is worth adding
when two things need it, not one.

### Where it sits in the marketplace's own story

Foundry's pitch is that anyone in VP&C can discover, try and scale the agents
built across the org. This is the case in point: an agent built in a fortnight
by one person, running on the same GCP the production agents run on, listed
next to Sourcing Copilot and Contract IQ. On stage that is worth saying out
loud, because it is the marketplace's argument and this is its evidence.

## The internal environment

Same image, same command shape, different address. What changes:

| Setting | Cloud Run pilot | Internal |
| --- | --- | --- |
| `NW_PROVIDER` | `vertex` | `vertex` |
| `NW_PROJECT` | the pilot project | the internal project |
| `NW_REGION` | `europe-west1` | whatever is approved |
| `NW_MODEL` | `gemini-2.0-flash` | whichever Gemini is available there |
| Access | `--allow-unauthenticated` | behind whatever fronts internal apps |
| `NW_FRAME_ANCESTORS` | marketplace origin | marketplace origin |

Nothing in the code changes between them. That was the point of putting the
provider behind an interface.

## The fallback, which is not a formality

If none of this is ready on the day, `renderer/index.html` opens from a USB
stick with no server and no network, and everything except the model works: the
city, the choreography, the builder, the guided tour and the agent's own rules.
That is the version to have on the presenting laptop regardless of how the
deployment goes.

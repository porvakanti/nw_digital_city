# Spotlight: design pack

Spotlight lets colleagues turn a screen recording of an AI tool into a
polished 60 to 120 second film: narrated, captioned, scored and on brand, in
the same style as the VP&C demo films. Nobody needs to edit video or write
code.

This folder is everything a new repository needs to build it. Copy the whole
folder into the new repo, put `CLAUDE.md` at the root, and start a Claude
Code session with:

> Read CLAUDE.md and docs/, then start Phase 0 of docs/08-build-plan.md.

## What is in the pack

| File | What it covers |
|---|---|
| [CLAUDE.md](CLAUDE.md) | The build brief: conventions, guardrails and what "done" means. It goes at the repository root. |
| [docs/01-product.md](docs/01-product.md) | Goals, the user, the user journey, screens, scope and what is out of scope. |
| [docs/02-architecture.md](docs/02-architecture.md) | Architecture diagram, components, the GCP services and the system flows. |
| [docs/03-repo-structure.md](docs/03-repo-structure.md) | Repository layout, with the frontend and backend deployable separately, plus packages and versions. |
| [docs/04-render-engine.md](docs/04-render-engine.md) | The film format (timeline JSON), the effect library, picture, voice, captions, score and mix. |
| [docs/05-ai-assist.md](docs/05-ai-assist.md) | Gemini on Vertex AI: watching the recording, drafting the story, prompts and schemas, and the switch to Claude later. |
| [docs/06-security.md](docs/06-security.md) | Sign-in with Entra ID through IAP, data handling, masking and retention. |
| [docs/07-deploy-gcp.md](docs/07-deploy-gcp.md) | The deployment guide: projects, services, IAM, builds, environment variables and costs. |
| [docs/08-build-plan.md](docs/08-build-plan.md) | Phases with acceptance tests, in build order. |
| [reference/](reference/) | The working engine the demo films were made with, to port from: stage, kit, renderer, audio pipeline, music, fonts and two example films. |

## The decisions behind it

| Decision | Choice | Why |
|---|---|---|
| Platform | Google Cloud | Where the application will run. |
| Voice | Google Cloud Text-to-Speech, three British English voices to pick from, each with a sample | Keeps everything in GCP. The free voice service the demo films used is not licensed for a product. |
| AI model | The latest Gemini model available on our AI platform, through Vertex AI, behind a provider interface | Available in our GCP today. Claude on Vertex AI is a configuration switch when it becomes available. |
| Sign-in | Microsoft Entra ID through Identity-Aware Proxy. **To be implemented by the platform team**, reusing their existing setup. It is not part of the Claude Code build. | Colleagues use their normal work accounts. The app only verifies the identity IAP passes in. |
| Scope of v1 | Single films only | Montages, like the community-call film, come in v2. |
| Deployment | Frontend and backend as separate services, from one repository, inside our GCP environment (VPC) | Follows the architecture board's guidance. |

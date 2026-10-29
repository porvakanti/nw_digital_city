# 05 · AI assist (Gemini on Vertex AI, with a switch to Claude)

The AI drafts and the user decides. Everything the model produces is a
suggestion shown in the storyboard. Nothing reaches a final render without
the user seeing it.

## Provider interface

All model calls go through one interface, so changing provider is a
configuration change:

```python
# apps/api/app/ai/provider.py
class AIProvider(Protocol):
    async def draft_storyboard(self, req: DraftRequest) -> Storyboard: ...
    async def suggest_line(self, req: LineRequest) -> list[str]: ...        # 3 alternatives
    async def find_sensitive(self, req: SensitiveRequest) -> list[MaskSuggestion]: ...

def get_provider() -> AIProvider:
    match settings.AI_PROVIDER:          # "gemini" (default) | "claude"
        case "gemini": return GeminiProvider(model=settings.GEMINI_MODEL)
        case "claude": return ClaudeProvider(model=settings.CLAUDE_MODEL)   # placeholder until available
```

- **`GeminiProvider`** uses `google-genai` with `vertexai=True`, the project
  and the location. The model comes from `GEMINI_MODEL`: the **latest
  Gemini model available on our AI platform**, set by configuration and
  never hard-coded. Use the most capable model for drafting, and the fastest
  (`GEMINI_FAST_MODEL`) for
  `suggest_line`.
- **`ClaudeProvider`** is a placeholder with the same interface, using
  `anthropic[vertex]` (`AnthropicVertex`). Claude doesn't read video
  directly. When Claude is selected, the API first samples key frames
  (1 per 2 s, maximum 60) plus the brief, and passes them as images. Ship
  it behind the flag, with a contract test that runs only when
  `AI_PROVIDER=claude` is configured.
- **Both** return **structured output validated against the JSON Schema.**
  Use Gemini's `response_schema` and Claude's tool-use output schema. Invalid
  output is retried once with the validation error, then the user gets an
  empty storyboard with a friendly note, never a crash.

## 1. Draft the storyboard

**Input:**
- the recording's **proxy** (`gs://` URI, 540p, so the model watches it
  natively);
- the brief (the four answers);
- the template (target length, beat structure);
- the house style rules below;
- the schema.

**System prompt** (`prompts/draft_storyboard.md`), in summary:

> You are drafting a short product film in a fixed house style. Structure:
> title, the problem, the answer, how it works, the result, end card.
>
> Rules:
> - Narration is British English, plain, warm and confident. Short
>   sentences. Use second person when it helps ("you").
> - No jargon. No exclamation marks. No hype words such as revolutionary
>   or seamless.
> - The problem beat must make sense to someone who has never seen the
>   tool.
> - **Don't read figures aloud.** Numbers go on screen as badges; the
>   narration talks about the outcome. (We learned this from the demo
>   films.)
> - Use `|` to mark phrase breaks for pacing.
> - Choose moments from the recording that show the thing being said.
>   Prefer moments where something visibly changes, such as a result
>   appearing, a number counting or an answer arriving. Avoid loading
>   spinners and empty screens.
> - Keep within ±10% of the target length at about 2.4 words a second of
>   narration.
> - If the brief and the recording disagree, trust the recording and say so
>   in `notes`.

**Output (schema-validated):**
- `title`;
- `beats[]` (kind, narration, moments with in and out points, optional
  callout or badge);
- `end.tagline`;
- `masks[]` (suggested);
- `notes[]`, shown to the user as "Things to check".

**Post-processing in the API:**
- Snap moments to the recording's length.
- Merge overlapping moments.
- Enforce the minimum moment length (1.5 s).
- Run the compiler's dry run to estimate the length.
- If the estimate is more than 20% over target, ask the model once to
  shorten.

## 2. Suggest another line

**Input:** the beat kind, the current line, the lines either side, the
brief, and the beat's length budget in seconds.

**Output:** three alternatives within the budget, in the same rules. This
uses the fast model (`GEMINI_FAST_MODEL`) and should come back in under 3 seconds.

## 3. Find sensitive areas

**Input:** the proxy (or key frames). Ask for bounding boxes, as fractions,
with time ranges, for:
- people's names;
- email addresses;
- phone numbers;
- personal photos;
- account or ID numbers;
- anything the brief's "avoid" answer mentions.

**Output:** `MaskSuggestion[]` with a reason ("email address"). They show in
the mask tool as dashed boxes, each with **Hide** and **Ignore**.

## Data handling for AI calls

- All calls go to **Vertex AI in the configured region** (for example
  `europe-west4` or `europe-west1`) under the project's data-governance
  terms. No prompt or response is used for training.
- Prompts and responses are **not logged**. Only metadata is logged: model,
  latency, token counts and validation outcome.
- The recording is passed by `gs://` URI, never downloaded to the API.
- A setting `AI_ENABLED=false` turns off every AI feature, as a technical
  fallback if the AI platform is unavailable. The storyboard then starts
  from an empty template.

## Cost (indicative)

| Call | Volume per film | Cost per film |
|---|---|---|
| Draft (most capable model, one 2 to 10 minute proxy video plus a few thousand tokens) | 1 to 2 | cents to a few tens of cents, depending on video length and model |
| Suggest line (fast model) | 5 to 20 | under a cent in total |
| Sensitive areas | 1 | as for the draft |
| Text-to-speech | about 1,000 to 2,000 characters, cached | under a cent |

Check against your Vertex AI price list. The render's computing time
(Cloud Run Jobs) usually costs more than the AI.

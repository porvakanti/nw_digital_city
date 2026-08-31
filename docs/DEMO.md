# Running it, and testing it end to end

Two ways to open it, one script to walk it, and a checklist of what should
happen at each step. The script is the same sequence the guided tour runs, so
you can either click **Next** eight times or drive it yourself.

## Opening it

**No installs.** Open `renderer/index.html` in Chrome. The city, the
animations, the builder and the agent all work with no server and no network.
This is the safety net: if the venue wifi dies on the day, this still runs.

**With the model.** From the repository root:

| Your machine | Run this |
| --- | --- |
| Windows | double-click **`run.cmd`** |
| macOS, Linux | `./run.sh` |

`run.sh` is a shell script. Double-clicking it on Windows opens it in a text
editor or a browser, because Windows does not know what a `.sh` file is. If
`run.cmd` reports there is no Python, it tells you how to install one; the
model is the only part that needs it.

It makes a virtual environment, installs into it, writes `.env` if there is
none, starts the service and opens a browser. To use a model, edit `.env`:

```ini
NW_PROVIDER=gemini
NW_API_KEY=your-google-ai-studio-key
```

and run it again. The badge on the ask bar names the model that is answering.
A key only works this way: a page opened from a file has no service behind it,
so it uses the browser's own rules and the badge says so.

```bash
./run.sh test       # everything: unit tests, the agent's question set, the browser
./run.sh eval       # six questions, one per intent
./run.sh eval all   # all 32, if the key's limits allow it
./run.sh models     # what the configured key can actually call
```

## The script

Nine beats. Press `T` for the guided tour and it runs them in order, or type
the questions yourself. **What should happen** is what to check.

On stage: the tour steps forward on space, right arrow **or Page Down**, so a
presenter clicker drives it and nobody has to stand at the laptop.

### 0. Open it

*What should happen.* The city assembles itself, district by district. Eight
coloured blocks, roads and parkland between them, traffic moving, two red trams
on the raised lines at the back. Top left reads 56 developed, 89 empty lots,
21 markets, €760m.

On a first visit a card offers to show you around. Take it once; after that
press `T`.

### 1. The ground

*What should happen.* Every district sits inside a kerb in its own colour.
Access Radio/Fixed is the biggest block, holding 37 categories; Transmission
Infrastructure holds 10 and is among the smallest. Everything green is parkland
and means nothing.

### 2. Ask for a category

Type **`batteries`**, or **`A221`**, or **`Spring 2/R`**.

*What should happen.* The panel on the right shows three tool calls:
`find_category`, `get_metrics`, `render`. The builder flies across the city and
lands beside the lot. The camera settles. The lot is torn down and rebuilt in
front of you, in order: foundation, floors, houses, roof light. The card on the
right names the category and its four measures.

### 3. Read one lot

*What should happen.* On D504 Batteries: a green foundation, a five-floor
tower, four green houses and a lit roof. On a lot with over €50m, one long red
hotel instead of the houses. On an empty lot, a faint outline of the building
that could stand there and nothing else.

**Hover** any building and it says what it is without you clicking. Click it to
open its title deed, fly there and pin the builder. Click empty ground to
clear.

Start typing a name in the ask box and it offers what those letters already
match, with the lot code beside each one. Arrow down and Enter, or click.

### 4. Where the gaps are

Type **`Where are the biggest gaps?`**

*What should happen.* It flies to A311 Field Maintenance and says 89 empty lots
in Networks, the biggest worth €75m with no blueprint.

### 5. The city we could be

Type **`What could we build?`** or press `P`.

*What should happen.* The light drops, everything already built goes grey, and
32 lots rise in cyan with a beam over each, as a wave across the map. The line
underneath says 12 drafts and 20 lots carrying €176m.

Press `P` again, or ask for anything else, to come back.

### 6. After dark

Type **`Show me AI readiness`** or press `N`.

*What should happen.* Night. Windows light up, street lamps throw pools on
alternate kerbs, and a small number of rooftops carry a column of light. The
line says 28 of 145 categories have started any AI-generated RFP.

### 7. The ask

Type **`What are we asking people to do?`** or press `K`.

*What should happen.* The city dims and four numbered asks take the screen,
signed off "Blueprints today. Smart procurement tomorrow." Click anywhere to
go back.

### 8. Back to the wide view

Press `R`.

*What should happen.* Daylight, the whole city, nothing selected.

## Things worth trying that are not in the script

| Type this | Because |
| --- | --- |
| `how is Energy doing` | Answers for a whole district, not a category that happens to contain the word. |
| `Germany` | Markets resolve too. 21 of them. |
| `which category leads on spend` | Ranking, and it flies to the winner. |
| `banana bread` | It says it cannot find that, rather than guessing. |

## If something looks wrong

- **Nothing renders, black screen.** The browser has no WebGL. Try Chrome.
- **The badge says "local rules, no model".** Expected when the page is opened
  from a file, or when `.env` has no key. Everything still works.
- **The badge says "gemini: NW_API_KEY is not set".** The key is missing from
  `.env`, or `./run.sh` was not restarted after it was added.
- **`run.sh` opened in Notepad or a browser.** You are on Windows. Use
  `run.cmd`.
- **"Python was not found; run without arguments to install from the Microsoft
  Store".** That is the Windows stub, not Python. `winget install
  Python.Python.3.12`, or python.org with "Add python.exe to PATH" ticked.
  Without it, open `renderer/index.html` directly; only the model is missing.
- **Some questions work, then everything fails with 429, 503 or a timeout.**
  You are over the free tier's rate limit: about 5 requests a minute and 20 a
  day. `run.cmd eval` uses six questions so it fits; `run.cmd eval all` needs
  billing, or Vertex AI, or tomorrow. The demo itself is one request per
  question and is nowhere near the limit.
- **Every eval question fails.** Run `run.cmd models`. It makes one small
  request and tells you which of three things it is: a network that cannot
  reach Google, a key that is refused, or a model name that no longer exists.
  A timeout is the network: on a corporate laptop that usually means a proxy
  (`setx HTTPS_PROXY http://your-proxy:port`) or TLS interception
  (`setx SSL_CERT_FILE` pointing at the company root certificate).
- **The badge changes to "model did not answer" after a question.** The service
  is reachable but the model did not reply inside six seconds, so the city used
  its own rules. Everything still works; the badge is telling the truth rather
  than keeping up appearances.
- **`npm.ps1 cannot be loaded ... not digitally signed`.** PowerShell's script
  policy. Use `npm.cmd install playwright`. Optional either way; it only
  enables the browser test.
- **A question resolves to the wrong lot.** Note the question. `./run.sh eval`
  is where a new case gets added so it stays fixed.

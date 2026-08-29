# Running it, and testing it end to end

Two ways to open it, one script to walk it, and a checklist of what should
happen at each step. The script is the same sequence the guided tour runs, so
you can either click **Next** eight times or drive it yourself.

## Opening it

**No installs.** Open `renderer/index.html` in Chrome. The city, the
animations, the builder and the agent all work with no server and no network.
This is the safety net: if the venue wifi dies on the day, this still runs.

**With the model.** From the repository root:

```bash
./run.sh            # or: python3 run.py  (Windows: py run.py)
```

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
./run.sh eval       # just the 32 questions, against whatever .env says
```

## The script

Nine beats. Press `T` for the guided tour and it runs them in order, or type
the questions yourself. **What should happen** is what to check.

### 0. Open it

*What should happen.* The city assembles itself, district by district. Eight
coloured blocks, roads and parkland between them, traffic moving, two red trams
on the raised lines at the back. Top left reads 56 developed, 89 empty lots,
21 markets, €760m.

On a first visit a card offers to show you around. Take it once; after that
press `T`.

### 1. The ground

*What should happen.* Every district sits inside a kerb in its own colour.
Access Radio/Fixed at the back is the biggest block because it holds 37
categories; Transmission Infrastructure holds 10 and is among the smallest.
Everything green is parkland and means nothing.

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

Click any building to inspect it. Click empty ground to clear.

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
- **A question resolves to the wrong lot.** Note the question. `./run.sh eval`
  is where a new case gets added so it stays fixed.

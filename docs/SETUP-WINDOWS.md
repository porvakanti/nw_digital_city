# Setting up a Windows laptop for this project

Written for someone who has done this before and not recently. Nothing here is
specific to being a developer; it is four installs and two settings.

**Before you start, know what you actually need.** Opening
`renderer\index.html` in Chrome gives you the entire city, the animations, the
builder, the guided tour and the agent's own rules, with **nothing installed at
all**. Everything below is only needed to run the agent with a real model
behind it, and to change the code. If you are only showing the thing to people,
you can stop reading.

---

## 1. Python

Python is the language the small service behind the agent is written in. It is
not installed on Windows by default. What Windows ships instead is a stub: type
`python` and it says *"Python was not found; run without arguments to install
from the Microsoft Store"*. That message is the stub talking, not Python.

**Install it.** Open **Terminal** or **PowerShell** and run:

```powershell
winget install Python.Python.3.12
```

`winget` is Windows' own package installer and is on Windows 10 and 11. If your
laptop blocks it, download the installer from
<https://www.python.org/downloads/> instead, and on the **first screen of the
installer tick "Add python.exe to PATH"** before clicking Install. That tick box
is the single most common reason Python appears not to work afterwards.

**Close and reopen your terminal**, then check:

```powershell
py --version
```

You want something like `Python 3.12.x`. `py` is the Python launcher: it is the
reliable way to run Python on Windows, because it does not collide with the
Store stub.

**If it still says Python was not found:** the App Execution Alias is
intercepting. Settings → Apps → Advanced app settings → App execution aliases,
and turn off the two entries called `python.exe` and `python3.exe`.

### What a virtual environment is, and why you will not have to think about it

A virtual environment is a private folder of libraries for one project, so
installing something for this project cannot break another one. `run.cmd`
creates one in `.venv` the first time and uses it every time after. You do not
have to create, activate or remember anything.

---

## 2. Git

Git is how the code moves between your laptop and GitHub. You already cloned
the repository, so you probably have it. Check:

```powershell
git --version
```

If not:

```powershell
winget install Git.Git
```

---

## 3. Node.js, optional

Only needed to run the browser test (`run.cmd test` runs it if it is there and
skips it politely if not). Skip this unless you want the full check.

```powershell
winget install OpenJS.NodeJS.LTS
```

Then, once, in the project folder, **two** commands:

```powershell
npm.cmd install playwright
npx.cmd playwright install chromium
```

The first installs the library, the second downloads a browser for it to
drive. Without the second, the check fails with "Executable doesn't exist".

**Note the `.cmd`.** PowerShell refuses to run `npm` on its own, with a long
message about `npm.ps1` not being digitally signed. That is PowerShell's script
policy, not a problem with your Node install: `npm` on Windows is really three
files, and PowerShell picks the PowerShell one, which is unsigned. `npm.cmd`
picks the batch one, which the policy does not apply to.

If you would rather fix it once and for all, this allows locally-created and
signed-remote scripts for your account only, and does not need an administrator:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Either way, this is optional, but it is the check that catches a broken
renderer: the browser checks load the real page, drive the agent, confirm the
city moved, and do it again on an emulated phone. Nothing else in the suite can see that. Worth the two
minutes if you are going to change anything.

---

## 4. VS Code

```powershell
winget install Microsoft.VisualStudioCode
```

### Opening the project

**File → Open Folder**, and pick the folder that contains `run.cmd`. That is
`C:\path\to\nw_digital_city`. Open the **folder**, not a file. VS
Code works on a folder at a time and most of what follows depends on it knowing
which one.

### The two extensions worth having

Click the Extensions icon in the left bar (four squares) and install:

- **Python** (publisher: Microsoft). Brings syntax highlighting, the
  interpreter picker and the debugger.
- **Pylance** comes with it automatically.

That is enough. You do not need a JavaScript extension; VS Code handles
JavaScript and HTML out of the box.

### Pointing VS Code at the right Python

VS Code needs to know which Python to use, and you want the one in the
project's `.venv`, not the system one.

1. Run `run.cmd` once first, so `.venv` exists.
2. In VS Code press **Ctrl+Shift+P**, type `Python: Select Interpreter`, press
   Enter.
3. Choose the one whose path contains `.venv`. It is usually top of the list
   and labelled *Recommended*.

The bottom-right of the window then shows the version it is using. If you skip
this, the code still runs; you just lose the useful red squiggles.

### The terminal inside VS Code

**Ctrl+`** (the backtick, above Tab) opens a terminal already sitting in the
project folder. That is where you type `run.cmd`. It is the same terminal as
any other, just conveniently placed.

If it opens PowerShell and `run.cmd` misbehaves, type `.\run.cmd` instead:
PowerShell wants the `.\` for a file in the current folder.

---

## 5. The API key

The Google AI Studio key goes in a file called `.env` in the project folder.
`run.cmd` creates it from `.env.example` the first time it runs. Open it in VS
Code and change two lines:

```ini
NW_PROVIDER=gemini
NW_API_KEY=paste-your-key-here
```

Save, then run `run.cmd` again. The badge on the ask bar will name the model
instead of saying "local rules, no model".

**Leave `NW_MODEL` alone unless you have a reason.** Model names get retired:
`gemini-2.0-flash` was the default here until Google shut it down, and the only
symptom was every question returning 404. With `NW_MODEL` unset the code asks
your key what it can actually call and picks a live one. To see that list
yourself:

```powershell
run.cmd models
```

**`.env` is git-ignored on purpose**, so the key stays on your laptop and never
reaches GitHub. Do not move the key into any other file.

---

## The whole thing, start to finish

```powershell
winget install Python.Python.3.12
winget install Microsoft.VisualStudioCode
# close and reopen the terminal
cd C:\path\to\nw_digital_city
run.cmd
```

First run takes a minute or two while it builds the virtual environment. After
that it starts in a couple of seconds and opens your browser at
<http://127.0.0.1:8099/>.

`Ctrl+C` in the terminal stops it.

## The commands, and what they do

| Command | What it does |
| --- | --- |
| `run.cmd` | Starts the city with the agent behind it and opens a browser |
| `run.cmd serve lan` | The same, but reachable from a phone on the same wifi |
| `run.cmd test` | Runs every check: unit tests, the agent's question set, the browser |
| `run.cmd eval` | Asks the model six questions and prints what it decided for each |
| `run.cmd eval all` | All 32, which needs more than a free key's daily allowance |
| `run.cmd models` | Lists the models your key can actually call |
| `run.cmd package` | Writes `NW Digital City.html`, one file safe to email |

## When something does not work

| What you see | What it means |
| --- | --- |
| `run.sh` opens in Notepad or Chrome | Windows does not know what a `.sh` file is. Use `run.cmd`. |
| "Python was not found... Microsoft Store" | Python is not installed, or the Store alias is intercepting. See section 1. |
| The window flashes and disappears | Double-clicked, failed, closed. Run it from a terminal to read the error. |
| `run.cmd : The term is not recognized` | You are in the wrong folder, or PowerShell wants `.\run.cmd`. |
| Badge says "local rules, no model" | No key in `.env`, or it was not restarted after you added one. |
| Port already in use | Something is on 8099. `set NW_PORT=8100` then `run.cmd`. |
| An HTML file will not open on an iPhone | iOS does not let a browser open a file saved on the device, and the Files preview does not run JavaScript. Use `run.cmd serve lan` and open the address it prints. |
| The phone cannot reach `run.cmd serve lan` | Windows Firewall. It asks on the first run; allow it on private networks. Both devices must be on the same wifi, and a guest network usually blocks devices from seeing each other. |
| `npm.ps1 cannot be loaded ... not digitally signed` | PowerShell's script policy. Use `npm.cmd` instead of `npm`, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once. |
| Every eval question returns `404 Not Found` | The model name has been retired by the provider. Run `run.cmd models` to see what your key can call. Clearing `NW_MODEL` in `.env` lets one be chosen for you. |
| 429, 503, or timeouts after a few good answers | The free tier's rate limit: about 5 requests a minute and 20 a day, **per model**. Set `NW_MODEL=gemini-3.5-flash-lite` in `.env` for a fresh allowance, or wait for the reset at midnight Pacific. Usage at <https://aistudio.google.com/apikey>. |
| Every question times out | The network cannot reach Google. `run.cmd models` says which of the three it is. A corporate proxy needs `setx HTTPS_PROXY http://your-proxy:port`, and a proxy that re-signs certificates also needs `setx SSL_CERT_FILE` pointing at the company root certificate. |

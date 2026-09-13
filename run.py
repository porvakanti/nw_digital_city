#!/usr/bin/env python3
"""One command. Everything else is an implementation detail.

    python3 run.py            start the city and open a browser
    python3 run.py serve lan  the same, reachable from a phone on the same wifi
    python3 run.py test       every check there is, one verdict at the end
    python3 run.py eval       six questions against whatever .env says
    python3 run.py eval all   the whole question set, if the key allows it
    python3 run.py build      rebuild city.json from the workbook in data/raw/
    python3 run.py package    one .html file to send, and a zip, both safe
    python3 run.py models     which models the configured key can actually call

Run it from the repository root on your own machine. It makes a virtual
environment in .venv the first time, installs into that, and never touches the
system python. If .env is missing it writes one from .env.example, so the whole
model setup is: put the key in .env, run this.

There is no separate step for the agent. The same service holds the key and
serves the page, so the browser finds the endpoint on its own.
"""

from __future__ import annotations

import filecmp
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENV = ROOT / ".venv"
STAMP = VENV / ".requirements"
# The developer file, which includes the deployed one. The Dockerfile installs
# app/requirements.txt on its own, so nothing test-only reaches the image.
REQUIREMENTS = ROOT / "requirements-dev.txt"
PORT = int(os.environ.get("NW_PORT", "8099"))


def venv_python() -> Path:
    bin_dir = "Scripts" if os.name == "nt" else "bin"
    exe = "python.exe" if os.name == "nt" else "python3"
    return VENV / bin_dir / exe


def ensure_environment() -> Path:
    """A virtual environment with the dependencies in it, made once."""
    python = venv_python()
    if not python.exists():
        print("· creating .venv")
        subprocess.check_call([sys.executable, "-m", "venv", str(VENV)])
        python = venv_python()

    # Reinstall only when the requirements change, so the usual run starts at
    # once. Both files count: requirements-dev.txt includes the deployed one,
    # and comparing only the outer file would miss an edit to the inner one.
    wanted = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (REQUIREMENTS, ROOT / "app" / "requirements.txt")
    )
    fresh = STAMP.exists() and STAMP.read_text(encoding="utf-8") == wanted
    if not fresh:
        print("· installing dependencies")
        subprocess.check_call([str(python), "-m", "pip", "install", "--quiet",
                               "--upgrade", "pip"])
        subprocess.check_call([str(python), "-m", "pip", "install", "--quiet",
                               "-r", str(REQUIREMENTS)])
        STAMP.write_text(wanted, encoding="utf-8")

    settings = ROOT / ".env"
    if not settings.exists():
        shutil.copyfile(ROOT / ".env.example", settings)
        print("· wrote .env from .env.example. Set NW_PROVIDER and NW_API_KEY in")
        print("  it to use a model; without that the city answers with its own rules.")
    return python


def provider() -> str:
    sys.path.insert(0, str(ROOT))
    from app import env  # imported late: .venv only exists after ensure_environment

    env.load()
    name = os.environ.get("NW_PROVIDER", "mock").strip().lower()
    model = os.environ.get("NW_MODEL", "").strip()
    return f"{name} {model}".strip()


def open_when_ready(url: str) -> None:
    """Open the browser once the server answers, rather than racing it."""
    for _ in range(60):
        try:
            with urllib.request.urlopen(f"{url}health", timeout=1):
                webbrowser.open(url)
                return
        except (urllib.error.URLError, OSError):
            time.sleep(0.25)


def lan_address() -> str:
    """This machine's address on the local network, as another device sees it.

    Asked by opening a UDP socket towards a public address and reading back
    which interface the routing table chose. Nothing is sent and nothing needs
    to be reachable; it is the only way to get the right answer on a host
    with a VPN, a docking station and two wifi adapters, where the hostname
    resolves to something no phone can reach.
    """
    import socket

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("10.255.255.255", 1))
            return probe.getsockname()[0]
    except OSError:
        return ""


def serve(python: Path, lan: bool = False) -> int:
    """Serve the city, on this machine only or to the local network.

    Local only by default, because a service that answers the network is a
    decision rather than a convenience. `run.cmd serve lan` is that decision,
    and it is how you open the city on your own phone: iOS will not run a
    downloaded HTML file in a browser, so a URL is the only way in.
    """
    host = "0.0.0.0" if lan else "127.0.0.1"
    url = f"http://127.0.0.1:{PORT}/"
    print(f"\n  NW Digital City   {url}")
    if lan:
        address = lan_address()
        if address:
            print(f"  on this network   http://{address}:{PORT}/")
            print("                    open that on a phone on the same wifi")
        else:
            print("  on this network   could not work out this machine's address;")
            print("                    `ipconfig` will show it")
        print("\n  Anyone on this network can now reach it. Stop it when you")
        print("  are done, and do not do this on a network you do not trust.")
    print(f"  agent             {provider()}")
    print("\n  ctrl-c to stop\n")
    threading.Thread(target=open_when_ready, args=(url,), daemon=True).start()
    try:
        return subprocess.call([str(python), "-m", "uvicorn", "app.server:app",
                                "--host", host, "--port", str(PORT)], cwd=ROOT)
    except KeyboardInterrupt:
        return 0


def models(python: Path) -> int:
    """Ask the provider what it has, rather than trusting a name in a file."""
    return subprocess.call([str(python), "-m", "app.models"], cwd=ROOT)


def single_file() -> Path:
    """Fold the whole city into one .html file that opens on its own.

    index.html is a shell. It pulls in a 3D library, the city data, the
    renderer and the agent as four separate files, so on its own it is a blank
    page, and the honest way to send it has been a zip: unzip, find the folder,
    find index.html, open that one. Four steps and a decision, for somebody who
    only wanted to look at it.

    So the scripts get inlined and it becomes one file you double-click. Same
    code, same data, no network, nothing to install. Larger, because the
    library is in it, and a necessary trade: the distributed artefact should be
    the artefact that opens.
    """
    renderer = ROOT / "renderer"
    html = (renderer / "index.html").read_text(encoding="utf-8")

    for name in ("vendor/three.min.js", "city-data.js", "city.js", "agent.js"):
        tag = f'<script src="{name}"></script>'
        if tag not in html:
            print(f"cannot inline {name}: {tag} is not in index.html", file=sys.stderr)
            raise SystemExit(1)
        code = (renderer / name).read_text(encoding="utf-8")
        # A literal </script> anywhere inside would close the tag early and
        # spill the rest of the file onto the page as text. Nothing here has
        # one today; a file that grows one later should not silently break.
        code = code.replace("</script>", "<\\/script>")
        html = html.replace(tag, f"<script>\n{code}\n</script>")

    out = ROOT / "NW Digital City.html"
    out.write_text(html, encoding="utf-8")
    return out


def package() -> int:
    """Two things to send: one file to open, and a zip of the folder.

    Both are assembled from renderer/ alone, never from the repository root.
    data/raw holds the source workbook with blueprint owner names and email
    addresses in it, and the surest way that never reaches anyone is for the
    thing you send to be built from one folder that has never held it. The
    single file goes further and names each part it inlines.
    """
    import zipfile

    out = ROOT / "nw-digital-city.zip"
    renderer = ROOT / "renderer"
    files = sorted(f for f in renderer.rglob("*") if f.is_file())
    if not files:
        print("nothing to package: renderer/ is empty", file=sys.stderr)
        return 1

    readme = (
        "NW Digital City\n"
        "===============\n\n"
        "Open index.html in Chrome. Nothing to install, no network needed.\n\n"
        "Press T for a two-minute guided tour, or type a category code, a\n"
        "category name, a district or a question into the box at the bottom.\n\n"
        "R resets the view, N is night, P is what we could build, K is the ask.\n\n"
        "The figures are an anonymised extract: no names, no contacts.\n"
    )

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in files:
            bundle.write(path, Path("nw-digital-city") / path.relative_to(renderer))
        bundle.writestr("nw-digital-city/READ ME FIRST.txt", readme)

    size = out.stat().st_size / 1e6
    print(f"· wrote {out.name} ({size:.1f} MB, {len(files) + 1} files)")

    one = single_file()
    print(f"· wrote {one.name} ({one.stat().st_size / 1e6:.1f} MB, opens on its own)")

    # Check the thing that is about to be emailed, not the folder it came from.
    # Inlining is a text substitution and text substitutions go wrong quietly:
    # a broken single file looks exactly like a working one until somebody
    # opens it, and by then it is in their inbox.
    if browsers_available():
        print("· checking it opens and answers a question")
        if subprocess.call(["node", "tests/smoke.js"], cwd=ROOT,
                           env=dict(os.environ, NW_SMOKE_URL=one.as_uri())):
            print("\n  The packaged file did not pass. Do not send it.", file=sys.stderr)
            return 1
    else:
        print("· cannot check it here: node and playwright are not installed.")
        print("  Open it yourself before sending it.")
    print()
    print("  Send the single file. It is the one somebody can double-click.")
    print("  The zip is the same city as separate files, for anyone who wants")
    print("  to look at how it works.")
    print("  Neither contains the workbook in data/raw.")
    return 0


def free_port() -> int:
    """A port nothing else is on, so a running `run.py serve` is not disturbed."""
    import socket

    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def browser_against_service(python: Path) -> int:
    """Start the service the way the container does, and drive it in a browser.

    Deliberately NW_PROVIDER=mock: this is checking that the served page finds
    its own endpoint, gets a plan back and acts on it, and none of that should
    depend on a credential, a network or a model's availability.
    """
    port = free_port()
    url = f"http://127.0.0.1:{port}"
    environment = dict(os.environ, NW_PROVIDER="mock")
    for key in ("NW_API_KEY", "NW_MODEL", "NW_MODELS", "NW_PROJECT"):
        environment.pop(key, None)

    print(f"\n· starting the service on {port} to check the deployed path")
    service = subprocess.Popen(
        [str(python), "-m", "uvicorn", "app.server:app",
         "--host", "127.0.0.1", "--port", str(port)],
        cwd=ROOT, env=environment,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(80):
            if service.poll() is not None:
                print("  the service stopped before it answered")
                return 1
            try:
                urllib.request.urlopen(f"{url}/health", timeout=1).read()
                break
            except (urllib.error.URLError, OSError):
                time.sleep(0.25)
        else:
            print("  the service never came up")
            return 1
        return subprocess.call(["node", "tests/smoke.js"], cwd=ROOT,
                               env=dict(environment, NW_SMOKE_URL=url))
    finally:
        service.terminate()
        try:
            service.wait(timeout=10)
        except subprocess.TimeoutExpired:  # pragma: no cover - a stuck server
            service.kill()


def browsers_available() -> bool:
    """Whether the browser stages can run at all on this machine."""
    return bool(shutil.which("node")) and (ROOT / "node_modules" / "playwright").is_dir()


def how_to_install_playwright() -> None:
    print("  To enable the browser stages, once:")
    print()
    if os.name == "nt":
        print("    npm.cmd install playwright")
        print("    npx.cmd playwright install chromium")
        print()
        print("  The .cmd matters: PowerShell refuses the unsigned npm wrapper.")
    else:
        print("    npm install playwright")
        print("    npx playwright install chromium")
    print()
    print("  Two commands because the first installs the library and the second")
    print("  downloads a browser for it to drive. Required once: these are")
    print("  the stages that catch a broken renderer, which nothing else sees.")


def browser_against_file(python: Path) -> int:
    """Drive renderer/index.html from disk, the way a reviewer opens it.

    file:// is the strictest environment the city runs in: no modules, no
    fetch, no endpoint. If it works here it works everywhere, and the agent
    falls back to its own rules rather than asking for a plan.
    """
    return subprocess.call(["node", "tests/smoke.js"], cwd=ROOT)


def browser_against_package(python: Path) -> int:
    """Build the single file and drive that, because that is what gets sent.

    Inlining is a text substitution, and text substitutions go wrong quietly:
    a broken single file looks exactly like a working one until somebody opens
    it, and by then it is in their inbox.
    """
    one = single_file()
    print(f"  built {one.name} ({one.stat().st_size / 1e6:.1f} MB)")
    return subprocess.call(["node", "tests/smoke.js"], cwd=ROOT,
                           env=dict(os.environ, NW_SMOKE_URL=one.as_uri()))


# Every stage, in the order it runs, with what a failure in it would mean.
# Ordered cheapest first so a broken build is reported in under a second
# rather than after two minutes of browser work.
STAGES = [
    ("data and privacy",
     "every assertion over city.json, the figures the documents quote, the"
     " plan parser, the model ladder and the service, security suite included",
     lambda python: subprocess.call(
         [str(python), "-m", "unittest", "discover", "-s", "tests"], cwd=ROOT)),
    ("the agent's question set",
     "the questions from the stage script, end to end, against whatever .env"
     " names",
     lambda python: subprocess.call([str(python), "-m", "app.eval"], cwd=ROOT)),
    ("the renderer from a file",
     "the city opens, draws, answers and stays reachable on a phone screen",
     browser_against_file, True),
    ("the renderer against the service",
     "the served page finds its own endpoint, gets a plan and acts on it",
     browser_against_service, True),
    ("the file we send",
     "the inlined single file opens on its own and does all of the above",
     browser_against_package, True),
]


def check(python: Path) -> int:
    """Every check there is, in one command, with one verdict at the end.

    Each stage prints its own summary, and five summaries scrolling past is
    exactly how a failure in the middle gets missed. So every stage is named
    before it runs and listed again at the bottom with its result.
    """
    browsers = browsers_available()
    results = []

    for number, stage in enumerate(STAGES, start=1):
        name, what, run = stage[0], stage[1], stage[2]
        needs_browser = len(stage) > 3

        print()
        print(f"── {number}/{len(STAGES)}  {name}")
        print(f"   {what}")
        print()

        if needs_browser and not browsers:
            print("   skipped: node and playwright are not installed")
            results.append((name, "skipped"))
            continue
        results.append((name, "failed" if run(python) else "passed"))

    print()
    print("─" * 70)
    width = max(len(name) for name, _ in results)
    for name, outcome in results:
        mark = {"passed": "ok", "failed": "FAILED", "skipped": "--"}[outcome]
        print(f"  {name.ljust(width)}   {mark}")
    print("─" * 70)
    print()

    failed = [name for name, outcome in results if outcome == "failed"]
    skipped = [name for name, outcome in results if outcome == "skipped"]

    if failed:
        print(f"FAILED: {', '.join(failed)}")
        print()
        print("  Scroll up to the stage that failed. Each one prints the")
        print("  assertion that broke and the value it saw.")
        return 1

    if skipped:
        print(f"Everything that could run passed. {len(skipped)} stages skipped.")
        print()
        how_to_install_playwright()
        return 0

    print("Everything passed. The city draws, answers, holds its numbers,")
    print("keeps names and keys out of what it publishes, and the file you")
    print("would send does all of it on its own.")
    return 0


def main() -> int:
    command = sys.argv[1] if len(sys.argv) > 1 else "serve"
    if command not in ("serve", "test", "verify", "eval", "build", "package",
                       "models"):
        print("usage: python3 run.py "
              "[serve|test|eval|build|package|models]", file=sys.stderr)
        return 2

    # Packaging is pure standard library, so it should not make anyone wait for
    # a virtual environment they are not going to use.
    if command == "package":
        return package()

    python = ensure_environment()
    if command == "build":
        return subprocess.call([str(python), "data/build_city.py"], cwd=ROOT)
    if command == "eval":
        return subprocess.call([str(python), "-m", "app.eval", *sys.argv[2:]], cwd=ROOT)
    if command == "models":
        return models(python)
    if command in ("test", "verify"):
        return check(python)
    return serve(python, lan="lan" in sys.argv[2:])


if __name__ == "__main__":
    raise SystemExit(main())

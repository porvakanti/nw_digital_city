#!/usr/bin/env python3
"""One command. Everything else is an implementation detail.

    python3 run.py            start the city and open a browser
    python3 run.py test       every check: python tests, eval set, browser smoke
    python3 run.py eval       six questions against whatever .env says
    python3 run.py eval all   all 32, if the key's limits allow it
    python3 run.py build      rebuild city.json from the workbook in data/raw/
    python3 run.py package    a zip of just the city, safe to send to anyone
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


def serve(python: Path) -> int:
    url = f"http://127.0.0.1:{PORT}/"
    print(f"\n  NW Digital City   {url}")
    print(f"  agent             {provider()}")
    print("\n  ctrl-c to stop\n")
    threading.Thread(target=open_when_ready, args=(url,), daemon=True).start()
    try:
        return subprocess.call([str(python), "-m", "uvicorn", "app.server:app",
                                "--host", "127.0.0.1", "--port", str(PORT)], cwd=ROOT)
    except KeyboardInterrupt:
        return 0


def models(python: Path) -> int:
    """Ask the provider what it has, rather than trusting a name in a file."""
    return subprocess.call([str(python), "-m", "app.models"], cwd=ROOT)


def package() -> int:
    """Zip up the parts someone needs to open the city, and nothing else.

    Deliberately narrow. data/raw holds the source workbook with blueprint
    owner names and email addresses in it, and the surest way that never
    reaches anyone is for the thing you send to be built from a list of files
    rather than from a folder.
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
    print("  It contains the renderer only. The workbook in data/raw is not in it.")
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
    depend on a key, a network or a model's mood on the day.
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


def check(python: Path) -> int:
    """Run everything, and say plainly at the end whether it all passed.

    Each part prints its own summary, and three summaries scrolling past is
    exactly how a failure in the middle gets missed. So there is one verdict at
    the bottom naming what failed.
    """
    failed = []
    if subprocess.call([str(python), "-m", "unittest", "discover", "-s", "tests"],
                       cwd=ROOT):
        failed.append("python tests")
    if subprocess.call([str(python), "-m", "app.eval"], cwd=ROOT):
        failed.append("the agent's question set")

    if shutil.which("node") and (ROOT / "node_modules" / "playwright").is_dir():
        if subprocess.call(["node", "tests/smoke.js"], cwd=ROOT):
            failed.append("the browser smoke test")
        # And again against the service, because that is what gets deployed
        # and it is a different path through the agent: served, it asks for a
        # plan and acts on the answer; from a file it never can. Everything
        # above this line was testing the fallback.
        if browser_against_service(python):
            failed.append("the browser smoke test against the service")
    else:
        print("· skipping the browser smoke test. To enable it, once:")
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
        print("  Two commands because the first installs the library and the")
        print("  second downloads a browser for it to drive. Worth doing once:")
        print("  it is the check that catches a broken renderer, which nothing")
        print("  else here can see.")

    print()
    if failed:
        print(f"FAILED: {', '.join(failed)}")
        return 1
    print("Everything passed.")
    return 0


def main() -> int:
    command = sys.argv[1] if len(sys.argv) > 1 else "serve"
    if command not in ("serve", "test", "eval", "build", "package", "models"):
        print("usage: python3 run.py [serve|test|eval|build|package|models]",
              file=sys.stderr)
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
    if command == "test":
        return check(python)
    return serve(python)


if __name__ == "__main__":
    raise SystemExit(main())

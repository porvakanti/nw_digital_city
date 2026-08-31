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
REQUIREMENTS = ROOT / "app" / "requirements.txt"
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

    # Reinstall only when the requirements change, so the usual run starts at once.
    fresh = STAMP.exists() and filecmp.cmp(REQUIREMENTS, STAMP, shallow=False)
    if not fresh:
        print("· installing dependencies")
        subprocess.check_call([str(python), "-m", "pip", "install", "--quiet",
                               "--upgrade", "pip"])
        subprocess.check_call([str(python), "-m", "pip", "install", "--quiet",
                               "-r", str(REQUIREMENTS)])
        shutil.copyfile(REQUIREMENTS, STAMP)

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


def check(python: Path) -> int:
    failures = 0
    failures += subprocess.call([str(python), "-m", "unittest", "discover",
                                 "-s", "tests"], cwd=ROOT)
    failures += subprocess.call([str(python), "-m", "app.eval"], cwd=ROOT)
    if shutil.which("node") and (ROOT / "node_modules" / "playwright").is_dir():
        failures += subprocess.call(["node", "tests/smoke.js"], cwd=ROOT)
    else:
        print("· skipping the browser smoke test")
        print("  To enable it: npm install playwright (on Windows, npm.cmd install")
        print("  playwright, because PowerShell blocks the unsigned npm wrapper)")
    return 1 if failures else 0


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

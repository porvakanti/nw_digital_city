#!/usr/bin/env python3
"""One command. Everything else is an implementation detail.

    python3 run.py            start the city and open a browser
    python3 run.py test       every check: python tests, eval set, browser smoke
    python3 run.py eval       the agent's question set against whatever .env says
    python3 run.py build      rebuild city.json from the workbook in data/raw/

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


def check(python: Path) -> int:
    failures = 0
    failures += subprocess.call([str(python), "-m", "unittest", "discover",
                                 "-s", "tests"], cwd=ROOT)
    failures += subprocess.call([str(python), "-m", "app.eval"], cwd=ROOT)
    if shutil.which("node") and (ROOT / "node_modules" / "playwright").is_dir():
        failures += subprocess.call(["node", "tests/smoke.js"], cwd=ROOT)
    else:
        print("· skipping the browser smoke test (npm i playwright to enable it)")
    return 1 if failures else 0


def main() -> int:
    command = sys.argv[1] if len(sys.argv) > 1 else "serve"
    if command not in ("serve", "test", "eval", "build"):
        print("usage: python3 run.py [serve|test|eval|build]", file=sys.stderr)
        return 2

    python = ensure_environment()
    if command == "build":
        return subprocess.call([str(python), "data/build_city.py"], cwd=ROOT)
    if command == "eval":
        return subprocess.call([str(python), "-m", "app.eval"], cwd=ROOT)
    if command == "test":
        return check(python)
    return serve(python)


if __name__ == "__main__":
    raise SystemExit(main())

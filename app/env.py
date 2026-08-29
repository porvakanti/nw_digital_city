"""Read .env without a dependency.

The person running this should not have to remember `set -a; . ./.env; set +a`
before starting anything. The file sits next to the code, the code reads it,
and a value already in the environment always wins so a container's real
settings are never overwritten by a leftover local file.
"""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(path: Path | None = None) -> dict[str, str]:
    """Load KEY=value lines from .env into the environment. Returns what it set."""
    target = path or ROOT / ".env"
    applied: dict[str, str] = {}
    if not target.exists():
        return applied
    for line in target.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if not key or key in os.environ:
            continue
        os.environ[key] = value
        applied[key] = value
    return applied

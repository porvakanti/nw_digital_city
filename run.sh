#!/usr/bin/env bash
# Thin wrapper so ./run.sh and `python3 run.py` are the same thing. The work
# lives in run.py, which also runs on Windows where there is no bash.
set -euo pipefail
cd "$(dirname "$0")"
exec py run.py "$@"

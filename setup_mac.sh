#!/usr/bin/env bash
# PixelProof one-time setup for macOS/Linux:  ./setup_mac.sh
# Creates .venv, installs the upstream pins + API layer, installs and builds the UI.
set -euo pipefail
cd "$(dirname "$0")"
PY="${PYTHON:-$(command -v python3.13 || command -v python3.12 || command -v python3)}"
echo "Python: $("$PY" --version)"
[ -x .venv/bin/python ] || "$PY" -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt -r backend/requirements-api.txt
command -v npm >/dev/null || { echo "Node.js/npm not found. Install Node 20+."; exit 1; }
(cd frontend && npm ci --no-audit --no-fund && npm run build)
echo
echo "Setup complete. Start with: ./start_mac.sh  (then open http://127.0.0.1:8000)"

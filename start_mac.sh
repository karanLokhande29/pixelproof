#!/usr/bin/env bash
# PixelProof: one server on http://127.0.0.1:8000 (FastAPI API + built React UI).
set -euo pipefail
cd "$(dirname "$0")"
[ -x .venv/bin/python ] || { echo "Run ./setup_mac.sh first."; exit 1; }
[ -f frontend/dist/index.html ] || (cd frontend && npm run build)
echo "PixelProof  ->  http://127.0.0.1:8000   (API docs: http://127.0.0.1:8000/docs)   Ctrl+C to stop"
exec .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000

#!/usr/bin/env bash
# Spooky AI Ghost Riddle Booth — one-command launcher.
# Starts the Python backend and the React frontend together.
# Press Ctrl+C to stop both.

set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-dev}"   # dev = hot-reload | kiosk = serve the built frontend

# --- Backend ---
if [ ! -d backend/.venv ]; then
  echo "👻 Creating Python virtual environment..."
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install --upgrade pip
  backend/.venv/bin/pip install -r backend/requirements.txt
fi

echo "👻 Starting backend on http://localhost:8000 ..."
( cd backend && .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000 ) &
BACK=$!

cleanup() { echo; echo "Stopping..."; kill "$BACK" 2>/dev/null || true; kill "$FRONT" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# --- Frontend ---
echo "🎃 Checking frontend dependencies..."
( cd frontend && npm install --prefer-offline --no-audit --no-fund )

if [ "$MODE" = "kiosk" ]; then
  echo "🎃 Building + serving frontend on http://localhost:4173 ..."
  ( cd frontend && npm run build && npm run preview ) &
  FRONT=$!
  URL="http://localhost:4173"
else
  echo "🎃 Starting frontend (dev) on http://localhost:5173 ..."
  ( cd frontend && npm run dev ) &
  FRONT=$!
  URL="http://localhost:5173"
fi

echo
echo "✅ Ready! Open $URL"
echo "   (On carnival day, open that in Chrome fullscreen — see README.)"
wait

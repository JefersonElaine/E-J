#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
export NODE_ENV="${NODE_ENV:-development}"
export PORT="${PORT:-3001}"
export DATA_DIR="${DATA_DIR:-$ROOT/data}"
export SESSION_SECRET="${SESSION_SECRET:-dev-session-secret-elaine-jeferson-2026}"
export SETUP_TOKEN="${SETUP_TOKEN:-dev-setup-token-elaine-jeferson}"
export PUBLIC_URL="${PUBLIC_URL:-http://localhost:5173}"

if [ ! -d "$ROOT/backend/node_modules" ]; then
  npm --prefix "$ROOT/backend" install
fi
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  npm --prefix "$ROOT/frontend" install
fi

npm --prefix "$ROOT/backend" run dev &
BACKEND_PID=$!

trap 'kill $BACKEND_PID 2>/dev/null || true' EXIT

npm --prefix "$ROOT/frontend" run dev

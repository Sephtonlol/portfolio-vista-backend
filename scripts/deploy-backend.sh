#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_NAME="alexanderwu-backend"

cd "$BACKEND_ROOT"

echo "[deploy-backend] Backend root: $BACKEND_ROOT"

INSTALL=false
SKIP_RESTART=false
for arg in "$@"; do
  case "$arg" in
    --install) INSTALL=true ;;
    --skip-restart) SKIP_RESTART=true ;;
    -h|--help)
      cat <<EOF
Usage: scripts/deploy-backend.sh [--install] [--skip-restart]

Builds the backend (TypeScript -> ./dist) and restarts the PM2 process.

Options:
  --install       Run npm ci before building (recommended on fresh servers)
  --skip-restart  Only build; do not touch PM2

Notes:
  - PM2 process name defaults to: ${APP_NAME}
  - Expects .env at: ${BACKEND_ROOT}/.env
EOF
      exit 0
      ;;
    *)
      echo "[deploy-backend] ERROR: Unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

if [[ ! -f package.json ]]; then
  echo "[deploy-backend] ERROR: package.json not found in $BACKEND_ROOT" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "[deploy-backend] ERROR: .env not found at $BACKEND_ROOT/.env" >&2
  echo "[deploy-backend] Create it with CONNECTION_STRING, DB_NAME, APP_BASE_URL, APP_PORT" >&2
  exit 1
fi

if [[ "$INSTALL" == "true" || ! -d node_modules ]]; then
  echo "[deploy-backend] Installing dependencies (npm ci)…"
  npm ci
fi

echo "[deploy-backend] Building (npm run build)…"
npm run build

if [[ "$SKIP_RESTART" == "true" ]]; then
  echo "[deploy-backend] Done (build only)."
  exit 0
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[deploy-backend] ERROR: pm2 is not installed or not on PATH" >&2
  exit 1
fi

# If process exists -> restart. Otherwise -> start.
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  echo "[deploy-backend] Restarting PM2 process $APP_NAME (with --update-env)…"
  pm2 restart "$APP_NAME" --update-env
else
  echo "[deploy-backend] Starting PM2 process $APP_NAME…"
  pm2 start "$BACKEND_ROOT/dist/app.js" --name "$APP_NAME" --cwd "$BACKEND_ROOT"
fi

echo "[deploy-backend] Status:"
pm2 status "$APP_NAME"
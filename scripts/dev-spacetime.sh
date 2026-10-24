#!/usr/bin/env bash
# Start a local SpacetimeDB on :3000 and publish the Pitch Fight module to it.
# Usage: scripts/dev-spacetime.sh [--reset]   (--reset wipes the database)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${STDB_DATA_DIR:-$HOME/.pitch-fight-stdb}"
DB_NAME="${SPACETIMEDB_DB_NAME:-pitch-fight}"

if ! curl -sf -o /dev/null http://127.0.0.1:3000/v1/ping; then
  mkdir -p "$DATA_DIR"
  nohup spacetime start --listen-addr 0.0.0.0:3000 --data-dir "$DATA_DIR" --non-interactive > "$DATA_DIR/server.log" 2>&1 &
  for _ in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:3000/v1/ping && break; sleep 1; done
fi
echo "SpacetimeDB is up on :3000 (log: $DATA_DIR/server.log)"

EXTRA=()
[[ "${1:-}" == "--reset" ]] && EXTRA+=(--delete-data)
spacetime publish "$DB_NAME" --module-path "$ROOT/spacetime" --server local --yes "${EXTRA[@]}"

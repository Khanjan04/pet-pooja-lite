#!/usr/bin/env bash
# Rebuild and (re)start the production server on a port, stopping whatever holds it.
set -euo pipefail
PORT="${1:-3123}"
fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
npm run build 2>&1 | grep -E 'rror|✓ Compiled' || true
nohup npx next start -p "$PORT" > "${TMPDIR:-/tmp}/next-${PORT}.log" 2>&1 &
for _ in $(seq 1 40); do curl -s -o /dev/null "localhost:${PORT}/" && exit 0; sleep 1; done
echo "server did not start"; exit 1

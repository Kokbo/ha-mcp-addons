#!/bin/sh
set -eu

PORT=$(node -e "process.stdout.write(String(require('/data/options.json').port || 3001))")
PATHS=$(node -e "process.stdout.write((require('/data/options.json').allowed_paths || ['/config']).join(' '))")

exec /app/node_modules/.bin/supergateway \
  --port "${PORT}" \
  --stdio "/app/node_modules/.bin/mcp-server-filesystem ${PATHS}"

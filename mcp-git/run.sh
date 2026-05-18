#!/bin/sh
set -eu

exec env MCP_TRANSPORT=streamableHttp node /app/src/server.js

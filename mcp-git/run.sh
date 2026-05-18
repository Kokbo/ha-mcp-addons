#!/bin/sh
set -eu

exec env MCP_TRANSPORT=streamableHttp MCP_STATEFUL=true node /app/src/server.js --stateful

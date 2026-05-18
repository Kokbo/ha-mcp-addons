#!/bin/sh
set -eu

exec env MCP_TRANSPORT=streamableHttp MCP_STATEFUL=true python3 /app/src/server.py --stateful

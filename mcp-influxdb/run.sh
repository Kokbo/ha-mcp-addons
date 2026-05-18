#!/bin/sh
set -eu

exec env MCP_TRANSPORT=streamableHttp python3 /app/src/server.py

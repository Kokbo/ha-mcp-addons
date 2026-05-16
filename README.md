# Home Assistant MCP Addons

Four [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server addons for Home Assistant, extending the capabilities of [ha-mcp](https://github.com/home-assistant-libs/ha-mcp) with filesystem, git, Node-RED, and InfluxDB access.

Each addon runs as an **HTTP/SSE MCP server** consumable by Open WebUI (or any MCP-compatible client) running on the same host via `http://localhost:<port>`.

## Installation

1. Go to **Settings → Add-ons → Add-on Store**
2. Click the three-dot menu → **Repositories**
3. Add `https://github.com/Kokbo/ha-mcp-addons`
4. Install individual addons as needed

## Addons

| Addon | Port | Purpose |
|-------|------|---------|
| [mcp-filesystem](./mcp-filesystem/) | 3001 | Read/write arbitrary files under `/config` |
| [mcp-git](./mcp-git/) | 3002 | Git operations (status, diff, add, commit, push, log) |
| [mcp-node-red](./mcp-node-red/) | 3003 | Node-RED flow management via HTTP API |
| [mcp-influxdb](./mcp-influxdb/) | 3004 | InfluxDB 1.8.x queries via raw HTTP API |

## Open WebUI Connection

Add each addon as an MCP tool server in Open WebUI:

```
http://localhost:3001/sse   # mcp-filesystem
http://localhost:3002/sse   # mcp-git
http://localhost:3003/sse   # mcp-node-red
http://localhost:3004/sse   # mcp-influxdb
```

## Architecture

These addons fill the gaps left by `ha-mcp`:

- **ha-mcp** handles: HA API, config check/reload, states, services, automations, dashboards, entity registry
- **These addons** handle: arbitrary file I/O, git operations, Node-RED flows, InfluxDB time-series data

All addons are independently installable and target **aarch64** (Home Assistant Yellow / CM4).

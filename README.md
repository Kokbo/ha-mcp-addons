# Home Assistant MCP Addons

Four [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server addons for Home Assistant, extending the capabilities of [ha-mcp](https://github.com/home-assistant-libs/ha-mcp) with filesystem, git, Node-RED, and InfluxDB access.

Each addon runs as a **Streamable HTTP MCP server** consumable by Open WebUI (or any MCP-compatible client) running on the same host via `http://localhost:<port>/mcp`.

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
http://localhost:3001/mcp   # mcp-filesystem
http://localhost:3002/mcp   # mcp-git
http://localhost:3003/mcp   # mcp-node-red
http://localhost:3004/mcp   # mcp-influxdb
```

### Open WebUI setup (read this before you spend an afternoon debugging)

In Open WebUI → **Settings → Tools → Add Tool Server**, configure each addon as follows. The defaults are subtly wrong in ways that look like they work but silently break:

| Field | Value | Why |
|-------|-------|-----|
| **Type** | `MCP (Streamable HTTP)` | These addons speak the MCP Streamable HTTP transport, **not** OpenAPI / not the legacy MCP SSE transport. |
| **URL** | `http://localhost:<port>/mcp` (e.g. `http://localhost:3001/mcp`) | All four addons use `host_network: true`, so they're reachable on the host's `localhost`. The `/mcp` suffix is required. |
| **Auth** | `None` | **Important.** Do not pick `Bearer` and leave the key blank — Open WebUI sends `Authorization: Bearer ` (empty token) to the addon. The MCP `Verify Connection` button still succeeds in that state, but actual `tools/call` requests silently fail. This is a known Open WebUI bug (see [discussion #19821](https://github.com/open-webui/open-webui/discussions/19821) / [issue #19813](https://github.com/open-webui/open-webui/issues/19813)). Always pick `None` unless you're actually putting a token in. |
| **Function Name Filter List** | a single comma `,` (or any non-empty value) | Open WebUI treats an empty filter list as "expose nothing", not "expose everything". A bare `,` is enough to satisfy the parser and expose all tools. Without it the tool server shows as connected but no functions appear to the LLM. |

#### Filesystem paths

`mcp-filesystem` mounts the Home Assistant config directory at **`/config` inside the container**. When you prompt the model, refer to files as `/config/configuration.yaml`, **not** `/homeassistant/configuration.yaml`. The host path (`/homeassistant`, `/usr/share/hassio/homeassistant`, etc.) is invisible to the addon — only the in-container `/config` view exists.

## Architecture

These addons fill the gaps left by `ha-mcp`:

- **ha-mcp** handles: HA API, config check/reload, states, services, automations, dashboards, entity registry
- **These addons** handle: arbitrary file I/O, git operations, Node-RED flows, InfluxDB time-series data

All addons are independently installable and target **aarch64** (Home Assistant Yellow / CM4).

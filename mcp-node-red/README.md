# MCP Node-RED Server

Home Assistant addon for managing Node-RED flows via a Streamable HTTP MCP server.

## What it does

Custom MCP server that calls the Node-RED admin HTTP API and exposes flow management as MCP tools, served over **MCP Streamable HTTP** directly — no `supergateway`, no stdio bridge. The server uses `@modelcontextprotocol/sdk`'s native `StreamableHTTPServerTransport` mounted on an Express HTTP server at `/mcp`. It only advertises the `tools` server capability, so it never issues `roots/list` requests to the client.

**Available MCP tools:**

| Tool | Description |
|------|-------------|
| `list_flows` | List all flow tabs (id, label, type, disabled) |
| `get_flow(id)` | Get full JSON for a specific flow tab |
| `update_flow(id, flow_json)` | Replace a flow tab with new JSON |
| `deploy(type)` | Deploy flows (`full`, `nodes`, or `flows`) |
| `inject_node(node_id)` | Trigger an inject node |
| `get_nodes` | List all installed node types |

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `port` | `3003` | HTTP port for the MCP server |
| `node_red_url` | `http://localhost:1880` | Node-RED admin API base URL |
| `node_red_user` | `""` | Node-RED username (leave empty if auth disabled) |
| `node_red_password` | `""` | Node-RED password (leave empty if auth disabled) |

## Authentication

If `node_red_user` and `node_red_password` are set, the server obtains a bearer token via `POST /auth/token` and includes it in all subsequent requests. Leave both empty if Node-RED authentication is disabled (the default).

## Open WebUI connection

```
http://localhost:3003/mcp
```

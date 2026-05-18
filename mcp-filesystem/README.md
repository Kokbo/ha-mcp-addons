# MCP Filesystem Server

Home Assistant addon exposing read/write access to `/config` via a Streamable HTTP MCP server.

## What it does

Runs the official `@modelcontextprotocol/server-filesystem` (^2026.1.14) package and exposes it directly over **MCP Streamable HTTP** on `/mcp` — no `supergateway`, no stdio bridge on the wire. A small in-process Node.js proxy forwards `tools/list` and `tools/call` between the HTTP transport and the upstream filesystem server, and explicitly avoids advertising the `roots` client capability so the upstream server never issues `roots/list` requests.

**Available MCP tools** (provided by `server-filesystem` 2026.1.14):

| Tool | Notes |
|------|-------|
| `read_text_file` | Read a text file (`head`/`tail` supported) |
| `read_media_file` | Read an image/audio file as base64 |
| `read_multiple_files` | Read multiple files in one call |
| `write_file` | Create/overwrite a file |
| `edit_file` | Apply line-based edits with optional `dryRun` |
| `create_directory` | Create directory (recursive) |
| `list_directory` | List directory entries |
| `list_directory_with_sizes` | List with sizes, sortable |
| `directory_tree` | Recursive JSON tree |
| `move_file` | Move/rename a file or directory |
| `search_files` | Glob-style recursive search |
| `get_file_info` | File metadata |
| `list_allowed_directories` | Show the configured roots |

The legacy `read_file` tool is also exposed (deprecated alias for `read_text_file`).

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `port` | `3001` | HTTP port for the MCP server |
| `allowed_paths` | `["/config"]` | Filesystem paths the server may access |

## Open WebUI connection

```
http://localhost:3001/mcp
```

The endpoint speaks **MCP Streamable HTTP** and accepts `Accept: application/json, text/event-stream` per the MCP spec. The server only advertises the `tools` capability; it never requests `roots/list` from the client, so it works with clients that don't implement the MCP roots protocol (e.g. Open WebUI 0.9.2).

## Notes

- `/config` is mounted read/write from the HA config directory.
- Additional paths can be added to `allowed_paths`, but they must exist inside the container.

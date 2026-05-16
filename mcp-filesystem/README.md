# MCP Filesystem Server

Home Assistant addon exposing read/write access to `/config` via an HTTP/SSE MCP server.

## What it does

Wraps the official `@modelcontextprotocol/server-filesystem` package and bridges it from stdio to HTTP/SSE using `supergateway`, so Open WebUI can connect to it directly.

**Available MCP tools** (provided by server-filesystem):
- `read_file` — read a file's contents
- `write_file` — write content to a file
- `list_directory` — list directory contents
- `create_directory` — create a directory
- `delete_file` — delete a file
- `move_file` — move or rename a file
- `search_files` — search for files by pattern
- `get_file_info` — get file metadata

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `port` | `3001` | HTTP port for the MCP server |
| `allowed_paths` | `["/config"]` | List of filesystem paths the server may access |

## Open WebUI connection

```
http://localhost:3001/sse
```

## Notes

- `/config` is mounted read/write from the HA config directory
- Additional paths can be added to `allowed_paths`, but they must exist inside the container

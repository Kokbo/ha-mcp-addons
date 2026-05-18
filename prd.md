You are building a GitHub repository containing four Home Assistant addons, each implementing an MCP (Model Context Protocol) server. The repository will be added to Home Assistant via Settings → Add-ons → Add-on Store → Repositories.

---

CONTEXT

I run Home Assistant OS on a Home Assistant Yellow (CM4, aarch64). I already have the ha-mcp addon installed and working — it connects to Open WebUI (also running on the same HA host) via localhost. Open WebUI uses ha-mcp as an MCP tool server, giving the LLM access to HA's API including ha_check_config, ha_reload_core, ha_restart, states, services, automations, dashboards, entity registry, and more.

What ha-mcp cannot do is read/write arbitrary files in /config, run git operations, query InfluxDB, or interact with Node-RED flows. These four addons fill those gaps. They are consumed locally by Open WebUI on the same host — no external tunnel or authentication required.

---

REPOSITORY STRUCTURE

repository.json
README.md
mcp-filesystem/
  config.yaml
  Dockerfile
  run.sh
  README.md
mcp-git/
  config.yaml
  Dockerfile
  run.sh
  src/
  README.md
mcp-node-red/
  config.yaml
  Dockerfile
  run.sh
  src/
  README.md
mcp-influxdb/
  config.yaml
  Dockerfile
  run.sh
  src/
  README.md

---

REQUIREMENTS APPLYING TO ALL ADDONS

- aarch64: true declared in every config.yaml
- All addons run as Streamable HTTP MCP servers (not stdio) so Open WebUI can connect via http://localhost:<port>/mcp
- Ports declared in config.yaml and exposed as configurable addon options
- /config mapped via map: config in config.yaml for addons that need filesystem access (mcp-filesystem, mcp-git)
- Each addon independently installable from the same repository
- No placeholder files — every file must be fully functional and ready to deploy
- Base Docker images must support aarch64 (use node:20-alpine or python:3.11-slim, both are multiarch)

---

ADDON 1: mcp-filesystem

Purpose: expose read/write/list/delete access to /config via MCP.

Implementation: wrap @modelcontextprotocol/server-filesystem (official npm package) as a Streamable HTTP MCP server. Note that the official package runs in stdio mode by default — use a stdio-to-HTTP bridge (e.g. supergateway npm package) to expose it over HTTP.

Config options (config.yaml):
- port (int, default 3001)
- allowed_paths (list, default ["/config"])

run.sh must pass allowed_paths to the server and bind to 0.0.0.0:<port>.

---

ADDON 2: mcp-git

Purpose: expose git operations scoped to a local repository via MCP.

Implementation: custom minimal MCP server in Node.js or Python. Do not rely on an existing git MCP package — implement directly using simple-git (Node.js) or GitPython (Python).

Tools to implement:
- git_status — show working tree status
- git_diff — show unstaged changes  
- git_add — stage all changes (git add -A)
- git_commit(message) — commit staged changes with provided message
- git_push — push to remote using SSH key at configured path
- git_log(n) — show last n commits (default 10)

git_push must set GIT_SSH_COMMAND to use the configured SSH key:
  GIT_SSH_COMMAND='ssh -i <ssh_key_path> -o StrictHostKeyChecking=no'

Config options (config.yaml):
- port (int, default 3002)
- repo_path (str, default "/config")
- ssh_key_path (str, default "/config/.ssh/id_rsa")

---

ADDON 3: mcp-node-red

Purpose: interact with a local Node-RED instance via its HTTP API.

Implementation: custom minimal MCP server in Node.js or Python, making HTTP calls to the Node-RED admin API.

Node-RED admin API base URL: http://localhost:1880 (configurable)

Tools to implement:
- list_flows — GET /flows, return id/label/type for each tab/flow
- get_flow(id) — GET /flow/<id>, return full flow JSON
- update_flow(id, flow_json) — PUT /flow/<id> with new flow JSON
- deploy(type) — POST /flows with type header (default "full")
- inject_node(node_id) — POST /inject/<node_id>
- get_nodes — GET /nodes, return list of installed node types

Config options (config.yaml):
- port (int, default 3003)
- node_red_url (str, default "http://localhost:1880")
- node_red_user (str, default "")
- node_red_password (str, default "")

Authentication: if node_red_user and node_red_password are set, obtain a session token via POST /auth/token and include it in subsequent requests.

---

ADDON 4: mcp-influxdb

Purpose: query an InfluxDB 1.8.x instance via its HTTP API.

Implementation: custom minimal MCP server in Python, using the requests library to call the InfluxDB HTTP API directly (do not use the influxdb Python client — use raw HTTP calls to /query and /ping for maximum compatibility with 1.8.x).

InfluxDB HTTP API endpoints used:
- GET /ping — health check
- GET /query?db=<db>&q=<InfluxQL> — query
- POST /query — write queries

Tools to implement:
- query(q, database) — run a raw InfluxQL query, return results as JSON. database defaults to configured default.
- list_measurements(database) — run SHOW MEASUREMENTS, return list
- list_databases — run SHOW DATABASES, return list
- get_recent(measurement, field, n, database) — SELECT last n values of field from measurement, return as list of {time, value} objects. n defaults to 10.

Config options (config.yaml):
- port (int, default 3004)
- influxdb_url (str, default "http://localhost:8086")
- influxdb_database (str, default "homeassistant")
- influxdb_user (str, default "")
- influxdb_password (str, default "")

---

EXISTING SETUP FOR CONTEXT

- HA Yellow, aarch64, Home Assistant OS
- Open WebUI installed as HA addon, connects to MCP servers via http://localhost:<port>
- ha-mcp already handles: config check, reload, restart, HA API, entity registry, dashboards
- Config at /config, modular with packages/ and includes/ subdirectories
- Git repo: Kokbo/homeassistant-config, SSH key at /config/.ssh/id_rsa
- Node-RED running as HA addon, HTTP API at http://localhost:1880, no auth enabled
- InfluxDB 1.8.x running as HA addon, HTTP API at http://localhost:8086, database: homeassistant
- Portainer available for debugging if needed

---

TASK BREAKDOWN

Complete these tasks in order:

1. Create repository scaffold
   - repository.json with correct HA addon repo format
   - Top-level README.md describing all four addons

2. Build mcp-filesystem
   - config.yaml (aarch64, port, allowed_paths, map: config)
   - Dockerfile (node:20-alpine, install deps, copy run.sh)
   - run.sh (start Streamable HTTP wrapper around @modelcontextprotocol/server-filesystem)
   - README.md

3. Build mcp-git
   - src/ with full MCP server implementation
   - config.yaml (aarch64, port, repo_path, ssh_key_path, map: config)
   - Dockerfile
   - run.sh
   - README.md

4. Build mcp-node-red
   - src/ with full MCP server implementation
   - config.yaml (aarch64, port, node_red_url, credentials)
   - Dockerfile
   - run.sh
   - README.md

5. Build mcp-influxdb
   - src/ with full MCP server implementation
   - config.yaml (aarch64, port, influxdb_url, database, credentials)
   - Dockerfile
   - run.sh
   - README.md

6. Validate all config.yaml files conform to HA addon schema (correct keys, types, structure)

7. Validate all JSON files (repository.json, package.json files) are syntactically correct

---

TESTING SCOPE

Validate JSON and YAML syntax and file structure only. Do not attempt to build or run Docker images — aarch64 builds will fail on a non-ARM host. The addons will be tested by installing them directly on the HA Yellow.

---

DELIVERABLE

Every file fully implemented with no placeholders. The repository must be ready to push to GitHub and immediately usable by adding it to HA via Settings → Add-ons → Add-on Store → Repositories.

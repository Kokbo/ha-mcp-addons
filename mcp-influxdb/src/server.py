"""MCP InfluxDB server — native MCP Streamable HTTP transport.

Uses the official Python `mcp` SDK's FastMCP API and exposes its
`streamable_http_app()` ASGI application directly on `/mcp` via uvicorn.
No supergateway, no stdio bridge.

The server advertises only the `tools` capability and never issues
`roots/list` requests to the client.
"""

import json
import os

import requests
import uvicorn
from mcp.server.fastmcp import FastMCP

with open("/data/options.json") as f:
    config = json.load(f)

PORT = config.get("port", 3004)
INFLUXDB_URL = config.get("influxdb_url", "http://localhost:8086").rstrip("/")
DEFAULT_DATABASE = config.get("influxdb_database", "homeassistant")
INFLUXDB_USER = config.get("influxdb_user", "")
INFLUXDB_PASSWORD = config.get("influxdb_password", "")

AUTH = (INFLUXDB_USER, INFLUXDB_PASSWORD) if INFLUXDB_USER else None

mcp = FastMCP(
    "mcp-influxdb",
    host="0.0.0.0",
    port=PORT,
    streamable_http_path="/mcp",
    stateless_http=False,
)


def influx_query(q: str, database: str) -> dict:
    resp = requests.get(
        f"{INFLUXDB_URL}/query",
        params={"db": database, "q": q},
        auth=AUTH,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


@mcp.tool()
def query(q: str, database: str = DEFAULT_DATABASE) -> str:
    """Run a raw InfluxQL query and return results as JSON."""
    result = influx_query(q, database)
    return json.dumps(result, indent=2)


@mcp.tool()
def list_measurements(database: str = DEFAULT_DATABASE) -> str:
    """List all measurements in the specified database."""
    result = influx_query("SHOW MEASUREMENTS", database)
    measurements = []
    for series in result.get("results", [{}])[0].get("series", []):
        measurements.extend(v[0] for v in series.get("values", []))
    return json.dumps(measurements, indent=2)


@mcp.tool()
def list_databases() -> str:
    """List all InfluxDB databases."""
    result = influx_query("SHOW DATABASES", "")
    databases = []
    for series in result.get("results", [{}])[0].get("series", []):
        databases.extend(v[0] for v in series.get("values", []))
    return json.dumps(databases, indent=2)


@mcp.tool()
def get_recent(
    measurement: str,
    field: str,
    n: int = 10,
    database: str = DEFAULT_DATABASE,
) -> str:
    """Get the last n values of a field from a measurement, returned as [{time, value}]."""
    q = f'SELECT "{field}" FROM "{measurement}" ORDER BY time DESC LIMIT {n}'
    result = influx_query(q, database)
    rows = []
    for series in result.get("results", [{}])[0].get("series", []):
        columns = series.get("columns", [])
        time_idx = columns.index("time") if "time" in columns else 0
        val_idx = columns.index(field) if field in columns else 1
        for values in series.get("values", []):
            rows.append({"time": values[time_idx], "value": values[val_idx]})
    return json.dumps(rows, indent=2)


if __name__ == "__main__":
    app = mcp.streamable_http_app()
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")

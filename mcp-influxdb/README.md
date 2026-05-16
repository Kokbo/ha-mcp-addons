# MCP InfluxDB Server

Home Assistant addon for querying InfluxDB 1.8.x via an HTTP/SSE MCP server.

## What it does

Custom MCP server (Python) that calls the InfluxDB HTTP API directly using raw HTTP requests — no InfluxDB client library — for maximum compatibility with InfluxDB 1.8.x.

**Available MCP tools:**

| Tool | Description |
|------|-------------|
| `query(q, database)` | Run a raw InfluxQL query, return JSON results |
| `list_measurements(database)` | Run `SHOW MEASUREMENTS`, return list |
| `list_databases()` | Run `SHOW DATABASES`, return list |
| `get_recent(measurement, field, n, database)` | Get last `n` values of `field` from `measurement` as `[{time, value}]` |

All tools default `database` to the configured `influxdb_database`.

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `port` | `3004` | HTTP port for the MCP server |
| `influxdb_url` | `http://localhost:8086` | InfluxDB HTTP API base URL |
| `influxdb_database` | `homeassistant` | Default database for queries |
| `influxdb_user` | `""` | InfluxDB username (leave empty if auth disabled) |
| `influxdb_password` | `""` | InfluxDB password (leave empty if auth disabled) |

## Example queries

```
query: SELECT mean("value") FROM "sensor.temperature" WHERE time > now() - 1h GROUP BY time(5m)
get_recent: measurement=sensor.temperature_outside, field=value, n=20
list_measurements: (shows all sensors recorded by HA recorder)
```

## Open WebUI connection

```
http://localhost:3004/sse
```

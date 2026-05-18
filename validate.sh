#!/usr/bin/env bash
set -euo pipefail

ERRORS=0

pass() { echo "  PASS: $1"; }
fail() { echo "  FAIL: $1" >&2; ((ERRORS++)) || true; }

echo "=== Repository structure ==="
for f in repository.json README.md; do
  [ -f "$f" ] && pass "$f exists" || fail "$f missing"
done

for addon in mcp-filesystem mcp-git mcp-node-red mcp-influxdb; do
  echo ""
  echo "--- $addon ---"
  for f in config.yaml Dockerfile run.sh README.md; do
    [ -f "$addon/$f" ] && pass "$f" || fail "$f missing"
  done
done

echo ""
echo "=== JSON syntax ==="
for f in repository.json mcp-filesystem/package.json mcp-git/package.json mcp-node-red/package.json; do
  if [ -f "$f" ]; then
    if python3 -c "import json; json.load(open('$f'))" 2>/dev/null; then
      pass "$f"
    else
      fail "$f invalid JSON"
    fi
  fi
done

echo ""
echo "=== YAML syntax ==="
for f in mcp-filesystem/config.yaml mcp-git/config.yaml mcp-node-red/config.yaml mcp-influxdb/config.yaml; do
  if [ -f "$f" ]; then
    if python3 -c "import yaml; yaml.safe_load(open('$f'))" 2>/dev/null; then
      pass "$f"
    else
      fail "$f invalid YAML"
    fi
  fi
done

echo ""
echo "=== aarch64 declared in all config.yaml ==="
for f in mcp-*/config.yaml; do
  [ -f "$f" ] || continue
  grep -q "aarch64" "$f" && pass "$f" || fail "$f missing aarch64"
done

echo ""
echo "=== Ports are unique ==="
PORTS=$(grep -h "/tcp:" mcp-*/config.yaml 2>/dev/null | grep -oE '[0-9]+/tcp' | sort)
UNIQUE=$(echo "$PORTS" | sort -u)
if [ "$PORTS" = "$UNIQUE" ]; then
  pass "Ports unique: $(echo "$PORTS" | tr '\n' ' ')"
else
  fail "Duplicate ports detected"
fi

echo ""
echo "=== map: config present in filesystem and git addons ==="
for addon in mcp-filesystem mcp-git; do
  f="$addon/config.yaml"
  [ -f "$f" ] || continue
  grep -q "config" "$f" && pass "$addon/config.yaml has map" || fail "$addon/config.yaml missing map: config"
done

echo ""
if [ "$ERRORS" -eq 0 ]; then
  echo "All validations passed."
else
  echo "$ERRORS error(s) found." >&2
  exit 1
fi

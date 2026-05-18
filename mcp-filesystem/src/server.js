import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import express from 'express';

const config = JSON.parse(readFileSync('/data/options.json', 'utf8'));
const PORT = config.port ?? 3001;
const ALLOWED_PATHS = Array.isArray(config.allowed_paths) && config.allowed_paths.length > 0
  ? config.allowed_paths
  : ['/config'];

const UPSTREAM_BIN = '/app/node_modules/.bin/mcp-server-filesystem';

// Connect to the official stdio-based filesystem server as a subprocess.
// We declare an empty client capability set so the upstream server falls back
// to its CLI-provided allowed directories and never issues a `roots/list`
// request back to us.
const upstream = new Client(
  { name: 'mcp-filesystem-proxy', version: '1.0.7' },
  { capabilities: {} },
);
const upstreamTransport = new StdioClientTransport({
  command: UPSTREAM_BIN,
  args: ALLOWED_PATHS,
  stderr: 'inherit',
});

await upstream.connect(upstreamTransport);

let cachedTools = await upstream.listTools();

upstream.fallbackNotificationHandler = async notification => {
  if (notification?.method === 'notifications/tools/list_changed') {
    try {
      cachedTools = await upstream.listTools();
      for (const { server } of sessions.values()) {
        try {
          await server.sendToolListChanged();
        } catch (error) {
          console.error('Error broadcasting tool list change:', error);
        }
      }
    } catch (error) {
      console.error('Failed to refresh upstream tool list:', error);
    }
  }
};

function createProxyServer() {
  const server = new Server(
    { name: 'mcp-filesystem', version: '1.0.7' },
    { capabilities: { tools: { listChanged: true } } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => cachedTools);

  server.setRequestHandler(CallToolRequestSchema, async req => {
    return upstream.callTool({
      name: req.params.name,
      arguments: req.params.arguments,
    });
  });

  return server;
}

const app = express();
const sessions = new Map();

function getSessionId(req) {
  const sessionId = req.headers['mcp-session-id'];
  return Array.isArray(sessionId) ? sessionId[0] : sessionId;
}

function sendJsonRpcError(res, status, code, message) {
  res.status(status).json({
    jsonrpc: '2.0',
    error: { code, message },
    id: null,
  });
}

async function createSession(req, res) {
  const server = createProxyServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: sessionId => {
      sessions.set(sessionId, { transport, server });
    },
  });

  let closing = false;
  transport.onclose = async () => {
    if (closing) return;
    closing = true;
    const sessionId = transport.sessionId;
    if (sessionId) {
      sessions.delete(sessionId);
    }
    try {
      await server.close();
    } catch (e) {
      // ignore
    }
  };

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

async function handlePost(req, res) {
  const sessionId = getSessionId(req);
  const session = sessionId ? sessions.get(sessionId) : undefined;

  if (session) {
    await session.transport.handleRequest(req, res, req.body);
    return;
  }

  if (sessionId) {
    sendJsonRpcError(res, 404, -32000, 'Session not found');
    return;
  }

  if (!isInitializeRequest(req.body)) {
    sendJsonRpcError(res, 400, -32000, 'Bad Request: No valid session ID provided');
    return;
  }

  await createSession(req, res);
}

async function handleSessionRequest(req, res) {
  const sessionId = getSessionId(req);
  const session = sessionId ? sessions.get(sessionId) : undefined;

  if (!session) {
    sendJsonRpcError(res, sessionId ? 404 : 400, -32000, 'Invalid or missing session ID');
    return;
  }

  await session.transport.handleRequest(req, res);
}

app.post('/mcp', express.json(), async (req, res) => {
  try {
    await handlePost(req, res);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      sendJsonRpcError(res, 500, -32603, 'Internal server error');
    }
  }
});

app.get('/mcp', async (req, res) => {
  try {
    await handleSessionRequest(req, res);
  } catch (error) {
    console.error('Error handling MCP session request:', error);
    if (!res.headersSent) {
      sendJsonRpcError(res, 500, -32603, 'Internal server error');
    }
  }
});

app.delete('/mcp', async (req, res) => {
  try {
    await handleSessionRequest(req, res);
  } catch (error) {
    console.error('Error handling MCP session request:', error);
    if (!res.headersSent) {
      sendJsonRpcError(res, 500, -32603, 'Internal server error');
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MCP Filesystem Streamable HTTP server listening on port ${PORT}`);
  console.log(`Endpoint: /mcp`);
  console.log(`Allowed paths: ${ALLOWED_PATHS.join(', ')}`);
  console.log(`Upstream tools: ${cachedTools.tools.map(t => t.name).join(', ')}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down`);
  upstream.close().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

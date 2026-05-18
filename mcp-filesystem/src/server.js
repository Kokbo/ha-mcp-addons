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
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8'));
const VERSION = PKG.version;

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
  { name: 'mcp-filesystem-proxy', version: VERSION },
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

const INSTRUCTIONS = [
  'Provides read/write filesystem access to the Home Assistant configuration directory at /config (inside the addon container).',
  'Use these tools — read_text_file, read_multiple_files, write_file, edit_file, create_directory, list_directory, list_directory_with_sizes, directory_tree, move_file, search_files, get_file_info, list_allowed_directories — for any access to Home Assistant configuration files.',
  'All paths must start with /config/...; never use /homeassistant/... or any host-side path — only the in-container /config view exists.',
  'Prefer these tools over any general-purpose shell or code-execution tool when working with HA configuration files.',
].join(' ');

function createProxyServer() {
  const server = new Server(
    { name: 'mcp-filesystem', version: VERSION },
    {
      capabilities: { tools: { listChanged: true } },
      instructions: INSTRUCTIONS,
    },
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

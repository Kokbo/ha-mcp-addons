import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import express from 'express';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('/data/options.json', 'utf8'));
const PORT = config.port ?? 3003;
const NODE_RED_URL = (config.node_red_url ?? 'http://localhost:1880').replace(/\/$/, '');
const NODE_RED_USER = config.node_red_user ?? '';
const NODE_RED_PASSWORD = config.node_red_password ?? '';

let authToken = null;

async function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };

  if (NODE_RED_USER && NODE_RED_PASSWORD && !authToken) {
    const resp = await fetch(`${NODE_RED_URL}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: 'node-red-admin',
        grant_type: 'password',
        scope: '*',
        username: NODE_RED_USER,
        password: NODE_RED_PASSWORD,
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      authToken = data.access_token;
    }
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
}

function createServer() {
  // Capabilities are derived from the tools registered below. The server
  // advertises only `tools` (no `roots`), so it never issues `roots/list`
  // requests to clients that don't implement that capability.
  const server = new McpServer({ name: 'mcp-node-red', version: '1.0.5' });

  server.tool('list_flows', 'List all Node-RED flows (tabs)', {}, async () => {
    const headers = await getHeaders();
    const resp = await fetch(`${NODE_RED_URL}/flows`, { headers });
    if (!resp.ok) throw new Error(`Node-RED error ${resp.status}: ${await resp.text()}`);
    const flows = await resp.json();
    const summary = flows
      .filter(f => f.type === 'tab')
      .map(f => ({ id: f.id, label: f.label, type: f.type, disabled: f.disabled }));
    return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
  });

  server.tool('get_flow', 'Get a specific Node-RED flow by ID', {
    id: z.string().describe('Flow tab ID'),
  }, async ({ id }) => {
    const headers = await getHeaders();
    const resp = await fetch(`${NODE_RED_URL}/flow/${id}`, { headers });
    if (!resp.ok) throw new Error(`Node-RED error ${resp.status}: ${await resp.text()}`);
    const flow = await resp.json();
    return { content: [{ type: 'text', text: JSON.stringify(flow, null, 2) }] };
  });

  server.tool('update_flow', 'Update a Node-RED flow', {
    id: z.string().describe('Flow tab ID'),
    flow_json: z.string().describe('Updated flow as JSON string'),
  }, async ({ id, flow_json }) => {
    const headers = await getHeaders();
    const resp = await fetch(`${NODE_RED_URL}/flow/${id}`, {
      method: 'PUT',
      headers,
      body: flow_json,
    });
    if (!resp.ok) throw new Error(`Node-RED error ${resp.status}: ${await resp.text()}`);
    const result = await resp.json();
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('deploy', 'Deploy Node-RED flows', {
    type: z.enum(['full', 'nodes', 'flows']).default('full').describe('Deployment type'),
  }, async ({ type }) => {
    const headers = await getHeaders();
    headers['Node-RED-Deployment-Type'] = type;
    const resp = await fetch(`${NODE_RED_URL}/flows`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ flows: [] }),
    });
    if (!resp.ok) throw new Error(`Node-RED error ${resp.status}: ${await resp.text()}`);
    return { content: [{ type: 'text', text: `Deployed successfully (type: ${type})` }] };
  });

  server.tool('inject_node', 'Inject a Node-RED inject node', {
    node_id: z.string().describe('ID of the inject node to trigger'),
  }, async ({ node_id }) => {
    const headers = await getHeaders();
    const resp = await fetch(`${NODE_RED_URL}/inject/${node_id}`, {
      method: 'POST',
      headers,
    });
    if (!resp.ok) throw new Error(`Node-RED error ${resp.status}: ${await resp.text()}`);
    return { content: [{ type: 'text', text: `Injected node ${node_id}` }] };
  });

  server.tool('get_nodes', 'List installed Node-RED node types', {}, async () => {
    const headers = await getHeaders();
    const resp = await fetch(`${NODE_RED_URL}/nodes`, { headers });
    if (!resp.ok) throw new Error(`Node-RED error ${resp.status}: ${await resp.text()}`);
    const nodes = await resp.json();
    return { content: [{ type: 'text', text: JSON.stringify(nodes, null, 2) }] };
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
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: sessionId => {
      sessions.set(sessionId, { transport, server });
    },
  });

  transport.onclose = () => {
    const sessionId = transport.sessionId;
    if (sessionId) {
      sessions.delete(sessionId);
    }
    void server.close().catch(error => console.error('Error closing MCP server:', error));
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
  console.log(`MCP Node-RED Streamable HTTP server listening on port ${PORT}`);
  console.log(`Endpoint: /mcp`);
  console.log(`Node-RED URL: ${NODE_RED_URL}`);
});

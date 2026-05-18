import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
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
  const server = new McpServer({ name: 'mcp-node-red', version: '1.0.0' });

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

app.post('/mcp', express.json(), async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on('close', () => {
    void transport.close().catch(error => console.error('Error closing MCP transport:', error));
    void server.close().catch(error => console.error('Error closing MCP server:', error));
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

app.get('/mcp', (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method not allowed',
    },
    id: null,
  });
});

app.delete('/mcp', (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method not allowed',
    },
    id: null,
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MCP Node-RED Streamable HTTP server listening on port ${PORT}`);
  console.log(`Endpoint: /mcp`);
  console.log(`Node-RED URL: ${NODE_RED_URL}`);
});

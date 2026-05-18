import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import express from 'express';
import { simpleGit } from 'simple-git';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('/data/options.json', 'utf8'));
const PORT = config.port ?? 3002;
const REPO_PATH = config.repo_path ?? '/config';
const SSH_KEY_PATH = config.ssh_key_path ?? '/config/.ssh/id_rsa';
const STATEFUL = process.env.MCP_STATEFUL === 'true' || process.argv.includes('--stateful');

const git = simpleGit(REPO_PATH);

function createServer() {
  const server = new McpServer({ name: 'mcp-git', version: '1.0.0' });

  server.tool('git_status', 'Show working tree status', {}, async () => {
    const status = await git.status();
    return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
  });

  server.tool('git_diff', 'Show unstaged changes', {}, async () => {
    const diff = await git.diff();
    return { content: [{ type: 'text', text: diff || '(no unstaged changes)' }] };
  });

  server.tool('git_add', 'Stage all changes (git add -A)', {}, async () => {
    await git.add('-A');
    return { content: [{ type: 'text', text: 'All changes staged' }] };
  });

  server.tool('git_commit', 'Commit staged changes with a message', {
    message: z.string().describe('Commit message'),
  }, async ({ message }) => {
    const result = await git.commit(message);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('git_push', 'Push to remote using configured SSH key', {}, async () => {
    const result = await git
      .env({ GIT_SSH_COMMAND: `ssh -i ${SSH_KEY_PATH} -o StrictHostKeyChecking=no` })
      .push();
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('git_log', 'Show recent commits', {
    n: z.number().int().positive().default(10).describe('Number of commits to show'),
  }, async ({ n }) => {
    const log = await git.log({ maxCount: n });
    return { content: [{ type: 'text', text: JSON.stringify(log, null, 2) }] };
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
    error: {
      code,
      message,
    },
    id: null,
  });
}

async function createStatefulSession(req, res) {
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

async function handleStatefulPost(req, res) {
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

  await createStatefulSession(req, res);
}

async function handleStatefulSessionRequest(req, res) {
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
    if (STATEFUL) {
      await handleStatefulPost(req, res);
      return;
    }

    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      void transport.close().catch(error => console.error('Error closing MCP transport:', error));
      void server.close().catch(error => console.error('Error closing MCP server:', error));
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      sendJsonRpcError(res, 500, -32603, 'Internal server error');
    }
  }
});

app.get('/mcp', async (req, res) => {
  if (STATEFUL) {
    try {
      await handleStatefulSessionRequest(req, res);
    } catch (error) {
      console.error('Error handling MCP session request:', error);
      if (!res.headersSent) {
        sendJsonRpcError(res, 500, -32603, 'Internal server error');
      }
    }
    return;
  }

  sendJsonRpcError(res, 405, -32000, 'Method not allowed');
});

app.delete('/mcp', async (req, res) => {
  if (STATEFUL) {
    try {
      await handleStatefulSessionRequest(req, res);
    } catch (error) {
      console.error('Error handling MCP session request:', error);
      if (!res.headersSent) {
        sendJsonRpcError(res, 500, -32603, 'Internal server error');
      }
    }
    return;
  }

  sendJsonRpcError(res, 405, -32000, 'Method not allowed');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MCP Git Streamable HTTP server listening on port ${PORT}`);
  console.log(`Endpoint: /mcp`);
  console.log(`Stateful: ${STATEFUL}`);
  console.log(`Repo: ${REPO_PATH}, SSH key: ${SSH_KEY_PATH}`);
});

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import express from 'express';
import { simpleGit } from 'simple-git';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('/data/options.json', 'utf8'));
const PORT = config.port ?? 3002;
const REPO_PATH = config.repo_path ?? '/config';
const SSH_KEY_PATH = config.ssh_key_path ?? '/config/.ssh/id_rsa';

const git = simpleGit(REPO_PATH);

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

const app = express();
const transports = {};

app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/messages', res);
  transports[transport.sessionId] = transport;
  res.on('close', () => delete transports[transport.sessionId]);
  await server.connect(transport);
});

app.post('/messages', express.json(), async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(400).json({ error: 'No transport found for sessionId' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MCP Git server listening on port ${PORT}`);
  console.log(`Repo: ${REPO_PATH}, SSH key: ${SSH_KEY_PATH}`);
});

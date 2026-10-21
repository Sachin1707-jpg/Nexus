import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { TOOLS } from '../tools/index.js';
import { config } from '../config.js';
import { safeEqual } from '../security/crypto.js';
import { logger } from '../logger.js';
import { audit } from '../services/audit.js';

export const MCP_SERVER_INFO = { name: 'nexus-assistant', version: '1.0.0' };

function buildServer(ctx) {
  const server = new McpServer(MCP_SERVER_INFO, { instructions: 'Nexus personal assistant tools. Consequential tools only PROPOSE an action; a human must approve it in the Nexus UI.' });
  for (const t of TOOLS) {
    server.registerTool(t.name, {
      description: `[${t.domain}|${t.risk}] ${t.description}`,
      inputSchema: t.schema,
      annotations: { readOnlyHint: t.risk === 'read', destructiveHint: t.risk === 'approval', idempotentHint: false, openWorldHint: true },
    }, async (args) => {
      try {
        const res = await t.handler(args, ctx);
        if (t.risk === 'approval') audit({ sessionId: ctx.sessionId, type: `mcp:${t.name}`, outcome: res.ok ? 'proposed' : 'not_proposed' });
        return { content: [{ type: 'text', text: JSON.stringify(res) }], structuredContent: { result: res } };
      } catch (e) {
        const message = e.expose || e.status ? e.message : e instanceof z.ZodError ? 'Invalid arguments.' : `Tool failed: ${e.message}`;
        logger.warn('mcp tool error', { tool: t.name, message });
        return { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, error: message, code: e.code }) }] };
      }
    });
  }
  return server;
}

/** Express handler for POST /mcp (stateless Streamable HTTP, spec 2025-11-25). */
export async function mcpHandler(req, res) {
  const auth = req.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !safeEqual(token, config.MCP_AUTH_TOKEN)) return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null });
  const origin = req.get('origin');
  if (origin && origin !== config.FRONTEND_ORIGIN) return res.status(403).json({ jsonrpc: '2.0', error: { code: -32002, message: 'Origin not allowed' }, id: null });
  const ctx = { sessionId: req.get('x-nexus-session') || 'mcp-external', conversationId: req.get('x-nexus-conversation') || null };
  const server = buildServer(ctx);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    logger.error('mcp request failed', { message: e.message });
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
  }
}
export const mcpMethodNotAllowed = (req, res) => res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed (stateless server: use POST).' }, id: null });

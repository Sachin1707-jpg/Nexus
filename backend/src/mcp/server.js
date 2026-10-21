import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { TOOLS } from '../tools/index.js';
import { config } from '../config.js';
import { safeEqual } from '../security/crypto.js';
import { logger } from '../logger.js';
import { audit } from '../services/audit.js';

export const MCP_SERVER_INFO = { name: 'nexus-assistant', version: '1.0.0' };

// IP -> { count: number, firstAt: number }
const failedAuthAttempts = new Map();
function checkFailedAuthRateLimit(ip) {
  const now = Date.now();
  const entry = failedAuthAttempts.get(ip);
  if (!entry) return false;
  if (now - entry.firstAt > 5 * 60e3) {
    failedAuthAttempts.delete(ip);
    return false;
  }
  return entry.count >= 10;
}
function recordFailedAuth(ip) {
  const now = Date.now();
  const entry = failedAuthAttempts.get(ip) || { count: 0, firstAt: now };
  if (now - entry.firstAt > 5 * 60e3) {
    entry.count = 0;
    entry.firstAt = now;
  }
  entry.count++;
  failedAuthAttempts.set(ip, entry);
}
function recordSuccessAuth(ip) {
  failedAuthAttempts.delete(ip);
}

function buildServer(ctx) {
  const server = new McpServer(MCP_SERVER_INFO, {
    instructions: 'Nexus personal assistant tools. Consequential tools only PROPOSE an action; a human must approve it in the Nexus UI.',
  });

  const toolsToRegister = ctx.scope === 'readonly'
    ? TOOLS.filter((t) => t.risk === 'read' || (config.allowProposeToolsInReadOnly && t.risk === 'approval'))
    : TOOLS;

  for (const t of toolsToRegister) {
    const isLocalTool = ['system', 'memory'].includes(t.domain);
    const toolMeta = {
      title: t.title || t.name,
      description: t.description,
      inputSchema: t.schema,
      ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}),
      annotations: {
        readOnlyHint: t.risk === 'read',
        destructiveHint: t.risk === 'approval',
        idempotentHint: t.risk === 'read',
        openWorldHint: !isLocalTool,
      },
      _meta: {
        domain: t.domain,
        risk: t.risk,
      },
    };

    server.registerTool(t.name, toolMeta, async (args) => {
      try {
        if (ctx.scope === 'readonly' && t.risk !== 'read' && !config.allowProposeToolsInReadOnly) {
          return {
            isError: true,
            content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'Read-only token cannot execute proposal or modification tools.' }) }],
          };
        }
        const res = await t.handler(args, ctx);
        if (t.risk === 'approval') {
          audit({ sessionId: ctx.sessionId, type: `mcp:${t.name}`, outcome: res.ok ? 'proposed' : 'not_proposed' });
          if (res.ok && res.data?.pendingActions?.length) {
            if (!res.summary) res.summary = 'Action was prepared and is waiting for your review and approval in the Nexus app.';
            if (res.data) res.data.summary = res.summary;
          }
        }
        const isError = res && res.ok === false;
        return {
          isError: Boolean(isError),
          content: [{ type: 'text', text: JSON.stringify(res) }],
          structuredContent: { result: res },
        };
      } catch (e) {
        const isZod = e instanceof z.ZodError || e.name === 'ZodError';
        const message = e.expose ? e.message : isZod ? 'Invalid arguments.' : 'Tool failed. Please try again.';
        logger.warn('mcp tool error', { tool: t.name, message: e.message, code: e.code });
        return {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify({ ok: false, error: message, code: e.expose ? e.code : undefined }) }],
        };
      }
    });
  }
  return server;
}

/** Express handler for POST /mcp (stateless Streamable HTTP, spec 2025-11-25). */
export async function mcpHandler(req, res) {
  // Validate Host header
  const rawHost = req.get('host') || '';
  const hostName = rawHost.split(':')[0].toLowerCase();
  const isLocalHost = ['127.0.0.1', 'localhost', '::1', config.HOST.toLowerCase()].includes(hostName);
  const isAllowedHost = config.mcpAllowedHosts.includes(hostName);
  if (rawHost && !isLocalHost && !isAllowedHost) {
    logger.warn('mcp host rejected', { host: rawHost, ip: req.ip });
    return res.status(403).json({ jsonrpc: '2.0', error: { code: -32002, message: 'Host not allowed' }, id: null });
  }

  // Rate-limit failed auth
  if (checkFailedAuthRateLimit(req.ip)) {
    return res.status(429).json({ jsonrpc: '2.0', error: { code: -32003, message: 'Too many failed authentication attempts. Please try again later.' }, id: null });
  }

  const auth = req.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  let scope = null;
  if (token && safeEqual(token, config.MCP_AUTH_TOKEN)) {
    scope = 'full';
  } else if (config.MCP_READONLY_TOKEN && token && safeEqual(token, config.MCP_READONLY_TOKEN)) {
    scope = 'readonly';
  }

  if (!scope) {
    recordFailedAuth(req.ip);
    logger.warn('mcp auth failure', { ip: req.ip, host: rawHost, reason: 'invalid_token' });
    return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null });
  }

  recordSuccessAuth(req.ip);

  const origin = req.get('origin');
  if (origin && origin !== config.FRONTEND_ORIGIN) {
    return res.status(403).json({ jsonrpc: '2.0', error: { code: -32002, message: 'Origin not allowed' }, id: null });
  }

  const ctx = {
    sessionId: req.get('x-nexus-session') || 'mcp-external',
    conversationId: req.get('x-nexus-conversation') || null,
    scope,
  };

  logger.info('mcp request', { scope: ctx.scope, sessionId: ctx.sessionId });

  const server = buildServer(ctx);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

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

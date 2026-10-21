import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { config } from '../config.js';

/** Real MCP client over Streamable HTTP. The orchestrator uses this to call every tool. */
export async function withMcp({ sessionId, conversationId, baseUrl }, fn) {
  const url = new URL('/mcp', baseUrl ?? `http://${config.HOST === '0.0.0.0' ? '127.0.0.1' : config.HOST}:${config.PORT}`);
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${config.MCP_AUTH_TOKEN}`, 'x-nexus-session': sessionId, ...(conversationId ? { 'x-nexus-conversation': conversationId } : {}) } },
  });
  const client = new Client({ name: 'nexus-orchestrator', version: '1.0.0' });
  await client.connect(transport);
  try { return await fn(client); } finally { await client.close().catch(() => {}); }
}
export async function listMcpTools(ctx) { return withMcp(ctx, async (c) => (await c.listTools()).tools); }
export async function callMcpTool(ctx, name, args) {
  return withMcp(ctx, async (c) => {
    const r = await c.callTool({ name, arguments: args ?? {} });
    const text = r.content?.find((x) => x.type === 'text')?.text ?? '{}';
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = { ok: false, error: text }; }
    if (r.isError && parsed.ok !== false) parsed = { ok: false, error: text };
    return parsed;
  });
}

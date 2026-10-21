// Verifies the MCP server independently of the UI/orchestrator, as an external (e.g. Alexa+-style) client would.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';

const url = new URL(process.env.MCP_URL ?? 'http://127.0.0.1:8787/mcp');
const token = process.env.MCP_AUTH_TOKEN;
if (!token) { console.error('Set MCP_AUTH_TOKEN'); process.exit(2); }
let failed = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!cond) failed++; };

const bad = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{}' });
check('rejects request without bearer token (401)', bad.status === 401);

const client = new Client({ name: 'smoke', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
check(`SDK protocol version is ${LATEST_PROTOCOL_VERSION} (needs >= 2025-11-25)`, LATEST_PROTOCOL_VERSION >= '2025-11-25');
const { tools } = await client.listTools();
check('lists tools', tools.length >= 20, `${tools.length} tools`);
check('tools have JSON schemas', tools.every((t) => t.inputSchema?.type === 'object'));
const domains = new Set(tools.map((t) => t.description.match(/^\[(\w+)\|/)?.[1]));
check('covers all domains', ['tasks', 'calendar', 'gmail', 'weather', 'system', 'github', 'memory'].every((d) => domains.has(d)), [...domains].join(','));

const health = await client.callTool({ name: 'system_get_health', arguments: {} });
const h = JSON.parse(health.content[0].text);
check('system_get_health returns real metrics', h.ok && h.data.memory.totalBytes > 0, `${h.data.cpu.cores} cores`);

const invalid = await client.callTool({ name: 'tasks_create', arguments: { title: '' } }).catch((e) => ({ isError: true, err: e.message }));
check('invalid input is rejected by schema', invalid.isError === true);

const pend = await client.callTool({ name: 'system_propose_kill_process', arguments: { pid: 999999, name: 'nonexistent' } });
const p = JSON.parse(pend.content[0].text);
check('approval-tier tool only PROPOSES (pending, not executed)', p.ok && p.data.pendingActions[0].approvalStatus === 'pending' && p.data.pendingActions[0].executionStatus === 'not_started');
await client.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll MCP checks passed');
process.exit(failed ? 1 : 0);

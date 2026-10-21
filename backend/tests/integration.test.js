import './setup.js';
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../src/database/db.js';
import { createApp } from '../src/server.js';
import { config } from '../src/config.js';

const queue = []; const seen = [];
let mock, server, cookie = '', csrf = '';
const BASE = `http://127.0.0.1:${config.PORT}`;

before(async () => {
  openDb(':memory:');
  mock = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => (b += c));
    req.on('end', () => {
      if (req.url === '/api/chat') {
        const body = JSON.parse(b); seen.push(body);
        const next = queue.shift() ?? { content: 'ok' };
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.end(JSON.stringify({ message: { role: 'assistant', content: next.content ?? '', ...(next.tool_calls ? { tool_calls: next.tool_calls } : {}) }, done: true }) + '\n');
      } else if (req.url === '/api/tags') res.end(JSON.stringify({ models: [{ name: 'qwen3:4b' }] }));
      else { res.statusCode = 404; res.end('{}'); }
    });
  });
  await new Promise((r) => mock.listen(18434, '127.0.0.1', r));
  server = createApp().listen(config.PORT, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const r = await fetch(`${BASE}/api/bootstrap`); cookie = r.headers.get('set-cookie').split(';')[0]; csrf = (await r.json()).csrfToken;
});
beforeEach(() => { queue.length = 0; seen.length = 0; });
after(() => { server.close(); mock.close(); });

const call = (path, { method = 'GET', body, headers = {} } = {}) => fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-Nexus-CSRF': csrf, ...headers }, body: body ? JSON.stringify(body) : undefined });
async function chat(text, conversationId) {
  const r = await call('/api/chat', { method: 'POST', body: { conversationId, text } });
  const events = (await r.text()).split('\n\n').filter(Boolean).map((l) => JSON.parse(l.replace(/^data: /, '')));
  return { events, final: events.find((e) => e.type === 'final'), err: events.find((e) => e.type === 'error') };
}
const newConv = async () => (await (await call('/api/conversations', { method: 'POST' })).json()).id;
const tc = (name, args) => ({ tool_calls: [{ function: { name, arguments: args } }] });

test('CSRF: state-changing request without token is rejected', async () => {
  const r = await fetch(`${BASE}/api/conversations`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403);
});
test('Origin check: foreign origin is rejected', async () => {
  const r = await call('/api/conversations', { method: 'POST', headers: { Origin: 'http://evil.example' } });
  assert.equal(r.status, 403);
});
test('MCP endpoint requires bearer token and rejects foreign origin', async () => {
  const h = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  assert.equal((await fetch(`${BASE}/mcp`, { method: 'POST', headers: h, body: '{}' })).status, 401);
  assert.equal((await fetch(`${BASE}/mcp`, { method: 'POST', headers: { ...h, Authorization: 'Bearer wrong' }, body: '{}' })).status, 401);
  assert.equal((await fetch(`${BASE}/mcp`, { method: 'POST', headers: { ...h, Authorization: `Bearer ${config.MCP_AUTH_TOKEN}`, Origin: 'http://evil.example' }, body: '{}' })).status, 403);
});
test('orchestrator selects a tool, calls it through MCP and reports real data', async () => {
  const id = await newConv(); seen.length = 0;
  // Pass 1: tool-selection → model picks system_get_health
  // Pass 2: model produces final text (no tools) → orchestrator re-runs with streaming
  // Pass 3: streaming re-generation (our new final-answer pass)
  queue.push(tc('system_get_health', {}), { content: 'Your laptop looks healthy.' }, { content: 'Your laptop looks healthy.' });
  const { final } = await chat('Check my laptop health', id);
  assert.equal(final.text, 'Your laptop looks healthy.');
  assert.deepEqual(final.meta.tools.map((t) => [t.name, t.ok]), [['system_get_health', true]]);
  const toolMsg = seen[1].messages.find((m) => m.role === 'tool');
  assert.match(toolMsg.content, /"totalBytes"/); // model received genuine metrics
});
test('only routed tool domains are exposed to the model (speed + accuracy)', async () => {
  const id = await newConv(); queue.push({ content: 'hi' }, { content: 'hi' });
  await chat('Mere laptop mein kya problem chal rahi hai?', id);
  const names = seen[0].tools.map((t) => t.function.name);
  assert.ok(names.length === 7 && names.filter((n) => n.startsWith('system_')).length === 6 && names.includes('action_get_status'));
  seen.length = 0; queue.push({ content: 'hello' }, { content: 'hello' }); await chat('hello there', id);
  assert.equal(seen[0].tools, undefined);
});
test('malformed tool call (bad args) is returned to the model for self-correction', async () => {
  const id = await newConv();
  // Pass 1: bad args → error fed back
  // Pass 2: corrected tool call → tool executes
  // Pass 3: model produces final text (no tools)
  // Pass 4: streaming re-generation
  queue.push(tc('system_list_processes', { limit: 'lots' }), tc('system_list_processes', { limit: 3 }), { content: 'Top 3 listed.' }, { content: 'Top 3 listed.' });
  const { final } = await chat('which processes use most memory', id);
  assert.match(seen[1].messages.at(-1).content, /Invalid arguments/);
  assert.equal(final.text, 'Top 3 listed.');
});
test('unknown / hallucinated tool names are refused', async () => {
  const id = await newConv();
  queue.push(tc('format_disk', {}), { content: 'Sorry, cannot.' }, { content: 'Sorry, cannot.' });
  const { final } = await chat('check my laptop health', id);
  assert.match(seen[1].messages.at(-1).content, /Unknown or unavailable tool/);
  assert.equal(final.meta.tools[0].ok, false);
});
test('tools outside the routed domains cannot be invoked even if the model asks', async () => {
  const id = await newConv();
  queue.push(tc('gmail_propose_send', { to: 'a@b.co', subject: 's', body: 'b' }), { content: 'ok' }, { content: 'ok' });
  await chat('check my laptop health', id);
  assert.match(seen[1].messages.at(-1).content, /Unknown or unavailable/);
});
test('missing detail => clarification question, no guessing (weather without location)', async () => {
  const id = await newConv(); queue.push(tc('weather_outing_advice', { date: '2026-10-22' }));
  const { final } = await chat('Kal ghoomne jaa sakti hoon?', id);
  assert.match(final.text, /Which city/i);
});
test('success claim without any tool call is replaced by an honest message', async () => {
  const id = await newConv();
  // Pass 1 (tool-select): model falsely claims success with no tool call
  // Pass 2 (streaming re-gen): same false claim — honesty guard fires on finalText
  queue.push({ content: "I've created the task for you!" }, { content: "I've created the task for you!" });
  const { final } = await chat('assignment submit karna hai, task bana do', id);
  assert.match(final.text, /haven't actually done that/i);
});
test('approval-tier tool yields a pending action and nothing executes', async () => {
  const id = await newConv(); queue.push(tc('system_propose_kill_process', { pid: 999999, name: 'chrome' }), { content: 'Please review the card.' });
  const { final, events } = await chat('kill the chrome process 999999 on my laptop', id);
  const act = events.find((e) => e.type === 'action').action;
  assert.equal(act.approvalStatus, 'pending'); assert.equal(act.executionStatus, 'not_started');
  assert.deepEqual(final.meta.actions, [act.id]);
});
test('approval over HTTP: wrong hash refused; correct hash executes with verification outcome recorded', async () => {
  const id = await newConv(); queue.push(tc('system_propose_kill_process', { pid: 999999, name: 'chrome' }), { content: 'review' });
  const act = (await chat('kill process chrome 999999 on my laptop', id)).events.find((e) => e.type === 'action').action;
  const bad = await call(`/api/actions/${act.id}/approve`, { method: 'POST', body: { hash: 'f'.repeat(64) } });
  assert.equal(bad.status, 409);
  const { hashPayload } = await import('../src/services/approvals.js');
  const ok = await (await call(`/api/actions/${act.id}/approve`, { method: 'POST', body: { hash: hashPayload('system.kill_process', act.payload) } })).json();
  assert.equal(ok.executionStatus, 'failed'); // pid does not exist: failure is reported, never faked as success
  assert.match(ok.error, /no longer running/);
});
test('another browser session cannot see or approve my actions', async () => {
  const id = await newConv(); queue.push(tc('system_propose_kill_process', { pid: 999998, name: 'x' }), { content: 'r' });
  const act = (await chat('kill process x 999998 laptop', id)).events.find((e) => e.type === 'action').action;
  const r2 = await fetch(`${BASE}/api/bootstrap`); const c2 = r2.headers.get('set-cookie').split(';')[0]; const t2 = (await r2.json()).csrfToken;
  const r = await fetch(`${BASE}/api/actions/${act.id}/approve`, { method: 'POST', headers: { Cookie: c2, 'X-Nexus-CSRF': t2, 'Content-Type': 'application/json' }, body: JSON.stringify({ hash: 'a'.repeat(64) }) });
  assert.equal(r.status, 404);
});
test('Ollama unavailable => clear error event, not a fake answer', async () => {
  const id = await newConv(); mock.close(); await new Promise((r) => setTimeout(r, 50));
  const { err, final } = await chat('hello', id);
  assert.match(err.message, /Ollama/); assert.equal(final, undefined);
});

// ── Orchestrator streaming state-machine tests ───────────────────────────────
// These tests verify the new 2-pass design: tool-selection (no streaming) then
// a separate streaming re-generation pass for the final answer.

test('streaming: stream_reset fires before tokens on no-tool path', async () => {
  // Restart mock (was closed by the Ollama-unavailable test above)
  await new Promise((r) => mock.listen(18434, '127.0.0.1', r));
  const id = await newConv(); seen.length = 0;
  queue.push({ content: 'Hello back.' }, { content: 'Hello back.' });
  const r = await call('/api/chat', { method: 'POST', body: { conversationId: id, text: 'Hello there' } });
  const events = (await r.text()).split('\n\n').filter(Boolean).map((l) => JSON.parse(l.replace(/^data: /, '')));
  const resets = events.filter((e) => e.type === 'stream_reset');
  const tokens = events.filter((e) => e.type === 'token');
  const finalEv = events.find((e) => e.type === 'final');
  assert.ok(resets.length >= 1, 'stream_reset must fire');
  assert.ok(tokens.length > 0, 'token events must arrive for the final answer');
  assert.ok(finalEv?.text, 'final event must carry the answer');
});

test('streaming: no tokens during tool-selection, tokens arrive after tool result', async () => {
  const id = await newConv(); seen.length = 0;
  queue.push(tc('system_get_health', {}), { content: 'All fine.' }, { content: 'All fine.' });
  const r = await call('/api/chat', { method: 'POST', body: { conversationId: id, text: 'Check my laptop health' } });
  const events = (await r.text()).split('\n\n').filter(Boolean).map((l) => JSON.parse(l.replace(/^data: /, '')));
  const resets = events.filter((e) => e.type === 'stream_reset');
  const tokens = events.filter((e) => e.type === 'token');
  const finalEv = events.find((e) => e.type === 'final');
  assert.ok(resets.length >= 1, 'stream_reset must fire in the tool path');
  assert.ok(tokens.length > 0, 'tokens must arrive after the tool result');
  assert.ok(finalEv?.text);
});

test('streaming: action path emits zero tokens and a pending action event', async () => {
  const id = await newConv(); seen.length = 0;
  queue.push(tc('system_propose_kill_process', { pid: 999997, name: 'chrome' }), { content: 'Please review.' });
  const r = await call('/api/chat', { method: 'POST', body: { conversationId: id, text: 'kill chrome process 999997' } });
  const events = (await r.text()).split('\n\n').filter(Boolean).map((l) => JSON.parse(l.replace(/^data: /, '')));
  const tokens = events.filter((e) => e.type === 'token');
  const actionEv = events.find((e) => e.type === 'action');
  const finalEv = events.find((e) => e.type === 'final');
  assert.equal(tokens.length, 0, 'action path must not stream tokens');
  assert.ok(actionEv?.action?.approvalStatus === 'pending', 'pending action must be emitted');
  assert.ok(finalEv?.text, 'final event must still be emitted');
  assert.doesNotMatch(finalEv.text, /done|completed|sent|created|deleted/i);
});

test('streaming: exactly one stream_reset emitted per turn', async () => {
  const id = await newConv(); seen.length = 0;
  queue.push(tc('system_get_health', {}), { content: 'All good.' }, { content: 'All good.' });
  const r = await call('/api/chat', { method: 'POST', body: { conversationId: id, text: 'laptop health please' } });
  const events = (await r.text()).split('\n\n').filter(Boolean).map((l) => JSON.parse(l.replace(/^data: /, '')));
  assert.equal(events.filter((e) => e.type === 'stream_reset').length, 1);
});

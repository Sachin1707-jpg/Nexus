import { z } from 'zod';
import { chat } from '../services/llm.js';
import { listMcpTools, callMcpTool } from '../mcp/client.js';
import { toolByName } from '../tools/index.js';
import { routeMessage, wantsHistory } from './router.js';
import { systemPrompt } from './prompts.js';
import { getSettings } from '../services/settings.js';
import { getDb } from '../database/db.js';
import { addMessage, getMessages, getConversation, searchHistory } from '../services/conversations.js';
import { get as getAction } from '../services/approvals.js';
import { logger } from '../logger.js';

const MAX_STEPS = 4;
const STATUS = {
  tasks_list: 'Checking your tasks', tasks_create: 'Creating the task', tasks_update: 'Updating the task', tasks_delete: 'Preparing task deletion',
  calendar_list_events: 'Checking your calendar', calendar_create_event: 'Creating the event', calendar_update_event: 'Preparing the calendar change', calendar_delete_event: 'Preparing to cancel the event',
  gmail_search: 'Searching your email', gmail_read_thread: 'Reading the email thread', gmail_create_draft: 'Saving a draft', gmail_propose_send: 'Preparing the email for your review',
  weather_forecast: 'Fetching the forecast', weather_outing_advice: 'Checking the weather for your plan',
  system_get_health: 'Reading system health', system_list_processes: 'Looking at running processes', system_find_large_files: 'Scanning for large files', system_maintenance_recommendations: 'Analysing system metrics',
  system_propose_delete_files: 'Preparing file deletion', system_propose_kill_process: 'Preparing to stop the process',
  github_list_repos: 'Listing your repositories', github_read_repo_tree: 'Reviewing repository files', github_get_file_content: 'Reading the file', github_compare_commits: 'Comparing commits', github_review_code: 'Reviewing the code', github_prepare_pr: 'Preparing the pull request',
  news_get_latest: 'Fetching latest news',
  memory_save: 'Saving to memory', memory_list: 'Reading memories',
};
const SUCCESS_CLAIM = /\b(i(?:'ve| have)?\s+(?:just\s+)?(?:created|sent|deleted|scheduled|updated|marked|added|cancelled|canceled|moved|rescheduled|saved))\b|\b(ho gaya|kar diya|bana diya|bhej diya|hata diya|add kar diya)\b/i;

const sanitize = (v) => (typeof v === 'string' ? v.slice(0, 4000) : v);

/** Compact results so a small model's context stays small. */
export function compactResult(name, res) {
  const s = JSON.stringify(res);
  if (s.length <= 3500) return s;
  const d = res.data ?? {};
  for (const k of Object.keys(d)) if (Array.isArray(d[k])) d[k] = d[k].slice(0, 12);
  return JSON.stringify({ ...res, data: d, truncated: true }).slice(0, 3500);
}
export function extractRefs(name, res) {
  const d = res?.data; if (!d) return [];
  const out = [];
  for (const t of d.tasks ?? (d.created?.listId ? [d.created] : d.updated ? [d.updated] : [])) out.push({ kind: 'task', id: t.id, listId: t.listId, title: t.title, due: t.due });
  for (const e of d.events ?? (d.created?.start ? [d.created] : [])) out.push({ kind: 'event', id: e.id, title: e.title, start: e.start });
  for (const m of d.emails ?? []) out.push({ kind: 'email', threadId: m.threadId, subject: m.subject, from: m.from });
  return out.slice(0, 12);
}
function lastRefs(conversationId) {
  const ms = getMessages(conversationId, 12).filter((m) => m.role === 'assistant' && m.meta?.refs?.length).slice(-3);
  return ms.flatMap((m) => m.meta.refs).slice(-12);
}

export function formatFallbackToolResult(name, result) {
  if (!result || !result.ok) return null;
  const d = result.data ?? {};
  if (name === 'github_list_repos' && Array.isArray(d.repos)) {
    if (!d.repos.length) return "You don't have any GitHub repositories in your account yet.";
    const items = d.repos.map((r, i) => `${i + 1}. **${r.name}**${r.language ? ` (${r.language})` : ''}${r.description ? ` — ${r.description}` : ''}\n   🔗 [View on GitHub](${r.html_url})`);
    return `Here are your GitHub repositories:\n\n${items.join('\n\n')}`;
  }
  if (name === 'news_get_latest' && Array.isArray(d.articles)) {
    if (!d.articles.length) return "I couldn't find any recent tech news articles right now.";
    const items = d.articles.map((a, i) => `${i + 1}. **[${a.title}](${a.url})**\n   ${a.source ? `*${a.source}*` : ''}${a.description ? ` — ${a.description}` : ''}`);
    return `Here are the latest news headlines:\n\n${items.join('\n\n')}`;
  }
  if (name === 'system_get_health') {
    const parts = [];
    if (d.battery) {
      const b = d.battery;
      parts.push(`- **Battery**: ${b.percent}%, ${b.isCharging ? 'Charging' : 'Discharging'}`);
      parts.push(`- **Battery Health**: ${b.healthPercent}% (${b.degradationPercent}% degradation)`);
      if (b.degradationPercent > 50) parts.push(`- ⚠️ **Critical Degradation**: Battery degraded beyond 50%.`);
    }
    if (d.cpu) parts.push(`- **CPU Load**: ${d.cpu.loadPercent}%`);
    if (d.memory) parts.push(`- **Memory**: ${d.memory.usedPercent}% used of ${(d.memory.totalBytes / (1024 ** 3)).toFixed(1)} GB`);
    if (parts.length) return `Here is your current system health:\n\n${parts.join('\n')}`;
  }
  return null;
}

function toOllamaTool(t) {
  const { $schema, ...parameters } = t.inputSchema; // JSON schema delivered by the MCP server
  return { type: 'function', function: { name: t.name, description: t.description.replace(/^\[[^\]]*\]\s*/, ''), parameters } };
}

export async function runTurn({ sessionId, conversationId, text, emit = () => {}, signal }) {
  const settings = getSettings();
  const conv = getConversation(sessionId, conversationId);
  const ctx = { sessionId, conversationId };
  // Fetch 8 prior messages (down from 14); send last 6 to model to keep context tight
  const priorMsgs = getMessages(conversationId, 8);
  const lastDomains = [...(priorMsgs.filter((m) => m.role === 'assistant' && m.meta?.domains?.length).at(-1)?.meta.domains ?? [])];

  addMessage(conversationId, 'user', text);
  if (conv.title === 'New conversation') getDb().prepare('UPDATE conversations SET title=? WHERE id=?').run(text.slice(0, 50), conversationId);

  const route = routeMessage(text, lastDomains);
  // Only include memories when the message has a real domain or is a support request (saves tokens on smalltalk)
  const needsMemories = route.domains.length > 0 || route.support || route.crisis;
  const memories = needsMemories ? getDb().prepare('SELECT content FROM memories ORDER BY created_at DESC LIMIT 8').all().map((m) => m.content) : [];
  const history = wantsHistory(text) ? searchHistory(sessionId, text, conversationId) : [];

  let tools = [];
  if (route.domains.length) {
    try {
      const all = await listMcpTools(ctx);
      tools = all.filter((t) => route.domains.includes(toolByName.get(t.name)?.domain)).map(toOllamaTool);
    } catch (e) { emit({ type: 'error', message: 'The tool server (MCP) is unavailable.' }); logger.error('mcp list failed', { message: e.message }); }
  }

  // Trim oversized tool-result content in history to avoid ballooning context on multi-step turns
  const trimmedPrior = priorMsgs.slice(-6).map((m) => {
    if (m.role === 'tool' && typeof m.content === 'string' && m.content.length > 800) {
      try {
        const parsed = JSON.parse(m.content);
        return { ...m, content: JSON.stringify({ ok: parsed.ok, data: '[truncated]', summary: parsed.summary }) };
      } catch { return { ...m, content: m.content.slice(0, 800) + '…' }; }
    }
    return m;
  });

  const messages = [
    { role: 'system', content: systemPrompt({ tz: settings.timezone, userName: settings.userName, memories, refs: lastRefs(conversationId), support: route.support, crisis: route.crisis, extraHistory: history }) },
    ...trimmedPrior.map((m) => ({ role: m.role, content: m.content, ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}), ...(m.tool_name ? { tool_name: m.tool_name } : {}) })),
    { role: 'user', content: text },
  ];

  const turn = { tools: [], actions: [], refs: [], wrote: false, lastToolResult: null };
  let finalText = '';
  let clarification = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal?.aborted) break;
    // STATE: THINKING (tool-selection pass — never stream tokens here; they are not the final answer)
    emit({ type: 'status', message: step === 0 ? 'Thinking' : 'Working on it' });
    // Tool-selection pass: small output budget — we only need a tool call or a short reply
    const res = await chat({
      messages,
      tools,
      signal,
      think: step > 0 ? false : (route.support ? false : undefined),
      numPredict: tools.length ? 256 : 512,
    });

    // No tool calls → this IS the final answer. Stream it now.
    if (!res.toolCalls.length) {
      finalText = (res.content || '').trim();
      // If the model returned empty content after tools executed, do a quick direct synthesis
      if (!finalText && step > 0 && turn.lastToolResult) {
        const retryRes = await chat({
          messages: [...messages, { role: 'user', content: 'Summarize the tool output above directly in clear, concise markdown for the user.' }],
          signal,
          think: false,
          numPredict: 384,
        }).catch(() => null);
        finalText = (retryRes?.content || '').trim();
      }
      if (!finalText && turn.lastToolResult) {
        finalText = formatFallbackToolResult(turn.lastToolResult.name, turn.lastToolResult.result) || '';
      }
      // Signal the frontend to clear any accumulated stream buffer before the real answer starts.
      emit({ type: 'stream_reset' });
      // Stream tokens directly from the computed response without a redundant, slow 2nd LLM call.
      const tokens = finalText.split(/(\s+)/);
      for (const t of tokens) {
        if (t) emit({ type: 'token', text: t });
      }
      break;
    }

    messages.push({ role: 'assistant', content: res.content ?? '', tool_calls: res.toolCalls });
    let stop = false;
    for (const call of res.toolCalls.slice(0, 4)) {
      const name = call.function?.name; let args = call.function?.arguments ?? {};
      if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = null; } }
      const def = toolByName.get(name);
      const allowed = tools.some((t) => t.function.name === name);
      let result;
      if (!def || !allowed || args === null) result = { ok: false, error: `Unknown or unavailable tool "${name}". Use only the provided tools.` };
      else {
        const v = z.object(def.schema).safeParse(args);
        if (!v.success) result = { ok: false, error: 'Invalid arguments: ' + v.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ') + '. Fix them or ask the user for the missing detail.' };
        else {
          // STATE: TOOL_EXECUTION
          emit({ type: 'status', message: STATUS[name] ?? 'Working', tool: name });
          try { result = await callMcpTool(ctx, name, v.data); }
          catch (e) { result = { ok: false, error: 'The tool could not run: ' + String(e.message).slice(0, 120) }; }
        }
      }
      turn.tools.push({ name, ok: result.ok === true, risk: def?.risk });
      if (result.ok) {
        turn.lastToolResult = { name, result };
        if (def?.risk === 'write') turn.wrote = true;
      }
      turn.refs.push(...extractRefs(name, result));
      const pend = result.data?.pendingActions ?? [];
      for (const p of pend) { turn.actions.push(p.id); emit({ type: 'action', action: getAction(sessionId, p.id) }); }
      if (result.needsClarification) { clarification = result; stop = true; }
      else if (pend.length) { stop = true; finalText = result.data.message ?? ''; }
      messages.push({ role: 'tool', tool_name: name, content: compactResult(name, result) });
      emit({ type: 'tool', name, ok: result.ok === true });
      if (stop) break;
    }
    if (clarification) {
      const cands = clarification.candidates?.length ? '\n\n' + clarification.candidates.map((c, i) => `${i + 1}. ${c.title}${c.due ? ` (due ${c.due})` : ''}${c.start ? ` (${c.start})` : ''}`).join('\n') : '';
      finalText = clarification.question + cands; break;
    }
    if (turn.actions.length) {
      // STATE: THINKING → approval sentence (no streaming, very short)
      emit({ type: 'status', message: 'Working on it' });
      const r2 = await chat({ messages: [...messages, { role: 'user', content: '(System: the action is only PREPARED and awaits user approval. In one short sentence in the user\'s language, tell them to review the card and approve. Do not say it is done.)' }], signal, think: false, numPredict: 80 }).catch(() => ({ content: '' }));
      finalText = r2.content || 'I\'ve prepared this for your review. Nothing has been changed yet; please check the card below and approve or cancel.';
      break;
    }
    if (step === MAX_STEPS - 1) finalText = 'I couldn\'t finish that in a few steps. Could you rephrase or break it into smaller parts?';
  }

  // Honesty guard: no unverified success claims.
  if (finalText && SUCCESS_CLAIM.test(finalText) && !turn.wrote && !turn.actions.length) {
    finalText = 'I haven\'t actually done that yet — I didn\'t run any action. Tell me the missing details and I\'ll do it for real, then confirm from the service.';
  }
  if (!finalText && turn.lastToolResult) {
    finalText = formatFallbackToolResult(turn.lastToolResult.name, turn.lastToolResult.result) || '';
  }
  if (!finalText && !signal?.aborted) {
    const recovery = await chat({
      messages: [...messages, { role: 'user', content: 'Please answer my last question directly in 1-2 clear, helpful sentences.' }],
      think: false,
      numPredict: 192,
      signal,
    }).catch(() => null);
    if (recovery?.content?.trim()) {
      finalText = recovery.content.trim();
    }
  }
  if (!finalText) finalText = 'Sorry, I didn\'t get a usable answer from the model. Please try again.';

  const meta = { domains: route.domains, tools: turn.tools, actions: turn.actions, refs: turn.refs.slice(-12), support: route.support };
  const id = addMessage(conversationId, 'assistant', finalText, meta); // ephemeral chats are purged on restart / new chat
  emit({ type: 'final', text: finalText, messageId: id, meta });
  return { text: finalText, meta };
}

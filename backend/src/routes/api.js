import express from 'express';
import { z } from 'zod';
import { wrap } from '../middleware/errors.js';
import { getSettings, updateSettings, DEFAULTS } from '../services/settings.js';
import * as conv from '../services/conversations.js';
import * as approvals from '../services/approvals.js';
import * as insights from '../services/insights.js';
import { listAudit } from '../services/audit.js';
import { runTurn } from '../orchestrator/index.js';
import { ollamaStatus } from '../services/llm.js';
import { googleStatus, buildAuthUrl, handleCallback, disconnectGoogle } from '../integrations/google.js';
import { githubConfigured } from '../integrations/github.js';
import { whisperStatus, transcribe } from '../voice/transcribe.js';
import { listMcpTools, callMcpTool } from '../mcp/client.js';
import { toolByName } from '../tools/index.js';
import { getDb } from '../database/db.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { httpError } from '../security/paths.js';
import { geocode } from '../integrations/weather.js';
import { MCP_SERVER_INFO } from '../mcp/server.js';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';

export const api = express.Router();

async function status() {
  const [llm, whisper] = await Promise.all([ollamaStatus(), whisperStatus()]);
  // Keep 'ollama' key for frontend compatibility, but now it reflects Gemini
  return { ollama: llm, whisper, google: googleStatus(), github: { configured: githubConfigured() }, mcp: { endpoint: '/mcp', protocol: LATEST_PROTOCOL_VERSION, transport: 'streamable-http', tools: toolByName.size }, approvedDirs: config.approvedDirs.length };
}
api.get('/bootstrap', wrap(async (req, res) => res.json({ csrfToken: req.csrfToken, settings: getSettings(), status: await status() })));
api.get('/status', wrap(async (req, res) => res.json(await status())));

api.get('/settings', (req, res) => res.json(getSettings()));
api.patch('/settings', (req, res) => {
  const body = z.object({
    timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }, 'Invalid timezone'),
    location: z.string().max(100), model: z.string().min(1).max(80), think: z.boolean(), speakReplies: z.boolean(), voiceName: z.string().max(200),
    speechRate: z.number().min(0.5).max(2), speechPitch: z.number().min(0).max(2), speechVolume: z.number().min(0).max(1), reviewTranscript: z.boolean(),
    readSensitiveAloud: z.boolean(), theme: z.enum(['dark', 'light']), saveHistory: z.boolean(), retentionDays: z.number().int().min(0).max(3650), insightsConsent: z.boolean(), userName: z.string().max(60),
  }).partial().strict().parse(req.body);
  res.json(updateSettings(body));
});

// Conversations
api.get('/conversations', (req, res) => res.json(conv.listConversations(req.sessionId, typeof req.query.q === 'string' ? req.query.q : undefined)));
api.post('/conversations', (req, res) => { const s = getSettings(); res.json(conv.createConversation(req.sessionId, { saveHistory: s.saveHistory })); });
api.get('/conversations/:id/messages', (req, res) => { const c = conv.getConversation(req.sessionId, req.params.id); res.json({ conversation: c, messages: conv.getMessages(c.id) }); });
api.patch('/conversations/:id', (req, res) => res.json(conv.patchConversation(req.sessionId, req.params.id, z.object({ title: z.string().max(120), saveHistory: z.boolean(), includeInInsights: z.boolean() }).partial().parse(req.body))));
api.delete('/conversations/:id', (req, res) => { conv.deleteConversation(req.sessionId, req.params.id); res.json({ ok: true }); });

// Chat (Server-Sent Events)
const inFlight = new Set();
api.post('/chat', wrap(async (req, res) => {
  const { conversationId, text } = z.object({ conversationId: z.string().min(1), text: z.string().trim().min(1).max(4000) }).parse(req.body);
  conv.getConversation(req.sessionId, conversationId);
  if (inFlight.has(conversationId)) throw httpError(409, 'Nexus is still answering the previous message.', 'busy');
  inFlight.add(conversationId);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ac.abort(); });
  const send = (ev) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(ev)}\n\n`); };
  try { await runTurn({ sessionId: req.sessionId, conversationId, text, emit: send, signal: ac.signal }); }
  catch (e) { if (e.name !== 'AbortError') logger.error('chat turn failed', { message: e.message, code: e.code }); if (e.name !== 'AbortError') send({ type: 'error', message: e.expose || e.status ? e.message : 'Something went wrong while answering.', code: e.code }); }
  finally { inFlight.delete(conversationId); send({ type: 'done' }); res.end(); }
}));

// Approvals
api.get('/actions', (req, res) => res.json(approvals.listForSession(req.sessionId, typeof req.query.status === 'string' ? req.query.status : undefined)));
api.get('/actions/:id', (req, res) => res.json(approvals.get(req.sessionId, req.params.id)));
api.patch('/actions/:id', (req, res) => res.json(approvals.edit(req.sessionId, req.params.id, req.body?.payload)));
api.post('/actions/:id/approve', wrap(async (req, res) => {
  const { hash, execute } = z.object({ hash: z.string().min(10), execute: z.boolean().default(true) }).parse(req.body);
  approvals.approve(req.sessionId, req.params.id, hash);
  res.json(execute ? await approvals.execute(req.sessionId, req.params.id) : approvals.get(req.sessionId, req.params.id));
}));
api.post('/actions/:id/cancel', (req, res) => res.json(approvals.cancel(req.sessionId, req.params.id)));
api.get('/audit', (req, res) => res.json(listAudit(100)));

// Tools via MCP (used by UI pages). The same MCP path the orchestrator uses.
api.get('/mcp/tools', wrap(async (req, res) => res.json({ server: MCP_SERVER_INFO, protocol: LATEST_PROTOCOL_VERSION, tools: (await listMcpTools({ sessionId: req.sessionId })).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations })) })));
api.post('/tools/:name', wrap(async (req, res) => {
  if (!toolByName.has(req.params.name)) throw httpError(404, 'Unknown tool.');
  const r = await callMcpTool({ sessionId: req.sessionId, conversationId: req.body?.conversationId }, req.params.name, req.body?.args ?? {});
  if (r.pendingActions === undefined && r.data?.pendingActions) r.pendingActionsView = r.data.pendingActions.map((a) => approvals.get(req.sessionId, a.id));
  res.json(r);
}));
api.get('/geocode', wrap(async (req, res) => res.json(await geocode(z.string().min(2).max(80).parse(req.query.q)))));


// Integrations
api.get('/auth/google/url', (req, res) => res.json({ url: buildAuthUrl(req.sessionId) }));
api.delete('/auth/google', (req, res) => { disconnectGoogle(); res.json({ ok: true }); });

// Insights & memory & data controls
api.get('/insights', wrap(async (req, res) => {
  const days = Number(req.query.days) === 1 ? 1 : 7;
  if (req.query.auto !== 'false') {
    try { await insights.autoUpdateInsightsIfNeeded(days); } catch { /* non-blocking */ }
  }
  const analysis = await insights.getMultiDimensionalAnalysis(days);
  res.json({
    analysis,
    insights: insights.listInsights(),
    stats: insights.topicStats(days),
    moods: insights.listMoods(days),
    consent: getSettings().insightsConsent,
    minMessages: insights.MIN_MESSAGES,
    periodDays: days
  });
}));
api.post('/insights/generate', wrap(async (req, res) => res.json(await insights.generateInsights({ days: Number(req.body?.days) || 30 }))));
api.post('/insights/mood', (req, res) => { const b = z.object({ mood: z.number().int().min(1).max(5), note: z.string().max(300).optional() }).parse(req.body); res.json({ id: insights.addMood(b.mood, b.note) }); });
api.patch('/insights/:id', (req, res) => {
  const b = z.object({ feedback: z.enum(['accurate', 'not_accurate', 'useful', 'not_useful']).optional(), dismissed: z.boolean().optional(), text: z.string().max(400).optional() }).parse(req.body);
  const db = getDb();
  if (b.feedback) db.prepare('UPDATE insights SET feedback=? WHERE id=?').run(b.feedback, req.params.id);
  if (b.dismissed !== undefined) db.prepare('UPDATE insights SET dismissed=? WHERE id=?').run(b.dismissed ? 1 : 0, req.params.id);
  if (b.text) db.prepare("UPDATE insights SET text=?, origin='user_corrected' WHERE id=?").run(b.text, req.params.id);
  res.json({ ok: true });
});
api.delete('/insights', (req, res) => { insights.deleteAllInsights(); res.json({ ok: true }); });
api.get('/insights/export', (req, res) => { res.set('Content-Disposition', 'attachment; filename="nexus-insights.json"'); res.json(insights.exportAll()); });
api.get('/memories', (req, res) => res.json(getDb().prepare('SELECT * FROM memories ORDER BY created_at DESC').all()));
api.patch('/memories/:id', (req, res) => { getDb().prepare('UPDATE memories SET content=? WHERE id=?').run(z.string().min(1).max(300).parse(req.body?.content), req.params.id); res.json({ ok: true }); });
api.delete('/memories/:id', (req, res) => { getDb().prepare('DELETE FROM memories WHERE id=?').run(req.params.id); res.json({ ok: true }); });
api.delete('/data/conversations', (req, res) => { getDb().prepare('DELETE FROM conversations WHERE session_id=?').run(req.sessionId); res.json({ ok: true }); });

// Voice
api.get('/voice/status', wrap(async (req, res) => res.json(await whisperStatus())));
api.post('/voice/transcribe', express.raw({ type: () => true, limit: '25mb' }), wrap(async (req, res) => res.json(await transcribe(req.body, req.get('content-type'), typeof req.query.language === 'string' ? req.query.language : undefined))));

export async function googleCallback(req, res) {
  const front = (req.get('host') && (process.env.RENDER || config.isProd))
    ? `${req.protocol}://${req.get('host')}`
    : config.FRONTEND_ORIGIN;
  try {
    if (req.query.error) {
      logger.warn('Google OAuth error from provider', { error: req.query.error });
      return res.redirect(`${front}/settings?google=denied`);
    }
    const currentCallbackUri = `${req.protocol}://${req.get('host')}${req.path}`;
    await handleCallback(String(req.query.code ?? ''), String(req.query.state ?? ''), currentCallbackUri);
    res.redirect(`${front}/settings?google=connected`);
  } catch (err) {
    logger.error('Google OAuth callback failed', { message: err.message, stack: err.stack });
    res.redirect(`${front}/settings?google=error`);
  }
}

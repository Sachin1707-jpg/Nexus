import express from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { logger } from './logger.js';
import { openDb, getDb } from './database/db.js';
import { registerAllActions } from './tools/actions.js';
import { sessionMiddleware, csrfGuard } from './security/session.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { mcpHandler, mcpMethodNotAllowed } from './mcp/server.js';
import { api, googleCallback } from './routes/api.js';
import { purgeOlderThan } from './services/conversations.js';
import { getSettings } from './services/settings.js';
import { recoverInterruptedActions } from './services/approvals.js';

export function createApp() {
  registerAllActions();
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' }); next(); });

  // MCP: Streamable HTTP, bearer-token protected, own body parsing.
  app.post('/mcp', express.json({ limit: '2mb' }), mcpHandler);
  app.all('/mcp', mcpMethodNotAllowed);

  app.use((req, res, next) => { // CORS for the configured frontend only
    const o = req.get('origin');
    if (o && o === config.FRONTEND_ORIGIN) { res.set({ 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, X-Nexus-CSRF', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', Vary: 'Origin' }); }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(cookieParser());
  // General API limiter: 600 req/min per IP (generous for local dev; tighten in prod behind a reverse proxy)
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }));
  // Chat-specific limiter: 60 turns/min per IP.
  // In dev (NODE_ENV !== 'production') skip loopback so tests and local UI don't exhaust the bucket.
  const skipLoopbackInDev = (req) => config.NODE_ENV !== 'production' && (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1');
  app.use('/api/chat', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false, skip: skipLoopbackInDev }));
  app.get('/api/auth/google/callback', googleCallback);
  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.use('/api', express.json({ limit: '2mb' }), sessionMiddleware, csrfGuard, api);

  const dist = path.join(config.root, 'frontend', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api|mcp).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export function startServer() {
  openDb();
  const db = getDb();
  const eph = db.prepare('DELETE FROM conversations WHERE save_history=0').run().changes;
  const old = purgeOlderThan(getSettings().retentionDays);
  const interrupted = recoverInterruptedActions();
  if (eph || old || interrupted) logger.info('startup cleanup', { ephemeralRemoved: eph, retentionRemoved: old, interruptedActions: interrupted });
  const app = createApp();
  return app.listen(config.PORT, config.HOST, () => {
    logger.info(`Nexus listening on http://${config.HOST}:${config.PORT}`, { model: config.GROQ_MODEL || config.OLLAMA_MODEL });
    if (!config.hasCustomMcpToken) logger.warn('external MCP clients need a stable MCP_AUTH_TOKEN in .env; this one changes on every restart.');
  });
}
import { fileURLToPath } from 'node:url';
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startServer();

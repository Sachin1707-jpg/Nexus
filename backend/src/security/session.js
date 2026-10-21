import crypto from 'node:crypto';
import { getDb } from '../database/db.js';
import { config } from '../config.js';
import { httpError } from './paths.js';
import { safeEqual } from './crypto.js';

const COOKIE = 'nexus_sid';
const csrfFor = (sid) => crypto.createHmac('sha256', config.SESSION_SECRET).update(sid).digest('hex');

export function sessionMiddleware(req, res, next) {
  const db = getDb();
  let sid = req.cookies?.[COOKIE];
  const now = new Date().toISOString();
  let row = sid && db.prepare('SELECT id FROM sessions WHERE id=?').get(sid);
  if (!row) {
    sid = crypto.randomUUID();
    db.prepare('INSERT INTO sessions (id,created_at,last_seen) VALUES (?,?,?)').run(sid, now, now);
    res.cookie(COOKIE, sid, { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 30 * 864e5, path: '/' });
  } else {
    db.prepare('UPDATE sessions SET last_seen=? WHERE id=?').run(now, sid);
  }
  req.sessionId = sid;
  req.csrfToken = csrfFor(sid);
  next();
}

/** CSRF + Origin check for state-changing requests. */
export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  const allowed = [config.FRONTEND_ORIGIN, `http://${config.HOST}:${config.PORT}`, `http://localhost:${config.PORT}`];
  if (origin && !allowed.includes(origin)) return next(httpError(403, 'Origin not allowed.'));
  const token = req.get('x-nexus-csrf');
  if (!token || !safeEqual(token, req.csrfToken)) return next(httpError(403, 'Missing or invalid CSRF token.'));
  next();
}

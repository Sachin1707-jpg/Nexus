import crypto from 'node:crypto';
import { config } from '../config.js';
import { loadToken, saveToken, deleteToken } from '../services/tokens.js';
import { httpError } from '../security/paths.js';
import { logger } from '../logger.js';

export const SCOPES = [
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/userinfo.email',
];
const pendingStates = new Map();

export const googleConfigured = () => Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);

export function buildAuthUrl(sessionId) {
  if (!googleConfigured()) throw httpError(400, 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.', 'google_not_configured');
  const rand = crypto.randomBytes(16).toString('hex');
  const secret = config.SESSION_SECRET || 'nexus_session_secret';
  const sig = crypto.createHmac('sha256', secret).update(`${rand}:${sessionId}`).digest('hex');
  const state = `${rand}.${sessionId}.${sig}`;
  pendingStates.set(state, { sessionId, at: Date.now(), redirectUri: config.GOOGLE_REDIRECT_URI });
  for (const [k, v] of pendingStates) if (Date.now() - v.at > 10 * 60e3) pendingStates.delete(k);
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID, redirect_uri: config.GOOGLE_REDIRECT_URI, response_type: 'code',
    scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', state,
  }).toString();
  return u.toString();
}

export async function handleCallback(code, state, callbackUri) {
  let s = pendingStates.get(state);
  if (s) {
    pendingStates.delete(state);
  } else if (state && typeof state === 'string') {
    const parts = state.split('.');
    if (parts.length === 3) {
      const [rand, sessionId, sig] = parts;
      const secret = config.SESSION_SECRET || 'nexus_session_secret';
      const expected = crypto.createHmac('sha256', secret).update(`${rand}:${sessionId}`).digest('hex');
      try {
        if (crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
          s = { sessionId, at: Date.now(), redirectUri: config.GOOGLE_REDIRECT_URI };
        }
      } catch { /* invalid hex format */ }
    }
  }
  if (!s) throw httpError(400, 'Invalid or expired OAuth state.', 'bad_state');

  const redirectUri = s.redirectUri || config.GOOGLE_REDIRECT_URI || callbackUri;
  const tok = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  const info = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json()).catch(() => ({}));
  saveToken('google', { ...tok, expires_at: Date.now() + (tok.expires_in - 60) * 1000, email: info.email ?? null });
  logger.info('Google OAuth connected successfully', { email: info.email });
  return info.email ?? null;
}

async function tokenRequest(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.GOOGLE_CLIENT_ID, client_secret: config.GOOGLE_CLIENT_SECRET, ...params }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    logger.error('Google token exchange failed', { status: r.status, error: j.error, description: j.error_description });
    throw httpError(401, `Google sign-in failed (${j.error ?? r.status}): ${j.error_description ?? ''}. Please reconnect Google in Settings.`, 'google_auth');
  }
  return j;
}

export function googleStatus() {
  const t = loadToken('google');
  return { configured: googleConfigured(), connected: Boolean(t), email: t?.email ?? null };
}
export const disconnectGoogle = () => deleteToken('google');

async function accessToken() {
  const t = loadToken('google');
  if (!t) throw httpError(401, 'Google is not connected. Connect it in Settings → Integrations.', 'google_not_connected');
  if (Date.now() < t.expires_at) return t.access_token;
  if (!t.refresh_token) throw httpError(401, 'Google session expired. Please reconnect.', 'google_expired');
  const n = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
  saveToken('google', { ...t, ...n, refresh_token: t.refresh_token, expires_at: Date.now() + (n.expires_in - 60) * 1000 });
  return n.access_token;
}

/** Authenticated Google API request with consistent errors. */
export async function gfetch(url, { method = 'GET', body, query } = {}) {
  const u = new URL(url);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) u.searchParams.set(k, v);
  const token = await accessToken();
  let r;
  try {
    r = await fetch(u, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch { throw httpError(502, 'Could not reach Google. Check your internet connection.', 'google_network'); }
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) throw httpError(401, 'Google authorization expired. Please reconnect Google.', 'google_expired');
    if (r.status === 403) throw httpError(403, 'Google denied this request. A required permission or API may be missing (enable the Tasks/Calendar/Gmail API and re-consent).', 'google_forbidden');
    if (r.status === 404) throw httpError(404, 'That item was not found in Google.', 'google_not_found');
    throw httpError(502, `Google API error (${r.status}).`, 'google_api');
  }
  return j;
}

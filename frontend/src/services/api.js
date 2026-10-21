let csrf = '';
export const setCsrf = (t) => { csrf = t; };

export class ApiError extends Error { constructor(message, status, code) { super(message); this.status = status; this.code = code; } }

export async function api(path, { method = 'GET', body, raw } = {}) {
  let r;
  try {
    r = await fetch(`/api${path}`, { method, credentials: 'include', headers: { ...(raw ? {} : body ? { 'Content-Type': 'application/json' } : {}), 'X-Nexus-CSRF': csrf }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  } catch { throw new ApiError('Cannot reach the Nexus server. Is it running?', 0, 'offline'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(data.error ?? `Request failed (${r.status})`, r.status, data.code);
  return data;
}
export const callTool = (name, args = {}, conversationId) => api(`/tools/${name}`, { method: 'POST', body: { args, conversationId } });

/** Streams a chat turn over SSE. Calls onEvent for each event. */
export async function streamChat(conversationId, text, onEvent, signal) {
  const r = await fetch('/api/chat', { method: 'POST', credentials: 'include', signal, headers: { 'Content-Type': 'application/json', 'X-Nexus-CSRF': csrf }, body: JSON.stringify({ conversationId, text }) });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new ApiError(d.error ?? 'Request failed', r.status, d.code); }
  const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); if (chunk.startsWith('data: ')) onEvent(JSON.parse(chunk.slice(6))); }
  }
}

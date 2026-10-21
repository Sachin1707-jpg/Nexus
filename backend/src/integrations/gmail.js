import { gfetch } from './google.js';
const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

const header = (m, n) => m.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? '';
function bodyText(payload) {
  if (!payload) return '';
  const dec = (d) => Buffer.from(d.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  if (payload.mimeType === 'text/plain' && payload.body?.data) return dec(payload.body.data);
  for (const p of payload.parts ?? []) { const t = bodyText(p); if (t) return t; }
  if (payload.mimeType === 'text/html' && payload.body?.data) return dec(payload.body.data).replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return '';
}
export async function searchEmails({ query, max = 10 }) {
  const j = await gfetch(`${BASE}/messages`, { query: { q: query, maxResults: Math.min(max, 25) } });
  const out = [];
  for (const m of j.messages ?? []) {
    const d = await gfetch(`${BASE}/messages/${m.id}`, { query: { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] } });
    out.push({ id: m.id, threadId: m.threadId, from: header(d, 'from'), subject: header(d, 'subject'), date: header(d, 'date'), snippet: d.snippet });
  }
  return out;
}
export async function readThread(threadId) {
  const t = await gfetch(`${BASE}/threads/${threadId}`, { query: { format: 'full' } });
  return (t.messages ?? []).map((m) => ({ id: m.id, from: header(m, 'from'), to: header(m, 'to'), subject: header(m, 'subject'), date: header(m, 'date'), body: bodyText(m.payload).slice(0, 8000) }));
}
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export const validEmail = (s) => EMAIL.test(s);

function mime({ to, subject, body, cc }) {
  const enc = (s) => /[^\x20-\x7e]/.test(s) ? `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=` : s;
  for (const v of [to, subject, cc ?? '']) if (/[\r\n]/.test(v)) throw new Error('Invalid header value.');
  const lines = [`To: ${to}`, ...(cc ? [`Cc: ${cc}`] : []), `Subject: ${enc(subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', Buffer.from(body, 'utf8').toString('base64')];
  return Buffer.from(lines.join('\r\n')).toString('base64url');
}
export async function createDraft({ to, subject, body, cc }) {
  const d = await gfetch(`${BASE}/drafts`, { method: 'POST', body: { message: { raw: mime({ to, subject, body, cc }) } } });
  const check = await gfetch(`${BASE}/drafts/${d.id}`);
  if (!check?.id) throw new Error('Verification failed: draft not found.');
  return { draftId: d.id };
}
export async function sendEmail({ to, subject, body, cc }) {
  const s = await gfetch(`${BASE}/messages/send`, { method: 'POST', body: { raw: mime({ to, subject, body, cc }) } });
  const check = await gfetch(`${BASE}/messages/${s.id}`, { query: { format: 'metadata' } });
  if (!check.labelIds?.includes('SENT')) throw new Error('Verification failed: message is not in Sent.');
  return { messageId: s.id, threadId: s.threadId };
}

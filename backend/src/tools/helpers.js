import { getSettings } from '../services/settings.js';
export const tz = () => getSettings().timezone;
export const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
export function fuzzyMatch(items, query, getText) {
  const q = norm(query); if (!q) return [];
  const qw = q.split(' ').filter((w) => w.length > 1);
  return items.map((it) => { const t = norm(getText(it)); const score = t === q ? 100 : t.includes(q) ? 80 : qw.length ? (qw.filter((w) => t.includes(w)).length / qw.length) * 60 : 0; return { it, score }; })
    .filter((x) => x.score >= 40).sort((a, b) => b.score - a.score).map((x) => x.it);
}
export const ok = (data, summary) => ({ ok: true, data, ...(summary ? { summary } : {}) });
export const ask = (question, extra = {}) => ({ ok: false, needsClarification: true, question, ...extra });
export const fail = (error) => ({ ok: false, error });
export const DATE = /^\d{4}-\d{2}-\d{2}$/; export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

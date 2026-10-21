export const fmtBytes = (n) => { if (n == null) return '—'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (n >= 1024 && i < 4) { n /= 1024; i++; } return `${n.toFixed(i > 1 ? 1 : 0)} ${u[i]}`; };
export const todayStr = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
export const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
export const fmtDate = (s) => new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtTime = (iso) => iso && iso.length > 10 ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'All day';
export const weekStart = (s) => { const [y, m, d] = s.split('-').map(Number); const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return addDays(s, -((dow + 6) % 7)); };

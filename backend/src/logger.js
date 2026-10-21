const SENSITIVE = /(token|secret|authorization|password|cookie|api[_-]?key|body|content|snippet)/i;

export function redact(value, depth = 0) {
  if (depth > 4) return '[depth]';
  if (value == null) return value;
  if (typeof value === 'string') return value.length > 200 ? value.slice(0, 200) + '…' : value;
  if (Array.isArray(value)) return value.slice(0, 10).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE.test(k) ? '[redacted]' : redact(v, depth + 1);
    return out;
  }
  return value;
}

function log(level, msg, meta) {
  const line = { t: new Date().toISOString(), level, msg, ...(meta ? { meta: redact(meta) } : {}) };
  (level === 'error' ? console.error : console.log)(JSON.stringify(line));
}
export const logger = {
  info: (m, x) => log('info', m, x),
  warn: (m, x) => log('warn', m, x),
  error: (m, x) => log('error', m, x),
};

import path from 'node:path';
import fs from 'node:fs';

/** Resolve target and ensure it is inside one of the approved roots (after symlink resolution). */
export function resolveInside(target, roots) {
  if (!roots.length) throw httpError(403, 'No approved directories are configured. Add APPROVED_DIRS to .env (semicolon separated).');
  if (typeof target !== 'string' || target.includes('\0')) throw httpError(400, 'Invalid path.');
  const abs = path.resolve(target);
  let real;
  try { real = fs.realpathSync(abs); } catch { real = abs; }
  for (const r of roots) {
    let root; try { root = fs.realpathSync(path.resolve(r)); } catch { root = path.resolve(r); }
    const rel = path.relative(root, real);
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return real;
  }
  throw httpError(403, 'That path is outside the approved directories.');
}
export function httpError(status, message, code) {
  const e = new Error(message); e.status = status; e.code = code; e.expose = true; return e;
}

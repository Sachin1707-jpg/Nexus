import { getDb } from '../database/db.js';
/** Safe audit: records type/outcome and a short non-sensitive detail only. */
export function audit({ sessionId, actionId, type, outcome, detail }) {
  getDb().prepare('INSERT INTO audit_log (at,session_id,action_id,type,outcome,detail) VALUES (?,?,?,?,?,?)')
    .run(new Date().toISOString(), sessionId ?? null, actionId ?? null, type, outcome, detail ? String(detail).slice(0, 200) : null);
}
export const listAudit = (n = 50) => getDb().prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(n);

import { getDb } from '../database/db.js';
import { config } from '../config.js';
import { randomId, sha256 } from '../security/crypto.js';
import { httpError } from '../security/paths.js';
import { audit } from './audit.js';

/** Registry: type -> { schema, describe(payload) => {title, lines, consequence}, execute(payload) => result }. */
const registry = new Map();
export function registerAction(type, def) { registry.set(type, def); }
export const hasAction = (t) => registry.has(t);

const canonical = (o) => JSON.stringify(o, Object.keys(o).sort());
const stable = (v) => JSON.stringify(v, (k, val) => (val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : val));
export const hashPayload = (type, payload) => sha256(type + stable(payload));

const view = (row) => row && ({
  id: row.id, type: row.type, conversationId: row.conversation_id, summary: row.summary,
  payload: JSON.parse(row.payload), createdAt: row.created_at, expiresAt: row.expires_at,
  approvalStatus: row.approval_status, executionStatus: row.execution_status,
  result: row.result ? JSON.parse(row.result) : null, error: row.error,
  preview: describeSafe(row.type, JSON.parse(row.payload)),
});
function describeSafe(type, payload) { try { return registry.get(type).describe(payload); } catch { return { title: type, lines: [], consequence: '' }; } }

export function propose({ sessionId, conversationId, type, payload }) {
  const def = registry.get(type);
  if (!def) throw httpError(400, `Unknown action type: ${type}`);
  const clean = def.schema.parse(payload);
  const id = randomId(); const now = new Date();
  const d = def.describe(clean);
  getDb().prepare(`INSERT INTO pending_actions (id,session_id,conversation_id,type,payload,payload_hash,summary,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, sessionId, conversationId ?? null, type, JSON.stringify(clean), hashPayload(type, clean), d.title, now.toISOString(), new Date(now.getTime() + config.APPROVAL_TTL_MINUTES * 60e3).toISOString());
  audit({ sessionId, actionId: id, type, outcome: 'proposed' });
  return get(sessionId, id);
}
function row(sessionId, id) {
  const r = getDb().prepare('SELECT * FROM pending_actions WHERE id=?').get(id);
  if (!r || r.session_id !== sessionId) throw httpError(404, 'Action not found.'); // cross-session looks like not found
  if (r.approval_status === 'pending' && new Date(r.expires_at) < new Date()) {
    getDb().prepare("UPDATE pending_actions SET approval_status='expired' WHERE id=?").run(id);
    r.approval_status = 'expired';
  }
  return r;
}
export const get = (sessionId, id) => view(row(sessionId, id));
export const listForSession = (sessionId, status) => getDb().prepare(`SELECT * FROM pending_actions WHERE session_id=? ${status ? 'AND approval_status=?' : ''} ORDER BY created_at DESC LIMIT 50`).all(...(status ? [sessionId, status] : [sessionId])).map((r) => view(row(sessionId, r.id)));

/** Edit payload: re-validates, resets any approval, recalculates the hash. */
export function edit(sessionId, id, newPayload) {
  const r = row(sessionId, id);
  if (r.execution_status !== 'not_started' || !['pending', 'approved'].includes(r.approval_status)) throw httpError(409, 'This action can no longer be edited.');
  const def = registry.get(r.type);
  const clean = def.schema.parse(newPayload);
  getDb().prepare("UPDATE pending_actions SET payload=?, payload_hash=?, summary=?, approval_status='pending', approved_hash=NULL, expires_at=? WHERE id=?")
    .run(JSON.stringify(clean), hashPayload(r.type, clean), def.describe(clean).title, new Date(Date.now() + config.APPROVAL_TTL_MINUTES * 60e3).toISOString(), id);
  audit({ sessionId, actionId: id, type: r.type, outcome: 'edited_approval_reset' });
  return get(sessionId, id);
}
/** Approve exactly the payload the user saw (client sends hash of what was displayed). */
export function approve(sessionId, id, seenHash) {
  const r = row(sessionId, id);
  if (r.approval_status === 'expired') throw httpError(410, 'This approval request has expired. Ask Nexus to prepare it again.', 'expired');
  if (r.approval_status !== 'pending') throw httpError(409, `This action is already ${r.approval_status}.`);
  if (r.payload_hash !== seenHash) throw httpError(409, 'The proposed action changed after you reviewed it. Please review it again.', 'payload_changed');
  getDb().prepare("UPDATE pending_actions SET approval_status='approved', approved_hash=? WHERE id=? AND approval_status='pending'").run(r.payload_hash, id);
  audit({ sessionId, actionId: id, type: r.type, outcome: 'approved' });
  return get(sessionId, id);
}
export function cancel(sessionId, id) {
  const r = row(sessionId, id);
  if (r.execution_status !== 'not_started') throw httpError(409, 'Already executed or running.');
  getDb().prepare("UPDATE pending_actions SET approval_status='cancelled' WHERE id=?").run(id);
  audit({ sessionId, actionId: id, type: r.type, outcome: 'cancelled' });
  return get(sessionId, id);
}
/** Execute exactly once, only if approved hash == current hash. Verification happens inside def.execute (throws on failure). */
export async function execute(sessionId, id) {
  const db = getDb();
  const r = row(sessionId, id);
  if (r.approval_status !== 'approved') throw httpError(403, 'This action has not been approved.', 'not_approved');
  if (new Date(r.expires_at) < new Date()) { db.prepare("UPDATE pending_actions SET approval_status='expired' WHERE id=?").run(id); throw httpError(410, 'Approval expired.', 'expired'); }
  const payload = JSON.parse(r.payload);
  if (r.approved_hash !== hashPayload(r.type, payload) || r.approved_hash !== r.payload_hash) throw httpError(409, 'Payload changed since approval.', 'payload_changed');
  const def = registry.get(r.type);
  def.schema.parse(payload); // revalidate
  const claim = db.prepare("UPDATE pending_actions SET execution_status='running' WHERE id=? AND execution_status='not_started'").run(id);
  if (claim.changes !== 1) throw httpError(409, 'This action was already executed.', 'duplicate');
  try {
    const result = await def.execute(payload, { sessionId });
    db.prepare("UPDATE pending_actions SET execution_status='succeeded', result=? WHERE id=?").run(JSON.stringify(result ?? {}), id);
    audit({ sessionId, actionId: id, type: r.type, outcome: 'succeeded' });
  } catch (e) {
    db.prepare("UPDATE pending_actions SET execution_status='failed', error=? WHERE id=?").run(String(e.message).slice(0, 300), id);
    audit({ sessionId, actionId: id, type: r.type, outcome: 'failed', detail: e.message });
  }
  return get(sessionId, id);
}

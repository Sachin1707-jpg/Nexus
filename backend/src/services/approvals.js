import { getDb } from '../database/db.js';
import { config } from '../config.js';
import { randomId, sha256 } from '../security/crypto.js';
import { httpError } from '../security/paths.js';
import { audit } from './audit.js';

/** Registry: type -> { schema, describe(payload) => {title, lines, consequence}, execute(payload) => result }. */
const registry = new Map();
export function registerAction(type, def) { registry.set(type, def); }
export const hasAction = (t) => registry.has(t);

const stable = (v) => JSON.stringify(v, (k, val) => (val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : val));
export const hashPayload = (type, payload) => sha256(type + stable(payload));

export function canAccessSession(callerSessionId, rowSessionId) {
  return rowSessionId === callerSessionId || rowSessionId === 'mcp-external';
}

const view = (row) => row && ({
  id: row.id, type: row.type, conversationId: row.conversation_id, summary: row.summary,
  payload: JSON.parse(row.payload), payloadHash: row.payload_hash, createdAt: row.created_at, expiresAt: row.expires_at,
  approvalStatus: row.approval_status, executionStatus: row.execution_status,
  result: row.result ? JSON.parse(row.result) : null, error: row.error,
  preview: describeSafe(row.type, JSON.parse(row.payload)),
});
function describeSafe(type, payload) {
  try {
    const d = registry.get(type)?.describe(payload);
    if (!d || typeof d !== 'object' || !d.title) throw new Error('Invalid preview');
    return d;
  } catch {
    return { title: type, lines: [], consequence: '', previewFailed: true };
  }
}

export function propose({ sessionId, conversationId, type, payload }) {
  const def = registry.get(type);
  if (!def) throw httpError(400, `Unknown action type: ${type}`);
  const clean = def.schema.parse(payload);
  const pendingCount = getDb().prepare("SELECT COUNT(*) as count FROM pending_actions WHERE session_id=? AND approval_status='pending'").get(sessionId)?.count ?? 0;
  if (pendingCount >= config.APPROVAL_MAX_PENDING) {
    throw httpError(429, `Too many pending approval requests (max ${config.APPROVAL_MAX_PENDING}). Please approve or cancel existing requests before creating new ones.`, 'pending_limit_exceeded');
  }
  let d;
  try {
    d = def.describe(clean);
    if (!d || typeof d !== 'object' || !d.title) throw new Error('Invalid preview returned by descriptor');
  } catch (e) {
    throw httpError(400, `Failed to generate action preview: ${e.message}`, 'preview_generation_failed');
  }
  const id = randomId(); const now = new Date();
  getDb().prepare(`INSERT INTO pending_actions (id,session_id,conversation_id,type,payload,payload_hash,summary,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, sessionId, conversationId ?? null, type, JSON.stringify(clean), hashPayload(type, clean), d.title, now.toISOString(), new Date(now.getTime() + config.APPROVAL_TTL_MINUTES * 60e3).toISOString());
  audit({ sessionId, actionId: id, type, outcome: 'proposed' });
  return get(sessionId, id);
}

function row(sessionId, id) {
  const r = getDb().prepare('SELECT * FROM pending_actions WHERE id=?').get(id);
  if (!r || !canAccessSession(sessionId, r.session_id)) throw httpError(404, 'Action not found.'); // cross-session looks like not found
  if (['pending', 'approved'].includes(r.approval_status) && new Date(r.expires_at) < new Date()) {
    getDb().prepare("UPDATE pending_actions SET approval_status='expired' WHERE id=?").run(id);
    r.approval_status = 'expired';
  }
  return r;
}

export const get = (sessionId, id) => view(row(sessionId, id));

export function listForSession(sessionId, status) {
  const db = getDb();
  if (sessionId === 'mcp-external') {
    const q = `SELECT * FROM pending_actions WHERE session_id = 'mcp-external' ${status ? 'AND approval_status=?' : ''} ORDER BY created_at DESC LIMIT 50`;
    return db.prepare(q).all(...(status ? [status] : [])).map((r) => view(row(sessionId, r.id)));
  }
  const q = `SELECT * FROM pending_actions WHERE session_id IN (?, 'mcp-external') ${status ? 'AND approval_status=?' : ''} ORDER BY created_at DESC LIMIT 50`;
  return db.prepare(q).all(...(status ? [sessionId, status] : [sessionId])).map((r) => view(row(sessionId, r.id)));
}

/** Edit payload: re-validates, resets any approval, recalculates the hash. */
export function edit(sessionId, id, newPayload) {
  let r;
  try {
    r = row(sessionId, id);
    if (r.execution_status !== 'not_started' || !['pending', 'approved'].includes(r.approval_status)) throw httpError(409, 'This action can no longer be edited.');
    const def = registry.get(r.type);
    const clean = def.schema.parse(newPayload);
    let desc;
    try {
      desc = def.describe(clean);
      if (!desc || typeof desc !== 'object' || !desc.title) throw new Error('Invalid preview returned by descriptor');
    } catch (e) {
      throw httpError(400, `Failed to generate action preview: ${e.message}`, 'preview_generation_failed');
    }
    getDb().prepare("UPDATE pending_actions SET payload=?, payload_hash=?, summary=?, approval_status='pending', approved_hash=NULL, expires_at=? WHERE id=?")
      .run(JSON.stringify(clean), hashPayload(r.type, clean), desc.title, new Date(Date.now() + config.APPROVAL_TTL_MINUTES * 60e3).toISOString(), id);
    audit({ sessionId, actionId: id, type: r.type, outcome: 'edited_approval_reset' });
    return get(sessionId, id);
  } catch (e) {
    audit({ sessionId, actionId: id, type: r?.type || 'unknown', outcome: 'edit_failed', detail: e.code || e.message });
    throw e;
  }
}

/** Approve exactly the payload the user saw (client sends hash of what was displayed). */
export function approve(sessionId, id, seenHash) {
  let r;
  try {
    r = row(sessionId, id);
    if (r.approval_status === 'expired') throw httpError(410, 'This approval request has expired. Ask Nexus to prepare it again.', 'expired');
    if (r.approval_status !== 'pending') throw httpError(409, `This action is already ${r.approval_status}.`);
    if (r.payload_hash !== seenHash) throw httpError(409, 'The proposed action changed after you reviewed it. Please review it again.', 'payload_changed');
    const def = registry.get(r.type);
    if (!def) throw httpError(400, `Unknown action type: ${r.type}`);
    try {
      const desc = def.describe(JSON.parse(r.payload));
      if (!desc || typeof desc !== 'object' || !desc.title) throw new Error('Invalid preview');
    } catch {
      throw httpError(400, 'Cannot approve action: preview could not be generated.', 'preview_failed');
    }
    const update = getDb().prepare("UPDATE pending_actions SET approval_status='approved', approved_hash=? WHERE id=? AND approval_status='pending' AND payload_hash=?")
      .run(r.payload_hash, id, seenHash);
    if (update.changes !== 1) throw httpError(409, 'The proposed action changed after you reviewed it. Please review it again.', 'payload_changed');
    audit({ sessionId, actionId: id, type: r.type, outcome: 'approved' });
    return get(sessionId, id);
  } catch (e) {
    audit({ sessionId, actionId: id, type: r?.type || 'unknown', outcome: 'approve_failed', detail: e.code || e.message });
    throw e;
  }
}

export function cancel(sessionId, id) {
  let r;
  try {
    r = row(sessionId, id);
    if (r.execution_status !== 'not_started') throw httpError(409, 'Already executed or running.');
    getDb().prepare("UPDATE pending_actions SET approval_status='cancelled' WHERE id=?").run(id);
    audit({ sessionId, actionId: id, type: r.type, outcome: 'cancelled' });
    return get(sessionId, id);
  } catch (e) {
    audit({ sessionId, actionId: id, type: r?.type || 'unknown', outcome: 'cancel_failed', detail: e.code || e.message });
    throw e;
  }
}

/** Execute exactly once, only if approved hash == current hash. Verification happens inside def.execute (throws on failure). */
export async function execute(sessionId, id) {
  const db = getDb();
  let r;
  try {
    r = row(sessionId, id);
    if (r.approval_status === 'expired' || new Date(r.expires_at) < new Date()) {
      db.prepare("UPDATE pending_actions SET approval_status='expired' WHERE id=?").run(id);
      throw httpError(410, 'Approval expired.', 'expired');
    }
    if (r.approval_status !== 'approved') throw httpError(403, 'This action has not been approved.', 'not_approved');
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
      const isUnverified = /verification failed/i.test(e.message) || e.code === 'verification_failed';
      const status = isUnverified ? 'executed_unverified' : 'failed';
      db.prepare("UPDATE pending_actions SET execution_status=?, error=? WHERE id=?").run(status, String(e.message).slice(0, 300), id);
      audit({ sessionId, actionId: id, type: r.type, outcome: status, detail: e.message });
    }
  } catch (e) {
    audit({ sessionId, actionId: id, type: r?.type || 'unknown', outcome: 'execute_failed', detail: e.code || e.message });
    throw e;
  }
  return get(sessionId, id);
}

export function recoverInterruptedActions() {
  return getDb().prepare("UPDATE pending_actions SET execution_status='interrupted', error='Server restarted while action was executing. Check the service before retrying.' WHERE execution_status='running'").run().changes;
}

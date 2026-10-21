import './setup.js';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { openDb, getDb } from '../src/database/db.js';
import * as A from '../src/services/approvals.js';

let executed = 0; let verifyFails = false; let describeFails = false;
before(() => {
  openDb(':memory:');
  A.registerAction('test.send', {
    schema: z.object({ to: z.string().email(), body: z.string().min(1) }),
    describe: (p) => {
      if (describeFails) throw new Error('Descriptor crash');
      return { title: `Send to ${p.to}`, lines: [p.body], consequence: 'sent' };
    },
    execute: async () => { executed++; if (verifyFails) throw new Error('Verification failed: not in Sent'); return { id: 'm1' }; },
  });
});
const mk = (s = 'S1') => A.propose({ sessionId: s, type: 'test.send', payload: { to: 'a@b.co', body: 'hello' } });

test('execute is refused until approved', async () => {
  const a = mk(); await assert.rejects(() => A.execute('S1', a.id), /not been approved/);
  assert.equal(executed, 0);
});
test('approval with a stale/wrong hash is rejected', () => {
  const a = mk(); assert.throws(() => A.approve('S1', a.id, 'x'.repeat(64)), /changed after you reviewed/);
});
test('editing payload invalidates a previous approval', async () => {
  const a = mk(); const h = a.payloadHash;
  A.approve('S1', a.id, h);
  const e = A.edit('S1', a.id, { to: 'other@b.co', body: 'hello' });
  assert.equal(e.approvalStatus, 'pending');
  await assert.rejects(() => A.execute('S1', a.id), /not been approved/);
  assert.throws(() => A.approve('S1', a.id, h), /changed after/); // old hash useless
});
test('invalid edited payload is rejected by schema', () => {
  const a = mk(); assert.throws(() => A.edit('S1', a.id, { to: 'not-an-email', body: 'x' }));
});
test('cross-session access is denied between non-external sessions', () => {
  const a = mk('S1'); assert.throws(() => A.get('S2', a.id), /not found/i);
  assert.throws(() => A.approve('S2', a.id, a.payloadHash), /not found/i);
});
test('expired approvals fail', async () => {
  const a = mk(); getDb().prepare("UPDATE pending_actions SET expires_at=? WHERE id=?").run(new Date(Date.now() - 1000).toISOString(), a.id);
  assert.throws(() => A.approve('S1', a.id, a.payloadHash), /expired/);
});
test('approved action past expiry cannot execute and shows as expired', async () => {
  const a = mk(); A.approve('S1', a.id, a.payloadHash);
  getDb().prepare("UPDATE pending_actions SET expires_at=? WHERE id=?").run(new Date(Date.now() - 1000).toISOString(), a.id);
  await assert.rejects(() => A.execute('S1', a.id), /expired/);
  assert.equal(A.get('S1', a.id).approvalStatus, 'expired');
});
test('approved action executes exactly once; replay is blocked', async () => {
  const before = executed; const a = mk();
  A.approve('S1', a.id, a.payloadHash);
  const r = await Promise.allSettled([A.execute('S1', a.id), A.execute('S1', a.id)]);
  assert.equal(executed, before + 1);
  assert.equal(r.filter((x) => x.status === 'rejected').length, 1);
  await assert.rejects(() => A.execute('S1', a.id), /already executed/);
  assert.equal(A.get('S1', a.id).executionStatus, 'succeeded');
});
test('failed verification is recorded as executed_unverified, never succeeded', async () => {
  verifyFails = true; const a = mk(); A.approve('S1', a.id, a.payloadHash);
  const r = await A.execute('S1', a.id); verifyFails = false;
  assert.equal(r.executionStatus, 'executed_unverified'); assert.match(r.error, /Verification failed/);
});
test('cancelled actions cannot be approved or executed', async () => {
  const a = mk(); A.cancel('S1', a.id);
  assert.throws(() => A.approve('S1', a.id, a.payloadHash), /already cancelled/);
  await assert.rejects(() => A.execute('S1', a.id), /not been approved/);
});
test('direct DB tampering after approval is detected before execution', async () => {
  const a = mk(); A.approve('S1', a.id, a.payloadHash);
  getDb().prepare('UPDATE pending_actions SET payload=? WHERE id=?').run(JSON.stringify({ to: 'evil@x.co', body: 'x' }), a.id);
  await assert.rejects(() => A.execute('S1', a.id), /Payload changed/);
});
test('audit log never stores payload content', () => {
  const rows = getDb().prepare('SELECT * FROM audit_log').all();
  assert.ok(rows.length > 0); assert.ok(!JSON.stringify(rows).includes('hello'));
});

// Phase 1 new tests
test('owner session can list, view, approve and execute actions proposed by mcp-external', async () => {
  const ext = A.propose({ sessionId: 'mcp-external', type: 'test.send', payload: { to: 'ext@b.co', body: 'from mcp' } });
  assert.ok(ext.payloadHash);
  const list = A.listForSession('S_UI');
  assert.ok(list.some((x) => x.id === ext.id));
  const viewed = A.get('S_UI', ext.id);
  assert.equal(viewed.id, ext.id);
  const approved = A.approve('S_UI', ext.id, ext.payloadHash);
  assert.equal(approved.approvalStatus, 'approved');
  const executedResult = await A.execute('S_UI', ext.id);
  assert.equal(executedResult.executionStatus, 'succeeded');
});

test('pending proposals per session are capped', () => {
  const s = 'S_CAP_TEST';
  for (let i = 0; i < 20; i++) {
    A.propose({ sessionId: s, type: 'test.send', payload: { to: `user${i}@b.co`, body: `msg ${i}` } });
  }
  assert.throws(() => A.propose({ sessionId: s, type: 'test.send', payload: { to: 'user21@b.co', body: 'overflow' } }), /Too many pending/);
});

test('fail closed on preview descriptor errors', () => {
  describeFails = true;
  assert.throws(() => A.propose({ sessionId: 'S1', type: 'test.send', payload: { to: 'fail@b.co', body: 'fail' } }), /preview/i);
  describeFails = false;
});

test('interrupted actions are recovered on startup', () => {
  const a = mk();
  getDb().prepare("UPDATE pending_actions SET execution_status='running' WHERE id=?").run(a.id);
  const recovered = A.recoverInterruptedActions();
  assert.ok(recovered >= 1);
  const updated = A.get('S1', a.id);
  assert.equal(updated.executionStatus, 'interrupted');
  assert.match(updated.error, /restarted/i);
});

test('audit log records failure events for rejected operations', () => {
  const a = mk();
  try { A.approve('S1', a.id, 'badhash1234567890'); } catch {}
  const failures = getDb().prepare("SELECT * FROM audit_log WHERE action_id=? AND outcome='approve_failed'").all(a.id);
  assert.ok(failures.length > 0);
});

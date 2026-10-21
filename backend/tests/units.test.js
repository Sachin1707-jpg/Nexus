import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { resolveRelativeDate, toRfc3339, addDays, offsetFor } from '../src/orchestrator/dates.js';
import { routeMessage } from '../src/orchestrator/router.js';
import { resolveInside } from '../src/security/paths.js';
import { assessOuting } from '../src/integrations/weather.js';
import { scanSource, lineDiff } from '../src/integrations/github.js';
import { redact } from '../src/logger.js';
import { encrypt, decrypt } from '../src/security/crypto.js';
import { fuzzyMatch } from '../src/tools/helpers.js';
import { validEmail } from '../src/integrations/gmail.js';
import { TEST_DIR } from './setup.js';

const NOW = new Date('2026-10-21T10:00:00+05:30'); // Wednesday
const TZ = 'Asia/Kolkata';
test('relative dates: English + Hinglish', () => {
  assert.equal(resolveRelativeDate('Kal assignment submit karna hai', TZ, NOW), '2026-10-22');
  assert.equal(resolveRelativeDate('parso meeting', TZ, NOW), '2026-10-23');
  assert.equal(resolveRelativeDate('tomorrow 3pm', TZ, NOW), '2026-10-22');
  assert.equal(resolveRelativeDate('Friday wali meeting', TZ, NOW), '2026-10-23');
  assert.equal(resolveRelativeDate('next monday', TZ, NOW), '2026-10-26');
  assert.equal(resolveRelativeDate('hello', TZ, NOW), null);
});
test('timezone: day boundary uses the configured zone, not UTC', () => {
  const lateIst = new Date('2026-10-21T23:30:00+05:30'); // still Oct 21 in IST, Oct 21 18:00Z
  assert.equal(resolveRelativeDate('today', TZ, lateIst), '2026-10-21');
  assert.equal(resolveRelativeDate('today', 'Pacific/Auckland', lateIst), '2026-10-22');
  assert.equal(toRfc3339('2026-10-22', '15:00', TZ), '2026-10-22T15:00:00+05:30');
  assert.equal(offsetFor('America/New_York', '2026-07-01'), '-04:00');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
test('router exposes only relevant tool domains', () => {
  assert.deepEqual(routeMessage('Kal assignment submit karna hai, task bana do.').domains.includes('tasks'), true);
  assert.ok(routeMessage('Friday wali meeting ko next Monday shift kar do').domains.includes('calendar'));
  assert.ok(routeMessage('Kal kahin ghoomne jaa sakti hoon?').domains.includes('weather'));
  assert.ok(routeMessage('Mere laptop mein kya problem chal rahi hai?').domains.includes('system'));
  assert.ok(routeMessage('Check my GitHub project for bugs.').domains.includes('github'));
  const s = routeMessage('I am feeling low today. Can we talk?');
  assert.equal(s.support, true); assert.deepEqual(s.domains, []);
  assert.equal(routeMessage('I want to die').crisis, true);
  assert.deepEqual(routeMessage('thanks!').domains, []);
  assert.deepEqual(routeMessage('haan wahi', ['tasks']).domains, ['tasks']);
});
test('path traversal and symlink escape are blocked', () => {
  const root = path.join(TEST_DIR, 'approved'); fs.writeFileSync(path.join(root, 'a.txt'), 'x');
  assert.ok(resolveInside(path.join(root, 'a.txt'), [root]));
  assert.throws(() => resolveInside(path.join(root, '..', 'secret'), [root]), /outside/);
  assert.throws(() => resolveInside('/etc/passwd', [root]), /outside/);
  assert.throws(() => resolveInside(root, []), /approved/);
  const linkTarget = process.platform === 'win32' ? (process.env.SystemRoot || 'C:\\Windows') : '/etc';
  const link = path.join(root, 'link'); try { fs.symlinkSync(linkTarget, link, process.platform === 'win32' ? 'junction' : 'dir'); assert.throws(() => resolveInside(path.join(link, 'passwd'), [root]), /outside/); } catch (e) { if (e.code !== 'EPERM') throw e; }
});
test('weather assessment is derived from forecast data only', () => {
  const mk = (rain, tmax) => ({ daily: [{ date: '2026-10-22', rainProb: rain, tMax: tmax, tMin: 20, windMax: 10, uv: 5 }], hourly: Array.from({ length: 24 }, (_, h) => ({ time: `2026-10-22T${String(h).padStart(2, '0')}:00`, rainProb: h >= 13 && h <= 16 ? 80 : 5, rainMm: 0, wind: 8, temp: 28 })) });
  const a = assessOuting(mk(20, 30), '2026-10-22'); assert.equal(a.level, 'good'); assert.ok(a.window);
  assert.equal(assessOuting(mk(85, 30), '2026-10-22').level, 'poor');
  assert.equal(assessOuting(mk(20, 30), '2026-12-01').available, false);
});
test('github static scan reports file+line and marks possible vs confirmed', () => {
  const f = scanSource('a.js', 'ok()\ntry{x()}catch(e){}\nconst k = eval(s)\nconst api_key = "abcdef1234567890xyz"');
  assert.ok(f.find((x) => x.line === 2 && x.title === 'Empty catch block' && x.status === 'confirmed-pattern'));
  assert.ok(f.find((x) => x.line === 3 && x.title === 'Dynamic code execution'));
  assert.ok(f.find((x) => x.line === 4 && x.status === 'possible'));
  assert.match(lineDiff('a\nb\nc', 'a\nB\nc'), /- b\n\+ B/);
});
test('logger redacts secrets and bodies', () => {
  const r = redact({ authorization: 'Bearer abc', body: 'private email text', nested: { access_token: 'x', ok: 'fine' } });
  assert.equal(r.authorization, '[redacted]'); assert.equal(r.body, '[redacted]'); assert.equal(r.nested.access_token, '[redacted]'); assert.equal(r.nested.ok, 'fine');
});
test('token encryption round-trips and is not plaintext', () => {
  const c = encrypt('refresh-token-123'); assert.ok(!c.includes('refresh')); assert.equal(decrypt(c), 'refresh-token-123');
  assert.throws(() => decrypt(c.slice(0, -4) + 'AAAA'));
});
test('fuzzy matching + email validation', () => {
  const tasks = [{ title: 'Submit DBMS assignment' }, { title: 'Buy milk' }, { title: 'Submit OS assignment' }];
  assert.equal(fuzzyMatch(tasks, 'assignment', (t) => t.title).length, 2); // ambiguous -> caller must ask
  assert.equal(fuzzyMatch(tasks, 'dbms', (t) => t.title).length, 1);
  assert.equal(validEmail('a@b.co'), true); assert.equal(validEmail('faculty coordinator'), false);
  assert.equal(validEmail('x@y.com\nBcc: evil@z.com'), false);
});

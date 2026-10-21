import { getDb } from '../database/db.js';
import { encrypt, decrypt } from '../security/crypto.js';

export function saveToken(provider, obj) {
  getDb().prepare('INSERT INTO integration_tokens (provider,blob,updated_at) VALUES (?,?,?) ON CONFLICT(provider) DO UPDATE SET blob=excluded.blob, updated_at=excluded.updated_at')
    .run(provider, encrypt(JSON.stringify(obj)), new Date().toISOString());
}
export function loadToken(provider) {
  const r = getDb().prepare('SELECT blob FROM integration_tokens WHERE provider=?').get(provider);
  if (!r) return null;
  try { return JSON.parse(decrypt(r.blob)); } catch { return null; }
}
export const deleteToken = (provider) => getDb().prepare('DELETE FROM integration_tokens WHERE provider=?').run(provider);

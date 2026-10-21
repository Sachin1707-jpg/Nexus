import { getDb } from '../database/db.js';
import { config } from '../config.js';

export const DEFAULTS = {
  timezone: config.TIMEZONE,
  location: config.DEFAULT_LOCATION,
  model: config.GEMINI_MODEL || config.OLLAMA_MODEL,
  think: config.think,
  speakReplies: false,
  voiceName: '',
  speechRate: 1,
  speechPitch: 1,
  speechVolume: 1,
  reviewTranscript: true,
  readSensitiveAloud: false,
  theme: 'dark',
  saveHistory: true,
  retentionDays: 0,
  insightsConsent: true,
  userName: '',
};
export function getSettings() {
  const rows = getDb().prepare('SELECT key,value FROM settings').all();
  const out = { ...DEFAULTS };
  for (const r of rows) { try { out[r.key] = JSON.parse(r.value); } catch { /* ignore */ } }
  return out;
}
export function updateSettings(patch) {
  const db = getDb();
  const st = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  for (const [k, v] of Object.entries(patch)) if (k in DEFAULTS) st.run(k, JSON.stringify(v));
  return getSettings();
}

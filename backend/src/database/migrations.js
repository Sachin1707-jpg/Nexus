export const MIGRATIONS = [
  {
    id: 1,
    name: 'core',
    sql: `
    CREATE TABLE sessions (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, last_seen TEXT NOT NULL);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT 'New conversation',
      save_history INTEGER NOT NULL DEFAULT 1, include_in_insights INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL, content TEXT NOT NULL, meta TEXT, created_at TEXT NOT NULL);
    CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at);
    CREATE TABLE memories (
      id TEXT PRIMARY KEY, content TEXT NOT NULL, source_conversation TEXT, created_at TEXT NOT NULL);
    CREATE TABLE pending_actions (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, conversation_id TEXT, type TEXT NOT NULL,
      payload TEXT NOT NULL, payload_hash TEXT NOT NULL, summary TEXT NOT NULL,
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      approval_status TEXT NOT NULL DEFAULT 'pending',
      approved_hash TEXT,
      execution_status TEXT NOT NULL DEFAULT 'not_started',
      result TEXT, error TEXT);
    CREATE TABLE insights (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, text TEXT NOT NULL, origin TEXT NOT NULL,
      period_start TEXT, period_end TEXT, confidence TEXT, evidence TEXT,
      feedback TEXT, dismissed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, session_id TEXT, action_id TEXT,
      type TEXT NOT NULL, outcome TEXT NOT NULL, detail TEXT);
    CREATE TABLE integration_tokens (provider TEXT PRIMARY KEY, blob TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE mood_checkins (id TEXT PRIMARY KEY, mood INTEGER NOT NULL, note TEXT, created_at TEXT NOT NULL);
    `,
  },
];

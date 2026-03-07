import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.CACHE_DB_PATH || path.join(__dirname, '..', '..', 'cache.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// New tables for auth & trips
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    picture TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_login TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trip_name TEXT NOT NULL DEFAULT 'My Trip',
    columns_json TEXT NOT NULL DEFAULT '{}',
    column_order_json TEXT NOT NULL DEFAULT '[]',
    items_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
`);

// Migration: add user_id to existing queries table
try { db.exec('ALTER TABLE queries ADD COLUMN user_id INTEGER REFERENCES users(id)'); } catch { /* already exists */ }

// Migration: add credits column to users table
try { db.exec('ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }

// Credit transactions ledger
db.exec(`
  CREATE TABLE IF NOT EXISTS credit_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    stripe_session_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON credit_transactions(user_id);
`);

export default db;

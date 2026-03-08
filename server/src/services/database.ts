import { Pool } from 'pg';

let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      const url = new URL(dbUrl);
      pool = new Pool({
        host: url.hostname,
        port: parseInt(url.port || '5432', 10),
        database: url.pathname.slice(1),
        user: url.username || undefined,
        password: url.password || undefined,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    } else {
      pool = new Pool({
        host: 'localhost',
        port: 5432,
        database: 'fare_miner',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    }

    pool.on('error', (err) => {
      console.error('Unexpected PostgreSQL pool error:', err);
    });
  }
  return pool;
}

// Default export as a proxy so all existing `import pool from './database.js'` still work
// The pool is created on first use (after dotenv has loaded)
export default new Proxy({} as Pool, {
  get(_target, prop) {
    return (getPool() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export async function initDatabase(): Promise<void> {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        google_id TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        picture TEXT,
        is_admin INTEGER NOT NULL DEFAULT 0,
        role TEXT NOT NULL DEFAULT 'user',
        credits INTEGER NOT NULL DEFAULT 0,
        admin_credits_month TEXT,
        home_port TEXT,
        default_currency TEXT,
        created_at TEXT NOT NULL,
        last_login TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS trips (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        trip_name TEXT NOT NULL DEFAULT 'My Trip',
        columns_json TEXT NOT NULL DEFAULT '{}',
        column_order_json TEXT NOT NULL DEFAULT '[]',
        items_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        sid VARCHAR NOT NULL PRIMARY KEY,
        sess JSON NOT NULL,
        expire TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);

      CREATE TABLE IF NOT EXISTS credit_transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL,
        type TEXT NOT NULL,
        description TEXT,
        stripe_session_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON credit_transactions(user_id);

      CREATE TABLE IF NOT EXISTS queries (
        id SERIAL PRIMARY KEY,
        origin TEXT NOT NULL,
        destination TEXT NOT NULL,
        departure_date TEXT NOT NULL,
        return_date TEXT,
        adults INTEGER NOT NULL,
        non_stop INTEGER NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        cache_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        time_sweep_id TEXT,
        user_id INTEGER REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS results (
        id SERIAL PRIMARY KEY,
        query_id INTEGER NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
        offer_id TEXT NOT NULL,
        airline_code TEXT NOT NULL,
        airline_name TEXT NOT NULL,
        flight_number TEXT NOT NULL,
        origin TEXT NOT NULL,
        destination TEXT NOT NULL,
        departure_at TEXT NOT NULL,
        arrival_at TEXT NOT NULL,
        duration TEXT NOT NULL,
        stops INTEGER NOT NULL,
        stop_codes TEXT NOT NULL,
        total_price REAL NOT NULL,
        price_per_person REAL NOT NULL,
        currency TEXT NOT NULL,
        cabin TEXT NOT NULL,
        return_departure_at TEXT,
        return_arrival_at TEXT,
        return_duration TEXT,
        return_stops INTEGER,
        return_flight_number TEXT,
        return_origin TEXT,
        return_destination TEXT,
        return_stop_codes TEXT,
        segments_json TEXT,
        return_segments_json TEXT
      );
    `);
  } finally {
    client.release();
  }
}

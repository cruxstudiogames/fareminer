import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pool from './database.js';

const PgStore = connectPgSimple(session);

export function createSessionStore(): session.Store {
  return new PgStore({
    pool,
    tableName: 'sessions',
    createTableIfMissing: false, // we create it in initDatabase
  });
}

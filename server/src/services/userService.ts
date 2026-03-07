import db from './database.js';

export interface User {
  id: number;
  google_id: string;
  email: string;
  name: string;
  picture: string | null;
  is_admin: number;
  credits: number;
  created_at: string;
  last_login: string;
}

export function findOrCreateUser(googleId: string, email: string, name: string, picture?: string): User {
  const existing = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId) as User | undefined;

  const now = new Date().toISOString();

  if (existing) {
    db.prepare('UPDATE users SET name = ?, picture = ?, last_login = ? WHERE id = ?')
      .run(name, picture ?? null, now, existing.id);
    return { ...existing, name, picture: picture ?? null, last_login: now };
  }

  // Auto-promote if ADMIN_EMAIL matches
  const isAdmin = process.env.ADMIN_EMAIL && email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase() ? 1 : 0;

  const info = db.prepare(
    'INSERT INTO users (google_id, email, name, picture, is_admin, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(googleId, email, name, picture ?? null, isAdmin, now, now);

  return {
    id: Number(info.lastInsertRowid),
    google_id: googleId,
    email,
    name,
    picture: picture ?? null,
    is_admin: isAdmin,
    credits: 0,
    created_at: now,
    last_login: now,
  };
}

export function getUserById(id: number): User | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

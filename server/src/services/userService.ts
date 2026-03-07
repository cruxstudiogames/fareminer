import db from './database.js';

export type UserRole = 'owner' | 'admin' | 'user';

export interface User {
  id: number;
  google_id: string;
  email: string;
  name: string;
  picture: string | null;
  is_admin: number;
  role: UserRole;
  credits: number;
  admin_credits_month: string | null;
  home_port: string | null;
  default_currency: string | null;
  created_at: string;
  last_login: string;
}

const ADMIN_MONTHLY_CREDITS = 10_000;

function determineRole(email: string): UserRole {
  const ownerEmails = (process.env.OWNER_ACCOUNT || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (ownerEmails.includes(email.toLowerCase())) return 'owner';

  const adminEmails = (process.env.ADMIN_ACCOUNT || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (adminEmails.includes(email.toLowerCase())) return 'admin';

  return 'user';
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7); // e.g. "2026-03"
}

function grantAdminMonthlyCredits(userId: number, currentMonth: string): void {
  db.prepare('UPDATE users SET credits = ?, admin_credits_month = ? WHERE id = ?')
    .run(ADMIN_MONTHLY_CREDITS, currentMonth, userId);

  db.prepare(
    'INSERT INTO credit_transactions (user_id, amount, type, description, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, ADMIN_MONTHLY_CREDITS, 'admin_monthly', `Monthly admin credits for ${currentMonth}`, new Date().toISOString());
}

export function findOrCreateUser(googleId: string, email: string, name: string, picture?: string): User {
  const existing = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId) as User | undefined;
  const now = new Date().toISOString();
  const role = determineRole(email);
  const isAdmin = role === 'owner' || role === 'admin' ? 1 : 0;

  if (existing) {
    db.prepare('UPDATE users SET name = ?, picture = ?, last_login = ?, role = ?, is_admin = ? WHERE id = ?')
      .run(name, picture ?? null, now, role, isAdmin, existing.id);

    const user = { ...existing, name, picture: picture ?? null, last_login: now, role, is_admin: isAdmin };

    // Grant admin monthly credits if not yet granted this month
    if (role === 'admin') {
      const currentMonth = getCurrentMonth();
      if (user.admin_credits_month !== currentMonth) {
        grantAdminMonthlyCredits(user.id, currentMonth);
        user.credits = ADMIN_MONTHLY_CREDITS;
        user.admin_credits_month = currentMonth;
      }
    }

    return user;
  }

  const info = db.prepare(
    'INSERT INTO users (google_id, email, name, picture, is_admin, role, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(googleId, email, name, picture ?? null, isAdmin, role, now, now);

  const userId = Number(info.lastInsertRowid);
  let credits = 0;

  // Grant admin monthly credits on first login
  if (role === 'admin') {
    const currentMonth = getCurrentMonth();
    grantAdminMonthlyCredits(userId, currentMonth);
    credits = ADMIN_MONTHLY_CREDITS;
  }

  return {
    id: userId,
    google_id: googleId,
    email,
    name,
    picture: picture ?? null,
    is_admin: isAdmin,
    role,
    credits,
    admin_credits_month: role === 'admin' ? getCurrentMonth() : null,
    home_port: null,
    default_currency: null,
    created_at: now,
    last_login: now,
  };
}

export function getUserById(id: number): User | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

export function updateUserPreferences(id: number, prefs: { home_port?: string | null; default_currency?: string | null }): void {
  if (prefs.home_port !== undefined) {
    db.prepare('UPDATE users SET home_port = ? WHERE id = ?').run(prefs.home_port || null, id);
  }
  if (prefs.default_currency !== undefined) {
    db.prepare('UPDATE users SET default_currency = ? WHERE id = ?').run(prefs.default_currency || null, id);
  }
}

import pool from './database.js';

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
  return new Date().toISOString().slice(0, 7);
}

async function grantAdminMonthlyCredits(userId: number, currentMonth: string): Promise<void> {
  await pool.query(
    'UPDATE users SET credits = $1, admin_credits_month = $2 WHERE id = $3',
    [ADMIN_MONTHLY_CREDITS, currentMonth, userId]
  );

  await pool.query(
    'INSERT INTO credit_transactions (user_id, amount, type, description, created_at) VALUES ($1, $2, $3, $4, $5)',
    [userId, ADMIN_MONTHLY_CREDITS, 'admin_monthly', `Monthly admin credits for ${currentMonth}`, new Date().toISOString()]
  );
}

export async function findOrCreateUser(googleId: string, email: string, name: string, picture?: string): Promise<User> {
  const { rows } = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
  const existing = rows[0] as User | undefined;
  const now = new Date().toISOString();
  const role = determineRole(email);
  const isAdmin = role === 'owner' || role === 'admin' ? 1 : 0;

  if (existing) {
    await pool.query(
      'UPDATE users SET name = $1, picture = $2, last_login = $3, role = $4, is_admin = $5 WHERE id = $6',
      [name, picture ?? null, now, role, isAdmin, existing.id]
    );

    const user = { ...existing, name, picture: picture ?? null, last_login: now, role, is_admin: isAdmin };

    if (role === 'admin') {
      const currentMonth = getCurrentMonth();
      if (user.admin_credits_month !== currentMonth) {
        await grantAdminMonthlyCredits(user.id, currentMonth);
        user.credits = ADMIN_MONTHLY_CREDITS;
        user.admin_credits_month = currentMonth;
      }
    }

    return user;
  }

  const { rows: insertRows } = await pool.query(
    'INSERT INTO users (google_id, email, name, picture, is_admin, role, created_at, last_login) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
    [googleId, email, name, picture ?? null, isAdmin, role, now, now]
  );

  const userId = insertRows[0].id as number;
  let credits = 0;

  if (role === 'admin') {
    const currentMonth = getCurrentMonth();
    await grantAdminMonthlyCredits(userId, currentMonth);
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

export async function getUserById(id: number): Promise<User | undefined> {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] as User | undefined;
}

export async function updateUserPreferences(id: number, prefs: { home_port?: string | null; default_currency?: string | null }): Promise<void> {
  if (prefs.home_port !== undefined) {
    await pool.query('UPDATE users SET home_port = $1 WHERE id = $2', [prefs.home_port || null, id]);
  }
  if (prefs.default_currency !== undefined) {
    await pool.query('UPDATE users SET default_currency = $1 WHERE id = $2', [prefs.default_currency || null, id]);
  }
}

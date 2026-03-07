import db from './database.js';

const CREDITS_PER_PURCHASE = 1000;
const PRICE_USD_CENTS = 500; // $5.00

export { CREDITS_PER_PURCHASE, PRICE_USD_CENTS };

export function getUserCredits(userId: number): number {
  const row = db.prepare('SELECT credits FROM users WHERE id = ?').get(userId) as { credits: number } | undefined;
  return row?.credits ?? 0;
}

export function deductCredit(userId: number): boolean {
  const result = db.prepare(
    'UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0'
  ).run(userId);

  if (result.changes === 0) return false;

  db.prepare(
    'INSERT INTO credit_transactions (user_id, amount, type, description, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, -1, 'search', 'Flight search', new Date().toISOString());

  return true;
}

export function addCredits(userId: number, amount: number, stripeSessionId?: string): void {
  db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(amount, userId);

  db.prepare(
    'INSERT INTO credit_transactions (user_id, amount, type, description, stripe_session_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, amount, 'purchase', `Purchased ${amount} credits`, stripeSessionId ?? null, new Date().toISOString());
}

export function getCreditHistory(userId: number, limit = 50) {
  return db.prepare(
    'SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(userId, limit);
}

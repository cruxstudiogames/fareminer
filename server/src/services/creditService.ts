import pool from './database.js';

const CREDITS_PER_PURCHASE = 1000;
const PRICE_USD_CENTS = 500; // $5.00

export { CREDITS_PER_PURCHASE, PRICE_USD_CENTS };

export async function getUserCredits(userId: number): Promise<number> {
  const { rows } = await pool.query('SELECT credits FROM users WHERE id = $1', [userId]);
  return rows[0]?.credits ?? 0;
}

export async function deductCredit(userId: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    'UPDATE users SET credits = credits - 1 WHERE id = $1 AND credits > 0',
    [userId]
  );

  if (rowCount === 0) return false;

  await pool.query(
    'INSERT INTO credit_transactions (user_id, amount, type, description, created_at) VALUES ($1, $2, $3, $4, $5)',
    [userId, -1, 'search', 'Fare Miner search', new Date().toISOString()]
  );

  return true;
}

export async function addCredits(userId: number, amount: number, stripeSessionId?: string): Promise<void> {
  await pool.query('UPDATE users SET credits = credits + $1 WHERE id = $2', [amount, userId]);

  await pool.query(
    'INSERT INTO credit_transactions (user_id, amount, type, description, stripe_session_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [userId, amount, 'purchase', `Purchased ${amount} credits`, stripeSessionId ?? null, new Date().toISOString()]
  );
}

export async function getCreditHistory(userId: number, limit = 50) {
  const { rows } = await pool.query(
    'SELECT * FROM credit_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit]
  );
  return rows;
}

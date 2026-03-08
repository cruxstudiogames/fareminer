import pool from './database.js';

const CACHE_AGE_DAYS = parseInt(process.env.CACHE_AGE_DAYS || '28', 10);
const CACHE_VISIBLE_DAYS = parseInt(process.env.CACHE_VISIBLE_DAYS || '7', 10);

export { CACHE_AGE_DAYS, CACHE_VISIBLE_DAYS };

export interface AdminStats {
  userCount: number;
  revenue: number;
  topUsers: Array<{ name: string; email: string; searchCount: number }>;
  queriesByDay: Array<{ date: string; count: number }>;
  cacheDbSizeMB: number;
  cacheQueryCount: number;
  cacheResultCount: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  const userCountRes = await pool.query('SELECT COUNT(*) AS cnt FROM users');
  const userCount = parseInt(userCountRes.rows[0].cnt, 10);

  const revenueRes = await pool.query(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM credit_transactions WHERE type = 'purchase' AND amount > 0"
  );
  const revenue = (parseInt(revenueRes.rows[0].total, 10) / 1000) * 5;

  const topUsersRes = await pool.query(`
    SELECT u.name, u.email, COUNT(ct.id)::int AS "searchCount"
    FROM credit_transactions ct
    JOIN users u ON u.id = ct.user_id
    WHERE ct.type = 'search'
    GROUP BY ct.user_id, u.name, u.email
    ORDER BY "searchCount" DESC
    LIMIT 10
  `);
  const topUsers = topUsersRes.rows as Array<{ name: string; email: string; searchCount: number }>;

  const queriesByDayRes = await pool.query(`
    SELECT created_at::date::text AS date, COUNT(*)::int AS count
    FROM queries
    WHERE created_at::timestamptz >= NOW() - INTERVAL '30 days'
    GROUP BY created_at::date
    ORDER BY date ASC
  `);
  const queriesByDay = queriesByDayRes.rows as Array<{ date: string; count: number }>;

  // PostgreSQL database size
  let cacheDbSizeMB = 0;
  try {
    const sizeRes = await pool.query("SELECT pg_database_size(current_database()) AS size_bytes");
    cacheDbSizeMB = Math.round((parseInt(sizeRes.rows[0].size_bytes, 10) / (1024 * 1024)) * 100) / 100;
  } catch {
    // permission issue or similar
  }

  const cacheQueryCountRes = await pool.query('SELECT COUNT(*)::int AS cnt FROM queries');
  const cacheQueryCount = cacheQueryCountRes.rows[0].cnt;

  const cacheResultCountRes = await pool.query('SELECT COUNT(*)::int AS cnt FROM results');
  const cacheResultCount = cacheResultCountRes.rows[0].cnt;

  return { userCount, revenue, topUsers, queriesByDay, cacheDbSizeMB, cacheQueryCount, cacheResultCount };
}

/**
 * Delete cached queries and their results older than CACHE_AGE_DAYS.
 * Returns the number of queries deleted.
 */
export async function evictOldCache(): Promise<number> {
  const result = await pool.query(
    "DELETE FROM queries WHERE created_at::timestamptz < NOW() - INTERVAL '1 day' * $1",
    [CACHE_AGE_DAYS]
  );
  return result.rowCount ?? 0;
}

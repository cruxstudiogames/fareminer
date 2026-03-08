import db from './database.js';
import fs from 'fs';
import path from 'path';

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

export function getAdminStats(): AdminStats {
  const userCount = (db.prepare('SELECT COUNT(*) AS cnt FROM users').get() as { cnt: number }).cnt;

  // Revenue: sum of purchase transactions (positive amounts), exclude test transactions (amount <= 0)
  const revenueRow = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM credit_transactions WHERE type = 'purchase' AND amount > 0"
  ).get() as { total: number };
  // Each 1000 credits = $5, so revenue = (total credits purchased / 1000) * 5
  const revenue = (revenueRow.total / 1000) * 5;

  // Top 10 most active users by search count
  const topUsers = db.prepare(`
    SELECT u.name, u.email, COUNT(ct.id) AS searchCount
    FROM credit_transactions ct
    JOIN users u ON u.id = ct.user_id
    WHERE ct.type = 'search'
    GROUP BY ct.user_id
    ORDER BY searchCount DESC
    LIMIT 10
  `).all() as Array<{ name: string; email: string; searchCount: number }>;

  // Query count by day (last 30 days)
  const queriesByDay = db.prepare(`
    SELECT DATE(created_at) AS date, COUNT(*) AS count
    FROM queries
    WHERE created_at >= datetime('now', '-30 days')
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).all() as Array<{ date: string; count: number }>;

  // Cache DB file size
  const dbPath = process.env.CACHE_DB_PATH || path.join(__dirname, '..', '..', 'cache.db');
  let cacheDbSizeMB = 0;
  try {
    const stats = fs.statSync(dbPath);
    cacheDbSizeMB = Math.round((stats.size / (1024 * 1024)) * 100) / 100;
  } catch {
    // file doesn't exist or can't be read
  }

  const cacheQueryCount = (db.prepare('SELECT COUNT(*) AS cnt FROM queries').get() as { cnt: number }).cnt;
  const cacheResultCount = (db.prepare('SELECT COUNT(*) AS cnt FROM results').get() as { cnt: number }).cnt;

  return { userCount, revenue, topUsers, queriesByDay, cacheDbSizeMB, cacheQueryCount, cacheResultCount };
}

/**
 * Delete cached queries and their results older than CACHE_AGE_DAYS.
 * Returns the number of queries deleted.
 */
export function evictOldCache(): number {
  const result = db.prepare(
    `DELETE FROM queries WHERE created_at < datetime('now', '-' || ? || ' days')`
  ).run(CACHE_AGE_DAYS);
  return result.changes;
}

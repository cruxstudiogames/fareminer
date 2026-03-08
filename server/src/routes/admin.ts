import { Router } from 'express';
import { getAdminStats, evictOldCache, CACHE_AGE_DAYS, CACHE_VISIBLE_DAYS } from '../services/adminService.js';
import { requireAdmin } from '../middleware/auth.js';

export const adminRouter = Router();

// All admin routes require admin access
adminRouter.use(requireAdmin);

adminRouter.get('/stats', async (_req, res) => {
  const stats = await getAdminStats();
  res.json(stats);
});

adminRouter.get('/config', (_req, res) => {
  res.json({ cacheAgeDays: CACHE_AGE_DAYS, cacheVisibleDays: CACHE_VISIBLE_DAYS });
});

adminRouter.post('/evict-cache', async (_req, res) => {
  const deleted = await evictOldCache();
  res.json({ deleted, message: `Evicted ${deleted} queries older than ${CACHE_AGE_DAYS} days` });
});

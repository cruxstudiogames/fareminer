import { Router } from 'express';
import { getAllQueries, getResultsByQueryId, searchCachedResults, getTimeSweepResults, checkCachedKeys } from '../services/cacheService.js';
import logger from '../services/logger.js';

export const cacheRouter = Router();

// Check which O/D/date combos are cached
cacheRouter.post('/check', async (req, res) => {
  try {
    const { combos } = req.body as { combos: Array<{ origin: string; destination: string; departureDate: string; adults: number; currency?: string; cabin?: string }> };
    if (!Array.isArray(combos)) {
      res.status(400).json({ error: 'combos must be an array' });
      return;
    }
    const results = await checkCachedKeys(combos);
    res.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err }, 'Cache check error');
    res.status(500).json({ error: message });
  }
});

cacheRouter.get('/queries', async (req, res) => {
  try {
    // Admin can pass ?all=true to see all users' queries
    const showAll = req.query.all === 'true' && req.user?.is_admin === 1;
    const userId = showAll ? undefined : req.user!.id;
    const queries = await getAllQueries(userId);
    res.json({ queries });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err }, 'Cache queries error');
    res.status(500).json({ error: message });
  }
});

cacheRouter.get('/search', async (req, res) => {
  try {
    const origins = req.query.origin ? (req.query.origin as string).split(',').filter(Boolean) : undefined;
    const destinations = req.query.destination ? (req.query.destination as string).split(',').filter(Boolean) : undefined;
    const departureDates = req.query.departureDate ? (req.query.departureDate as string).split(',').filter(Boolean) : undefined;
    const tripType = (req.query.tripType as string | undefined) as 'any' | 'oneway' | 'roundtrip' | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

    const cabin = req.query.cabin as string | undefined;

    const wantsAll = req.query.all === 'true';
    const isAdmin = req.user?.is_admin === 1;
    const userId = (wantsAll && isAdmin) ? undefined : req.user!.id;
    const includeLegacy = wantsAll;
    const results = await searchCachedResults({ origins, destinations, departureDates, tripType, limit, cabin }, userId, includeLegacy);
    res.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err }, 'Cache search error');
    res.status(500).json({ error: message });
  }
});

cacheRouter.get('/queries/:id/results', async (req, res) => {
  try {
    const queryId = Number(req.params.id);
    if (isNaN(queryId)) {
      res.status(400).json({ error: 'Invalid query ID' });
      return;
    }

    const results = await getResultsByQueryId(queryId);
    res.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err }, 'Cache results error');
    res.status(500).json({ error: message });
  }
});

cacheRouter.get('/time-sweep/:id', async (req, res) => {
  try {
    const timeSweepId = req.params.id;
    const showAll = req.query.all === 'true' && req.user?.is_admin === 1;
    const userId = showAll ? undefined : req.user!.id;
    const results = await getTimeSweepResults(timeSweepId, userId);
    res.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err }, 'Time sweep results error');
    res.status(500).json({ error: message });
  }
});

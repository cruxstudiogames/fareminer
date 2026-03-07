import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { searchFlightsWithCache, type FlightSearchParams } from '../services/flightService.js';
import { getCachedResults } from '../services/cacheService.js';
import { deductCredit, getUserCredits } from '../services/creditService.js';

export const flightsRouter = Router();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Please wait a minute.' },
});

flightsRouter.use(limiter);

flightsRouter.get('/search', async (req, res) => {
  try {
    const { origin, destination, departureDate, adults, currency, returnDate, fresh, timeSweepId } = req.query;

    if (!origin || !destination || !departureDate || !adults) {
      res.status(400).json({ error: 'Missing required params: origin, destination, departureDate, adults' });
      return;
    }

    const searchParams: FlightSearchParams = {
      origin: String(origin),
      destination: String(destination),
      departureDate: String(departureDate),
      adults: Number(adults),
      currency: currency ? String(currency) : undefined,
      returnDate: returnDate ? String(returnDate) : undefined,
    };

    const isFresh = fresh === 'true';
    const userRole = req.user?.role;
    const isOwner = userRole === 'owner';

    // Owner has unlimited credits; admins and users deduct from their balance
    if (!isOwner) {
      const cached = getCachedResults(searchParams);
      if (!cached || isFresh) {
        // This will cost a credit - check balance first
        const credits = getUserCredits(req.user!.id);
        if (credits <= 0) {
          res.status(402).json({
            error: 'Insufficient credits. Purchase more credits to search for custom routes.',
            code: 'INSUFFICIENT_CREDITS',
            credits: 0,
          });
          return;
        }
        // Deduct credit
        deductCredit(req.user!.id);
      }
    }

    const results = await searchFlightsWithCache(
      searchParams,
      isFresh,
      timeSweepId ? String(timeSweepId) : undefined,
      req.user?.id,
    );

    res.json({
      results,
      credits: userRole === 'owner' ? undefined : getUserCredits(req.user!.id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Flight search error:', message);
    res.status(500).json({ error: message });
  }
});

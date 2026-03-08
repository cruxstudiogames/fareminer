import express from 'express';
import cors from 'cors';
import path from 'path';
import session from 'express-session';
import dotenv from 'dotenv';

dotenv.config();

import { SQLiteStore } from './services/sessionStore.js';
import { requireAuth } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { flightsRouter } from './routes/flights.js';
import { cacheRouter } from './routes/cache.js';
import { tripsRouter } from './routes/trips.js';
import { creditsRouter, createWebhookHandler } from './routes/credits.js';
import { adminRouter } from './routes/admin.js';
import { evictOldCache } from './services/adminService.js';

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

if (!isProd) {
  app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
}

if (isProd) {
  app.set('trust proxy', 1);
}

// Stripe webhook needs raw body - must be before express.json()
app.use('/api/credits/webhook', express.raw({ type: 'application/json' }), createWebhookHandler());

app.use(express.json());

app.use(session({
  store: new SQLiteStore(),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax',
  },
}));

// Health check (public)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (public)
app.use('/api/auth', authRouter);

// Protected routes
app.use('/api/flights', requireAuth, flightsRouter);
app.use('/api/cache', requireAuth, cacheRouter);
app.use('/api/trips', requireAuth, tripsRouter);
app.use('/api/credits', requireAuth, creditsRouter);
app.use('/api/admin', requireAuth, adminRouter);

// In production, serve the React client build
if (isProd) {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));

  app.get('{*path}', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Evict expired cache entries on startup
const evicted = evictOldCache();
if (evicted > 0) console.log(`Cache eviction: removed ${evicted} queries older than configured limit`);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

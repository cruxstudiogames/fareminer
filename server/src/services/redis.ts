import Redis from 'ioredis';
import logger from './logger.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  return redis;
}

export async function initRedis(): Promise<void> {
  if (process.env.REDIS_DISABLED === 'true') {
    logger.info('Redis disabled by config');
    return;
  }

  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null; // stop retrying
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      logger.warn({ err: err.message }, 'Redis connection error — falling back to DB only');
    });

    await redis.connect();
    logger.info('Redis connected');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Redis unavailable — running without cache layer');
    redis = null;
  }
}

const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_VISIBLE_DAYS || '7', 10) * 86400;

/** Get cached flight results from Redis */
export async function getFromRedis(key: string): Promise<string | null> {
  if (!redis) return null;
  try {
    return await redis.get(`cache:${key}`);
  } catch {
    return null;
  }
}

/** Set cached flight results in Redis with TTL */
export async function setInRedis(key: string, value: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(`cache:${key}`, value, 'EX', CACHE_TTL_SECONDS);
  } catch {
    // non-critical
  }
}

/** Invalidate a cache key in Redis */
export async function deleteFromRedis(key: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(`cache:${key}`);
  } catch {
    // non-critical
  }
}

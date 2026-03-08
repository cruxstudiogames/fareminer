import pool from './database.js';
import { getFromRedis, setInRedis, deleteFromRedis } from './redis.js';
import type { FlightSearchParams, FlightSearchResult, FlightSegment } from './flightService.js';

const CACHE_VISIBLE_DAYS = parseInt(process.env.CACHE_VISIBLE_DAYS || '7', 10);

function buildCacheKey(params: FlightSearchParams): string {
  return [
    params.origin.toUpperCase().trim(),
    params.destination.toUpperCase().trim(),
    params.departureDate,
    params.returnDate || '',
    String(params.adults),
    (params.currency || 'USD').toUpperCase(),
    (params.cabin || 'Economy'),
  ].join('|');
}

/** Check which cache keys exist from a list of search param combos (within visible window) */
export async function checkCachedKeys(combos: FlightSearchParams[]): Promise<boolean[]> {
  const results: boolean[] = [];
  for (const params of combos) {
    const key = buildCacheKey(params);
    const { rows } = await pool.query(
      "SELECT 1 FROM queries WHERE cache_key = $1 AND created_at::timestamptz >= NOW() - INTERVAL '1 day' * $2",
      [key, CACHE_VISIBLE_DAYS]
    );
    results.push(rows.length > 0);
  }
  return results;
}

export async function getCachedResults(params: FlightSearchParams): Promise<FlightSearchResult[] | null> {
  const key = buildCacheKey(params);

  // Try Redis first
  const cached = await getFromRedis(key);
  if (cached) {
    return JSON.parse(cached) as FlightSearchResult[];
  }

  const { rows: queryRows } = await pool.query(
    "SELECT id FROM queries WHERE cache_key = $1 AND created_at::timestamptz >= NOW() - INTERVAL '1 day' * $2",
    [key, CACHE_VISIBLE_DAYS]
  );
  if (queryRows.length === 0) return null;

  const { rows } = await pool.query('SELECT * FROM results WHERE query_id = $1', [queryRows[0].id]);
  const mapped = rows.map(mapRowToResult);

  // Store in Redis for next time
  await setInRedis(key, JSON.stringify(mapped));

  return mapped;
}

function mapRowToResult(row: Record<string, unknown>): FlightSearchResult {
  const result: FlightSearchResult = {
    id: row.offer_id as string,
    airlineCode: row.airline_code as string,
    airlineName: row.airline_name as string,
    flightNumber: row.flight_number as string,
    origin: row.origin as string,
    destination: row.destination as string,
    departureAt: row.departure_at as string,
    arrivalAt: row.arrival_at as string,
    duration: row.duration as string,
    stops: row.stops as number,
    stopCodes: JSON.parse(row.stop_codes as string) as string[],
    segments: row.segments_json ? JSON.parse(row.segments_json as string) as FlightSegment[] : [],
    totalPrice: row.total_price as number,
    pricePerPerson: row.price_per_person as number,
    currency: row.currency as string,
    cabin: row.cabin as string,
  };

  if (row.return_departure_at) {
    result.returnDepartureAt = row.return_departure_at as string;
    result.returnArrivalAt = row.return_arrival_at as string;
    result.returnDuration = row.return_duration as string;
    result.returnStops = row.return_stops as number;
    result.returnFlightNumber = row.return_flight_number as string;
    result.returnOrigin = row.return_origin as string;
    result.returnDestination = row.return_destination as string;
    result.returnStopCodes = JSON.parse(row.return_stop_codes as string) as string[];
    result.returnSegments = row.return_segments_json ? JSON.parse(row.return_segments_json as string) as FlightSegment[] : undefined;
  }

  return result;
}

export async function getAllQueries(userId?: number) {
  const conditions: string[] = [`q.created_at::timestamptz >= NOW() - INTERVAL '1 day' * ${CACHE_VISIBLE_DAYS}`];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (userId != null) {
    conditions.push(`q.user_id = $${paramIdx}`);
    params.push(userId);
    paramIdx++;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const { rows } = await pool.query(`
    SELECT q.*, COUNT(r.id) AS result_count
    FROM queries q
    LEFT JOIN results r ON r.query_id = q.id
    ${where}
    GROUP BY q.id
    ORDER BY q.created_at DESC
  `, params);

  return rows as Array<{
    id: number;
    origin: string;
    destination: string;
    departure_date: string;
    return_date: string | null;
    adults: number;
    non_stop: number;
    currency: string;
    created_at: string;
    result_count: number;
    user_id: number | null;
  }>;
}

export async function getResultsByQueryId(queryId: number): Promise<FlightSearchResult[]> {
  const { rows } = await pool.query('SELECT * FROM results WHERE query_id = $1', [queryId]);
  return rows.map(mapRowToResult);
}

export interface CacheSearchFilters {
  origins?: string[];
  destinations?: string[];
  departureDates?: string[];
  tripType?: 'any' | 'oneway' | 'roundtrip';
  limit?: number;
  cabin?: string;
}

export async function searchCachedResults(filters: CacheSearchFilters, userId?: number, includeLegacy = false) {
  const conditions: string[] = [`q.created_at::timestamptz >= NOW() - INTERVAL '1 day' * ${CACHE_VISIBLE_DAYS}`];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (userId != null) {
    if (includeLegacy) {
      conditions.push(`(q.user_id = $${paramIdx} OR q.user_id IS NULL)`);
    } else {
      conditions.push(`q.user_id = $${paramIdx}`);
    }
    params.push(userId);
    paramIdx++;
  }
  if (filters.origins && filters.origins.length > 0) {
    const placeholders = filters.origins.map(() => `$${paramIdx++}`).join(',');
    conditions.push(`UPPER(r.origin) IN (${placeholders})`);
    params.push(...filters.origins.map((o) => o.toUpperCase().trim()));
  }
  if (filters.destinations && filters.destinations.length > 0) {
    const placeholders = filters.destinations.map(() => `$${paramIdx++}`).join(',');
    conditions.push(`UPPER(r.destination) IN (${placeholders})`);
    params.push(...filters.destinations.map((d) => d.toUpperCase().trim()));
  }
  if (filters.departureDates && filters.departureDates.length > 0) {
    const dateConds = filters.departureDates.map(() => `r.departure_at LIKE $${paramIdx++}`);
    conditions.push(`(${dateConds.join(' OR ')})`);
    params.push(...filters.departureDates.map((d) => `${d}%`));
  }
  if (filters.cabin) {
    conditions.push(`LOWER(r.cabin) = LOWER($${paramIdx++})`);
    params.push(filters.cabin);
  }
  if (filters.tripType === 'oneway') {
    conditions.push('r.return_departure_at IS NULL');
  } else if (filters.tripType === 'roundtrip') {
    conditions.push('r.return_departure_at IS NOT NULL');
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit && filters.limit > 0 ? filters.limit : 500;

  const { rows } = await pool.query(`
    SELECT r.*, q.departure_date AS query_departure_date, q.return_date AS query_return_date,
           q.adults AS query_adults, q.currency AS query_currency, q.created_at AS query_cached_at
    FROM results r
    JOIN queries q ON q.id = r.query_id
    ${where}
    ORDER BY r.total_price ASC
    LIMIT $${paramIdx}
  `, [...params, limit]);

  return rows.map((row: Record<string, unknown>) => ({
    ...mapRowToResult(row),
    queryCachedAt: row.query_cached_at as string,
  }));
}

export async function cacheResults(params: FlightSearchParams, results: FlightSearchResult[], timeSweepId?: string, userId?: number): Promise<void> {
  const key = buildCacheKey(params);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Delete old cached entry if it exists
    const { rows: existing } = await client.query('SELECT id FROM queries WHERE cache_key = $1', [key]);
    if (existing.length > 0) {
      await client.query('DELETE FROM queries WHERE id = $1', [existing[0].id]);
    }

    const { rows: insertRows } = await client.query(
      `INSERT INTO queries (origin, destination, departure_date, return_date, adults, non_stop, currency, cache_key, created_at, time_sweep_id, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        params.origin.toUpperCase().trim(),
        params.destination.toUpperCase().trim(),
        params.departureDate,
        params.returnDate || null,
        params.adults,
        params.nonStop ? 1 : 0,
        (params.currency || 'USD').toUpperCase(),
        key,
        new Date().toISOString(),
        timeSweepId || null,
        userId || null,
      ]
    );

    const queryId = insertRows[0].id;

    for (const r of results) {
      await client.query(
        `INSERT INTO results (
          query_id, offer_id, airline_code, airline_name, flight_number,
          origin, destination, departure_at, arrival_at, duration,
          stops, stop_codes, total_price, price_per_person, currency, cabin,
          return_departure_at, return_arrival_at, return_duration, return_stops,
          return_flight_number, return_origin, return_destination, return_stop_codes,
          segments_json, return_segments_json
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`,
        [
          queryId,
          r.id,
          r.airlineCode,
          r.airlineName,
          r.flightNumber,
          r.origin,
          r.destination,
          r.departureAt,
          r.arrivalAt,
          r.duration,
          r.stops,
          JSON.stringify(r.stopCodes),
          r.totalPrice,
          r.pricePerPerson,
          r.currency,
          r.cabin,
          r.returnDepartureAt || null,
          r.returnArrivalAt || null,
          r.returnDuration || null,
          r.returnStops ?? null,
          r.returnFlightNumber || null,
          r.returnOrigin || null,
          r.returnDestination || null,
          r.returnStopCodes ? JSON.stringify(r.returnStopCodes) : null,
          JSON.stringify(r.segments),
          r.returnSegments ? JSON.stringify(r.returnSegments) : null,
        ]
      );
    }

    await client.query('COMMIT');

    // Invalidate Redis cache for this key so next read gets fresh data
    await deleteFromRedis(key);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getTimeSweepResults(timeSweepId: string, userId?: number) {
  const conditions = [
    'q.time_sweep_id = $1',
    `q.created_at::timestamptz >= NOW() - INTERVAL '1 day' * ${CACHE_VISIBLE_DAYS}`,
  ];
  const params: unknown[] = [timeSweepId];

  if (userId != null) {
    conditions.push('q.user_id = $2');
    params.push(userId);
  }

  const { rows } = await pool.query(`
    SELECT r.*, q.departure_date, q.created_at AS query_cached_at
    FROM results r
    JOIN queries q ON q.id = r.query_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY q.departure_date ASC, r.total_price ASC
  `, params);

  return rows.map((row: Record<string, unknown>) => ({
    ...mapRowToResult(row),
    departureDate: row.departure_date as string,
  }));
}

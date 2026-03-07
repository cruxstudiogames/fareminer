import db from './database.js';
import type { FlightSearchParams, FlightSearchResult, FlightSegment } from './flightService.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    departure_date TEXT NOT NULL,
    return_date TEXT,
    adults INTEGER NOT NULL,
    non_stop INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    cache_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_id INTEGER NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
    offer_id TEXT NOT NULL,
    airline_code TEXT NOT NULL,
    airline_name TEXT NOT NULL,
    flight_number TEXT NOT NULL,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    departure_at TEXT NOT NULL,
    arrival_at TEXT NOT NULL,
    duration TEXT NOT NULL,
    stops INTEGER NOT NULL,
    stop_codes TEXT NOT NULL,
    total_price REAL NOT NULL,
    price_per_person REAL NOT NULL,
    currency TEXT NOT NULL,
    cabin TEXT NOT NULL,
    return_departure_at TEXT,
    return_arrival_at TEXT,
    return_duration TEXT,
    return_stops INTEGER,
    return_flight_number TEXT,
    return_origin TEXT,
    return_destination TEXT,
    return_stop_codes TEXT,
    segments_json TEXT,
    return_segments_json TEXT
  );
`);

// Migration for existing databases: add segments columns if missing
try { db.exec('ALTER TABLE results ADD COLUMN segments_json TEXT'); } catch { /* column already exists */ }
try { db.exec('ALTER TABLE results ADD COLUMN return_segments_json TEXT'); } catch { /* column already exists */ }
try { db.exec('ALTER TABLE queries ADD COLUMN time_sweep_id TEXT'); } catch { /* column already exists */ }
try { db.exec('ALTER TABLE queries ADD COLUMN user_id INTEGER'); } catch { /* column already exists */ }

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

/** Check which cache keys exist from a list of search param combos */
export function checkCachedKeys(combos: FlightSearchParams[]): boolean[] {
  const stmt = db.prepare('SELECT 1 FROM queries WHERE cache_key = ?');
  return combos.map((params) => {
    const key = buildCacheKey(params);
    return stmt.get(key) !== undefined;
  });
}

export function getCachedResults(params: FlightSearchParams): FlightSearchResult[] | null {
  const key = buildCacheKey(params);

  const query = db.prepare('SELECT id FROM queries WHERE cache_key = ?').get(key) as { id: number } | undefined;
  if (!query) return null;

  const rows = db.prepare('SELECT * FROM results WHERE query_id = ?').all(query.id) as Array<Record<string, unknown>>;
  return rows.map(mapRowToResult);
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

export function getAllQueries(userId?: number) {
  const where = userId != null ? 'WHERE q.user_id = ?' : '';
  const params = userId != null ? [userId] : [];
  return db.prepare(`
    SELECT q.*, COUNT(r.id) AS result_count
    FROM queries q
    LEFT JOIN results r ON r.query_id = q.id
    ${where}
    GROUP BY q.id
    ORDER BY q.created_at DESC
  `).all(...params) as Array<{
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

export function getResultsByQueryId(queryId: number): FlightSearchResult[] {
  const rows = db.prepare('SELECT * FROM results WHERE query_id = ?').all(queryId) as Array<Record<string, unknown>>;
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

export function searchCachedResults(filters: CacheSearchFilters, userId?: number, includeLegacy = false) {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (userId != null) {
    if (includeLegacy) {
      conditions.push('(q.user_id = ? OR q.user_id IS NULL)');
    } else {
      conditions.push('q.user_id = ?');
    }
    params.push(userId);
  }
  if (filters.origins && filters.origins.length > 0) {
    const placeholders = filters.origins.map(() => '?').join(',');
    conditions.push(`UPPER(r.origin) IN (${placeholders})`);
    params.push(...filters.origins.map((o) => o.toUpperCase().trim()));
  }
  if (filters.destinations && filters.destinations.length > 0) {
    const placeholders = filters.destinations.map(() => '?').join(',');
    conditions.push(`UPPER(r.destination) IN (${placeholders})`);
    params.push(...filters.destinations.map((d) => d.toUpperCase().trim()));
  }
  if (filters.departureDates && filters.departureDates.length > 0) {
    const dateConds = filters.departureDates.map(() => 'r.departure_at LIKE ?');
    conditions.push(`(${dateConds.join(' OR ')})`);
    params.push(...filters.departureDates.map((d) => `${d}%`));
  }
  if (filters.cabin) {
    conditions.push('LOWER(r.cabin) = LOWER(?)');
    params.push(filters.cabin);
  }
  if (filters.tripType === 'oneway') {
    conditions.push('r.return_departure_at IS NULL');
  } else if (filters.tripType === 'roundtrip') {
    conditions.push('r.return_departure_at IS NOT NULL');
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit && filters.limit > 0 ? `LIMIT ${filters.limit}` : 'LIMIT 500';

  const rows = db.prepare(`
    SELECT r.*, q.departure_date AS query_departure_date, q.return_date AS query_return_date,
           q.adults AS query_adults, q.currency AS query_currency, q.created_at AS query_cached_at
    FROM results r
    JOIN queries q ON q.id = r.query_id
    ${where}
    ORDER BY r.total_price ASC
    ${limit}
  `).all(...params) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    ...mapRowToResult(row),
    queryCachedAt: row.query_cached_at as string,
  }));
}

export const cacheResults = db.transaction((params: FlightSearchParams, results: FlightSearchResult[], timeSweepId?: string, userId?: number) => {
  const key = buildCacheKey(params);

  // Delete old cached entry if it exists (for fresh refreshes)
  const existing = db.prepare('SELECT id FROM queries WHERE cache_key = ?').get(key) as { id: number } | undefined;
  if (existing) {
    db.prepare('DELETE FROM queries WHERE id = ?').run(existing.id);
  }

  const info = db.prepare(`
    INSERT INTO queries (origin, destination, departure_date, return_date, adults, non_stop, currency, cache_key, created_at, time_sweep_id, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
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
  );

  const queryId = info.lastInsertRowid;

  const insertResult = db.prepare(`
    INSERT INTO results (
      query_id, offer_id, airline_code, airline_name, flight_number,
      origin, destination, departure_at, arrival_at, duration,
      stops, stop_codes, total_price, price_per_person, currency, cabin,
      return_departure_at, return_arrival_at, return_duration, return_stops,
      return_flight_number, return_origin, return_destination, return_stop_codes,
      segments_json, return_segments_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const r of results) {
    insertResult.run(
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
    );
  }
});

export function getTimeSweepResults(timeSweepId: string, userId?: number) {
  const conditions = ['q.time_sweep_id = ?'];
  const params: unknown[] = [timeSweepId];
  if (userId != null) {
    conditions.push('q.user_id = ?');
    params.push(userId);
  }
  const rows = db.prepare(`
    SELECT r.*, q.departure_date, q.created_at AS query_cached_at
    FROM results r
    JOIN queries q ON q.id = r.query_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY q.departure_date ASC, r.total_price ASC
  `).all(...params) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    ...mapRowToResult(row),
    departureDate: row.departure_date as string,
  }));
}

import type { FlightSearchParams, FlightSearchResult, CacheSearchResult } from '../types';
import { useAuthStore } from '../store/useAuthStore';

interface FlightSearchResponse {
  results: FlightSearchResult[];
  credits?: number;
}

function updateCredits(credits?: number) {
  if (credits !== undefined) {
    useAuthStore.getState().setCredits(credits);
  }
}

export async function searchFlights(
  params: FlightSearchParams
): Promise<FlightSearchResult[]> {
  const query = new URLSearchParams({
    origin: params.origin,
    destination: params.destination,
    departureDate: params.departureDate,
    adults: String(params.adults),
    fresh: 'true',
  });

  if (params.currency) query.set('currency', params.currency);
  if (params.cabin) query.set('cabin', params.cabin);

  const response = await fetch(`/api/flights/search?${query}`, { credentials: 'include' });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string; code?: string; credits?: number };
    if (data.code === 'INSUFFICIENT_CREDITS') {
      updateCredits(data.credits);
    }
    throw new Error(data.error || `Search failed (${response.status})`);
  }

  const data = (await response.json()) as FlightSearchResponse;
  updateCredits(data.credits);
  return data.results;
}

export async function searchCachedFlights(params: {
  origins?: string[];
  destinations?: string[];
  departureDates?: string[];
  cabin?: string;
}): Promise<CacheSearchResult[]> {
  const query = new URLSearchParams();
  if (params.origins && params.origins.length > 0) {
    query.set('origin', params.origins.join(','));
  }
  if (params.destinations && params.destinations.length > 0) {
    query.set('destination', params.destinations.join(','));
  }
  if (params.departureDates && params.departureDates.length > 0) {
    query.set('departureDate', params.departureDates.join(','));
  }
  if (params.cabin) {
    query.set('cabin', params.cabin);
  }
  query.set('tripType', 'oneway');
  query.set('all', 'true');
  query.set('limit', '2000');

  const response = await fetch(`/api/cache/search?${query}`, { credentials: 'include' });

  if (!response.ok) {
    throw new Error(`Cache search failed (${response.status})`);
  }

  const data = (await response.json()) as { results: CacheSearchResult[] };
  return data.results;
}

/** Check which O/D/date combos are already cached */
export async function checkCachedCombos(combos: {
  origin: string;
  destination: string;
  departureDate: string;
  adults: number;
  currency?: string;
}[]): Promise<boolean[]> {
  const response = await fetch('/api/cache/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ combos }),
  });
  if (!response.ok) return combos.map(() => false);
  const data = (await response.json()) as { cached: boolean[] };
  return data.cached;
}

/** Generate all dates in a range, optionally filtered by day of week */
export function generateDatesInRange(
  begin: string,
  end: string,
  daysOfWeek: number[] = [],
): string[] {
  const dates: string[] = [];
  const start = new Date(begin + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');

  while (start <= endDate) {
    const dow = start.getDay();
    if (daysOfWeek.length === 0 || daysOfWeek.includes(dow)) {
      const y = start.getFullYear();
      const m = String(start.getMonth() + 1).padStart(2, '0');
      const d = String(start.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
    }
    start.setDate(start.getDate() + 1);
  }

  return dates;
}

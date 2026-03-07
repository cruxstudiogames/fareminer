import type { FlightSearchParams, FlightSearchResult } from '../types';
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
  if (params.returnDate) query.set('returnDate', params.returnDate);

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

export async function searchFlightsForTimeSweep(
  params: FlightSearchParams,
  timeSweepId: string
): Promise<FlightSearchResult[]> {
  const query = new URLSearchParams({
    origin: params.origin,
    destination: params.destination,
    departureDate: params.departureDate,
    adults: String(params.adults),
    fresh: 'true',
    timeSweepId,
  });

  if (params.currency) query.set('currency', params.currency);

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

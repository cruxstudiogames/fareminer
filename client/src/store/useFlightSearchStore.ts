import { create } from 'zustand';
import type { FlightSearchResult } from '../types';
import { defaultFilterState, type FlightFilterState } from '../components/flights/FlightFilters';

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function getLocalCurrency(): string {
  try {
    // Try Intl.NumberFormat to resolve the currency for the user's locale
    try {
      const formatter = new Intl.NumberFormat(navigator.language, { style: 'currency', currency: 'USD' });
      // Use resolvedOptions to get the locale, then extract region
      const resolved = formatter.resolvedOptions();
      const localeParts = resolved.locale.split('-');
      const region = localeParts[localeParts.length - 1]?.toUpperCase();
      if (region && region.length === 2 && REGION_CURRENCY[region]) {
        return REGION_CURRENCY[region];
      }
    } catch { /* fall through */ }

    // Try navigator.languages for locale with region suffix
    for (const lang of navigator.languages || [navigator.language]) {
      const parts = lang.split('-');
      const region = parts[parts.length - 1]?.toUpperCase();
      if (region && region.length === 2 && REGION_CURRENCY[region]) {
        return REGION_CURRENCY[region];
      }
    }

    // Try timezone-based detection as last resort
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; // e.g. "Australia/Sydney"
      const tzRegion = tz?.split('/')[0];
      const TZ_REGION_MAP: Record<string, string> = {
        'Australia': 'AU', 'America': 'US', 'Europe': 'GB', 'Asia': 'JP',
      };
      const tzCountry = TZ_REGION_MAP[tzRegion];
      if (tzCountry && REGION_CURRENCY[tzCountry]) {
        // For 'America' timezone, could be many countries - only use for common ones
        // For Australia, it's reliable
        if (tzRegion === 'Australia') return REGION_CURRENCY[tzCountry];
      }
    } catch { /* fall through */ }

    return 'USD';
  } catch {
    return 'USD';
  }
}

const REGION_CURRENCY: Record<string, string> = {
  US: 'USD', GB: 'GBP', AU: 'AUD', CA: 'CAD', NZ: 'NZD',
  JP: 'JPY', CN: 'CNY', KR: 'KRW', IN: 'INR',
  DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR', AT: 'EUR', BE: 'EUR', FI: 'EUR', GR: 'EUR', IE: 'EUR', PT: 'EUR',
  SG: 'SGD', HK: 'HKD', TH: 'THB', MY: 'MYR', PH: 'PHP',
  BR: 'BRL', MX: 'MXN', AR: 'ARS', CL: 'CLP', CO: 'COP',
  SE: 'SEK', NO: 'NOK', DK: 'DKK', CH: 'CHF', PL: 'PLN', CZ: 'CZK', HU: 'HUF',
  ZA: 'ZAR', AE: 'AED', SA: 'SAR', QA: 'QAR', IL: 'ILS', TR: 'TRY',
  TW: 'TWD', ID: 'IDR', VN: 'VND',
};

export type ResultViewMode = 'build' | 'table' | 'time' | 'od' | 'map';
export type SearchMode = 'cached' | 'fill' | 'refresh' | 'zeros';

export interface SearchState {
  // Search query fields
  origins: string[];
  destinations: string[];
  dateBegin: string;
  dateEnd: string;
  daysOfWeek: number[]; // 0=Sun..6=Sat, empty=all
  passengers: number;
  currency: string;
  cabin: string;
  searchMode: SearchMode;

  // Results & UI state
  results: FlightSearchResult[];
  comboResults: Map<string, number>; // key: "origin-dest-date", value: result count (-1 = failed)
  error: string;
  loading: boolean;
  searchProgress: { completed: number; total: number } | null;
  filters: FlightFilterState;
  viewMode: ResultViewMode;
}

interface FlightSearchStore {
  search: SearchState;
  setSearch: (partial: Partial<SearchState>) => void;
}

export const useFlightSearchStore = create<FlightSearchStore>((set) => ({
  search: {
    origins: [],
    destinations: [],
    dateBegin: addDays(1),
    dateEnd: addDays(1),
    daysOfWeek: [],
    passengers: 1,
    currency: getLocalCurrency(),
    cabin: 'Economy',
    searchMode: 'cached' as SearchMode,

    results: [],
    comboResults: new Map(),
    error: '',
    loading: false,
    searchProgress: null,
    filters: { ...defaultFilterState, selectedCarriers: new Set(), selectedCabins: new Set() },
    viewMode: 'build',
  },
  setSearch: (partial) =>
    set((s) => ({ search: { ...s.search, ...partial } })),
}));

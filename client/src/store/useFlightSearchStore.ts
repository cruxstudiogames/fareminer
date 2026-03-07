import { create } from 'zustand';
import type { FlightSearchResult } from '../types';
import { defaultFilterState, type FlightFilterState } from '../components/flights/FlightFilters';

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

interface SpecificSearchState {
  tripType: 'oneway' | 'roundtrip';
  origin: string;
  destination: string;
  date: string;
  returnDate: string;
  adults: number;
  currency: string;
  results: FlightSearchResult[];
  error: string;
  loading: boolean;
  outboundFilters: FlightFilterState;
  returnFilters: FlightFilterState;
}

interface TimeSweepState {
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  adults: number;
  currency: string;
  passengers: number;
}

interface ScatterState {
  origins: string[];
  destinations: string[];
  departureDate: string;
  adults: number;
  currency: string;
  passengers: number;
}

interface FlightSearchStore {
  // Specific search
  specific: SpecificSearchState;
  setSpecific: (partial: Partial<SpecificSearchState>) => void;

  // Time sweep form values
  timeSweep: TimeSweepState;
  setTimeSweep: (partial: Partial<TimeSweepState>) => void;

  // Scatter form values
  scatter: ScatterState;
  setScatter: (partial: Partial<ScatterState>) => void;
}

export const useFlightSearchStore = create<FlightSearchStore>((set) => ({
  specific: {
    tripType: 'oneway',
    origin: '',
    destination: '',
    date: addDays(1),
    returnDate: addDays(8),
    adults: 1,
    currency: 'AUD',
    results: [],
    error: '',
    loading: false,
    outboundFilters: { ...defaultFilterState, selectedCarriers: new Set() },
    returnFilters: { ...defaultFilterState, selectedCarriers: new Set() },
  },
  setSpecific: (partial) =>
    set((s) => ({ specific: { ...s.specific, ...partial } })),

  timeSweep: {
    origin: '',
    destination: '',
    startDate: addDays(1),
    endDate: addDays(30),
    adults: 1,
    currency: 'AUD',
    passengers: 1,
  },
  setTimeSweep: (partial) =>
    set((s) => ({ timeSweep: { ...s.timeSweep, ...partial } })),

  scatter: {
    origins: [],
    destinations: [],
    departureDate: addDays(1),
    adults: 1,
    currency: 'AUD',
    passengers: 1,
  },
  setScatter: (partial) =>
    set((s) => ({ scatter: { ...s.scatter, ...partial } })),
}));

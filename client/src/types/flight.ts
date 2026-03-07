export interface FlightSearchParams {
  origin: string;
  destination: string;
  departureDate: string;
  adults: number;
  nonStop?: boolean;
  currency?: string;
  returnDate?: string;
  cabin?: string;
}

export interface CachedQuery {
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
}

export interface FlightSegment {
  flightNumber: string;
  airlineCode: string;
  airlineName: string;
  operatingCarrierCode?: string;
  operatingCarrierName?: string;
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  duration: string;
}

export interface CacheSearchResult extends FlightSearchResult {
  queryCachedAt: string;
}

export interface TimeSweepParams {
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  daysOfWeek: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  returnDaysOfWeek: number[];
  minTripDays: number;
  maxTripDays: number;
  adults: number;
  nonStop?: boolean;
  currency?: string;
}

export interface TimeSweepDayResult {
  date: string;
  direction: 'outbound' | 'return';
  results: FlightSearchResult[];
  cheapest: FlightSearchResult | null;
  cheapestPrice: number | null;
  status: 'pending' | 'loading' | 'done' | 'error';
  error?: string;
}

export interface TimeSweepCombo {
  outbound: FlightSearchResult;
  outboundDate: string;
  returnFlight: FlightSearchResult;
  returnDate: string;
  totalPrice: number;
  tripDays: number;
}

export interface ScatterSearchParams {
  origins: string[];
  destinations: string[];
  departureDate: string;
  adults: number;
  currency?: string;
}

export interface ScatterSearchRouteResult {
  origin: string;
  destination: string;
  results: FlightSearchResult[];
  cheapest: FlightSearchResult | null;
  cheapestPrice: number | null;
  status: 'pending' | 'loading' | 'done' | 'error';
  error?: string;
}

export interface FlightSearchResult {
  id: string;
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  duration: string;
  stops: number;
  stopCodes: string[];
  segments: FlightSegment[];
  totalPrice: number;
  pricePerPerson: number;
  currency: string;
  cabin: string;
  returnDepartureAt?: string;
  returnArrivalAt?: string;
  returnDuration?: string;
  returnStops?: number;
  returnFlightNumber?: string;
  returnOrigin?: string;
  returnDestination?: string;
  returnStopCodes?: string[];
  returnSegments?: FlightSegment[];
}

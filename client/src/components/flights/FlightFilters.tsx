import { useState } from 'react';
import type { FlightSearchResult, FlightSegment } from '../../types';
import { parseDuration } from '../../utils/flightUtils';

export interface FlightFilterState {
  stops: 'any' | 'direct' | '1stop' | '2stop';
  maxDuration: number | null; // minutes
  mixedCarriers: 'any' | 'yes' | 'no';
  selectedCarriers: Set<string>;
  depRange: [number, number];
  arrRange: [number, number];
}

export const defaultFilterState: FlightFilterState = {
  stops: 'any',
  maxDuration: null,
  mixedCarriers: 'any',
  selectedCarriers: new Set(),
  depRange: [0, 24],
  arrRange: [0, 24],
};

const DURATION_OPTIONS: { label: string; value: number }[] = [
  { label: '< 4h', value: 240 },
  { label: '< 8h', value: 480 },
  { label: '< 12h', value: 720 },
  { label: '< 16h', value: 960 },
  { label: '< 20h', value: 1200 },
  { label: '< 24h', value: 1440 },
  { label: '< 28h', value: 1680 },
];

function isMixedCarrier(segments: FlightSegment[] | undefined): boolean {
  if (!segments || segments.length <= 1) return false;
  const names = new Set<string>();
  for (const seg of segments) names.add(seg.airlineName);
  return names.size > 1;
}

function getCarrierName(r: FlightSearchResult): string {
  return r.airlineName;
}

function getHour(isoDate: string): number {
  const d = new Date(isoDate);
  return d.getHours() + d.getMinutes() / 60;
}

export function applyFlightFilters(
  results: FlightSearchResult[],
  filters: FlightFilterState,
  leg: 'outbound' | 'return' = 'outbound',
): FlightSearchResult[] {
  let filtered = results;

  if (leg === 'outbound') {
    // Stops
    if (filters.stops === 'direct') filtered = filtered.filter((r) => r.stops === 0);
    else if (filters.stops === '1stop') filtered = filtered.filter((r) => r.stops <= 1);
    else if (filters.stops === '2stop') filtered = filtered.filter((r) => r.stops <= 2);

    // Duration
    if (filters.maxDuration) filtered = filtered.filter((r) => parseDuration(r.duration) <= filters.maxDuration!);

    // Mixed carriers
    if (filters.mixedCarriers === 'yes') filtered = filtered.filter((r) => isMixedCarrier(r.segments));
    else if (filters.mixedCarriers === 'no') filtered = filtered.filter((r) => !isMixedCarrier(r.segments));

    // Carrier
    if (filters.selectedCarriers.size > 0) {
      filtered = filtered.filter((r) => filters.selectedCarriers.has(getCarrierName(r)));
    }

    // Dep time
    if (filters.depRange[0] > 0 || filters.depRange[1] < 24) {
      filtered = filtered.filter((r) => {
        const h = getHour(r.departureAt);
        return h >= filters.depRange[0] && h <= filters.depRange[1];
      });
    }

    // Arr time
    if (filters.arrRange[0] > 0 || filters.arrRange[1] < 24) {
      filtered = filtered.filter((r) => {
        const h = getHour(r.arrivalAt);
        return h >= filters.arrRange[0] && h <= filters.arrRange[1];
      });
    }
  } else {
    // Return leg filters
    if (filters.stops === 'direct') filtered = filtered.filter((r) => (r.returnStops ?? 0) === 0);
    else if (filters.stops === '1stop') filtered = filtered.filter((r) => (r.returnStops ?? 0) <= 1);
    else if (filters.stops === '2stop') filtered = filtered.filter((r) => (r.returnStops ?? 0) <= 2);

    if (filters.maxDuration) filtered = filtered.filter((r) => r.returnDuration ? parseDuration(r.returnDuration) <= filters.maxDuration! : true);

    if (filters.mixedCarriers === 'yes') filtered = filtered.filter((r) => isMixedCarrier(r.returnSegments));
    else if (filters.mixedCarriers === 'no') filtered = filtered.filter((r) => !isMixedCarrier(r.returnSegments));

    if (filters.selectedCarriers.size > 0) {
      filtered = filtered.filter((r) => {
        const name = r.returnSegments?.length ? r.returnSegments[0].airlineName : r.airlineName;
        return filters.selectedCarriers.has(name);
      });
    }

    if (filters.depRange[0] > 0 || filters.depRange[1] < 24) {
      filtered = filtered.filter((r) => {
        if (!r.returnDepartureAt) return true;
        const h = getHour(r.returnDepartureAt);
        return h >= filters.depRange[0] && h <= filters.depRange[1];
      });
    }

    if (filters.arrRange[0] > 0 || filters.arrRange[1] < 24) {
      filtered = filtered.filter((r) => {
        if (!r.returnArrivalAt) return true;
        const h = getHour(r.returnArrivalAt);
        return h >= filters.arrRange[0] && h <= filters.arrRange[1];
      });
    }
  }

  return filtered;
}

/** Extract all unique carrier names from results for a given leg */
export function extractCarriers(results: FlightSearchResult[], leg: 'outbound' | 'return' = 'outbound'): string[] {
  const set = new Set<string>();
  for (const r of results) {
    if (leg === 'outbound') {
      set.add(getCarrierName(r));
    } else {
      const name = r.returnSegments?.length ? r.returnSegments[0].airlineName : r.airlineName;
      set.add(name);
    }
  }
  return Array.from(set).sort();
}

interface TripLengthFilterProps {
  min: number;
  max: number;
  effectiveMin: number;
  effectiveMax: number;
  onMinChange: (v: number | null) => void;
  onMaxChange: (v: number | null) => void;
  filteredCount: number;
  totalCount: number;
}

interface FlightFiltersProps {
  label?: string;
  filters: FlightFilterState;
  onChange: (f: FlightFilterState) => void;
  carriers: string[];
  tripLength?: TripLengthFilterProps;
}

export function FlightFilters({ label, filters, onChange, carriers, tripLength }: FlightFiltersProps) {
  const [carrierDropdownOpen, setCarrierDropdownOpen] = useState(false);

  const allSelected = filters.selectedCarriers.size === 0;

  const toggleCarrier = (carrier: string) => {
    const next = new Set(filters.selectedCarriers);
    if (next.has(carrier)) {
      next.delete(carrier);
    } else {
      next.add(carrier);
    }
    onChange({ ...filters, selectedCarriers: next });
  };

  const selectAllCarriers = () => {
    onChange({ ...filters, selectedCarriers: new Set() });
  };

  const carrierButtonLabel = allSelected
    ? 'All'
    : filters.selectedCarriers.size === 1
      ? [...filters.selectedCarriers][0]
      : `${filters.selectedCarriers.size} selected`;

  return (
    <div className="px-3 sm:px-6 py-2 bg-gray-50 border-b border-gray-200">
      {label && <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</div>}
      <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
        {/* Stops */}
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <span>Stops:</span>
          <select
            value={filters.stops}
            onChange={(e) => onChange({ ...filters, stops: e.target.value as FlightFilterState['stops'] })}
            className="border border-gray-300 rounded px-1.5 py-0.5 text-xs"
          >
            <option value="any">Any</option>
            <option value="direct">Direct only</option>
            <option value="1stop">&le; 1 stop</option>
            <option value="2stop">&le; 2 stops</option>
          </select>
        </div>

        {/* Duration */}
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <span>Duration:</span>
          <select
            value={filters.maxDuration ?? ''}
            onChange={(e) => onChange({ ...filters, maxDuration: e.target.value ? Number(e.target.value) : null })}
            className="border border-gray-300 rounded px-1.5 py-0.5 text-xs"
          >
            <option value="">Any</option>
            {DURATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Mixed carriers */}
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <span>Mixed:</span>
          <select
            value={filters.mixedCarriers}
            onChange={(e) => onChange({ ...filters, mixedCarriers: e.target.value as FlightFilterState['mixedCarriers'] })}
            className="border border-gray-300 rounded px-1.5 py-0.5 text-xs"
          >
            <option value="any">Any</option>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>

        {/* Carrier multi-select */}
        <div className="flex items-center gap-1.5 text-xs text-gray-600 relative">
          <span>Carrier:</span>
          <button
            type="button"
            onClick={() => setCarrierDropdownOpen(!carrierDropdownOpen)}
            className="border border-gray-300 rounded px-1.5 py-0.5 text-xs bg-white min-w-[80px] text-left"
          >
            {carrierButtonLabel}
          </button>
          {carrierDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setCarrierDropdownOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[180px] max-h-60 overflow-auto">
                <button
                  onClick={selectAllCarriers}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 ${allSelected ? 'text-blue-700 font-medium' : 'text-gray-600'}`}
                >
                  Select All
                </button>
                <div className="border-t border-gray-100 my-0.5" />
                {carriers.map((c) => (
                  <label key={c} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allSelected || filters.selectedCarriers.has(c)}
                      onChange={() => {
                        if (allSelected) {
                          // Switch from "all" to selecting all except this one
                          const next = new Set(carriers);
                          next.delete(c);
                          onChange({ ...filters, selectedCarriers: next });
                        } else {
                          toggleCarrier(c);
                        }
                      }}
                      className="rounded"
                    />
                    {c}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Departure time slider */}
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <span>Depart:</span>
          <TimeRangeSlider value={filters.depRange} onChange={(v) => onChange({ ...filters, depRange: v })} />
        </div>

        {/* Arrival time slider */}
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <span>Arrive:</span>
          <TimeRangeSlider value={filters.arrRange} onChange={(v) => onChange({ ...filters, arrRange: v })} />
        </div>

        {/* Trip length (optional, time sweep only) */}
        {tripLength && (
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <span>Trip:</span>
            <input
              type="number"
              value={tripLength.effectiveMin}
              onChange={(e) => tripLength.onMinChange(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={tripLength.effectiveMax}
              className="w-14 border border-gray-300 rounded px-1.5 py-0.5 text-xs"
            />
            <span>to</span>
            <input
              type="number"
              value={tripLength.effectiveMax}
              onChange={(e) => tripLength.onMaxChange(Math.max(tripLength.effectiveMin, parseInt(e.target.value) || tripLength.effectiveMin))}
              min={tripLength.effectiveMin}
              className="w-14 border border-gray-300 rounded px-1.5 py-0.5 text-xs"
            />
            <span>days</span>
            {(tripLength.effectiveMin !== tripLength.min || tripLength.effectiveMax !== tripLength.max) && (
              <button
                onClick={() => { tripLength.onMinChange(null); tripLength.onMaxChange(null); }}
                className="text-blue-600 hover:text-blue-800 ml-1"
              >
                Reset
              </button>
            )}
            <span className="text-gray-400 ml-1">
              {tripLength.filteredCount}/{tripLength.totalCount}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatHour(h: number): string {
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function TimeRangeSlider({
  value,
  onChange,
}: {
  value: [number, number];
  onChange: (v: [number, number]) => void;
}) {
  const handlePointerDown = (thumb: 'min' | 'max') => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const bar = e.currentTarget.parentElement!;
    const rect = bar.getBoundingClientRect();

    const onMove = (ev: PointerEvent) => {
      const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const hour = Math.round(pct * 48) / 2; // snap to 30-min
      onChange(thumb === 'min'
        ? [Math.min(hour, value[1] - 0.5), value[1]]
        : [value[0], Math.max(hour, value[0] + 0.5)]
      );
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const leftPct = (value[0] / 24) * 100;
  const widthPct = ((value[1] - value[0]) / 24) * 100;
  const isDefault = value[0] === 0 && value[1] === 24;

  return (
    <div className="flex items-center gap-2">
      <span className={`text-[10px] tabular-nums w-[72px] text-center ${isDefault ? 'text-gray-400' : 'text-blue-600 font-medium'}`}>
        {formatHour(value[0])}&ndash;{formatHour(value[1])}
      </span>
      <div className="relative w-24 h-4 flex items-center">
        <div className="absolute inset-x-0 h-1 bg-gray-200 rounded-full" />
        <div
          className="absolute h-1 bg-blue-400 rounded-full"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        />
        <div
          className="absolute w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-pointer -translate-x-1/2 hover:scale-110 transition-transform"
          style={{ left: `${leftPct}%` }}
          onPointerDown={handlePointerDown('min')}
        />
        <div
          className="absolute w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-pointer -translate-x-1/2 hover:scale-110 transition-transform"
          style={{ left: `${leftPct + widthPct}%` }}
          onPointerDown={handlePointerDown('max')}
        />
      </div>
    </div>
  );
}

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
  selectedOrigins: Set<string>;
  selectedDestinations: Set<string>;
  selectedWaypoints: Set<string>;
  includeNoVia: boolean; // include direct flights (no waypoints) when waypoint filter is active
  departureDays: number[]; // 0=Sun..6=Sat, empty=all
  selectedCabins: Set<string>;
}

export const defaultFilterState: FlightFilterState = {
  stops: '2stop',
  maxDuration: null,
  mixedCarriers: 'any',
  selectedCarriers: new Set(),
  depRange: [0, 24],
  arrRange: [0, 24],
  selectedOrigins: new Set(),
  selectedDestinations: new Set(),
  selectedWaypoints: new Set(),
  includeNoVia: true,
  departureDays: [],
  selectedCabins: new Set(),
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

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_JS_VALUES = [1, 2, 3, 4, 5, 6, 0]; // Mon=1..Sat=6, Sun=0

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
): FlightSearchResult[] {
  let filtered = results;

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

  // Origin filter
  if (filters.selectedOrigins.size > 0) {
    filtered = filtered.filter((r) => filters.selectedOrigins.has(r.origin));
  }

  // Destination filter
  if (filters.selectedDestinations.size > 0) {
    filtered = filtered.filter((r) => filters.selectedDestinations.has(r.destination));
  }

  // Waypoint filter
  if (filters.selectedWaypoints.size > 0) {
    filtered = filtered.filter((r) => {
      const isDirect = !r.stopCodes || r.stopCodes.length === 0;
      if (isDirect) return filters.includeNoVia;
      return r.stopCodes.some((code) => filters.selectedWaypoints.has(code));
    });
  } else if (!filters.includeNoVia) {
    // "None" unchecked with no specific waypoints = show only flights with stops
    filtered = filtered.filter((r) => r.stopCodes && r.stopCodes.length > 0);
  }

  // Cabin filter
  if (filters.selectedCabins.size > 0) {
    filtered = filtered.filter((r) => filters.selectedCabins.has(r.cabin));
  }

  // Departure day of week filter
  if (filters.departureDays.length > 0) {
    filtered = filtered.filter((r) => {
      const d = new Date(r.departureAt);
      return filters.departureDays.includes(d.getDay());
    });
  }

  return filtered;
}

/** Extract all unique carrier names from results */
export function extractCarriers(results: FlightSearchResult[]): string[] {
  const set = new Set<string>();
  for (const r of results) {
    set.add(getCarrierName(r));
  }
  return Array.from(set).sort();
}

/** Extract unique values for a field from results */
export function extractUniqueValues(results: FlightSearchResult[], field: 'origin' | 'destination' | 'waypoints'): string[] {
  const set = new Set<string>();
  for (const r of results) {
    if (field === 'origin') set.add(r.origin);
    else if (field === 'destination') set.add(r.destination);
    else if (field === 'waypoints' && r.stopCodes) {
      for (const code of r.stopCodes) set.add(code);
    }
  }
  return Array.from(set).sort();
}

interface FlightFiltersProps {
  filters: FlightFilterState;
  onChange: (f: FlightFilterState) => void;
  carriers: string[];
  origins: string[];
  destinations: string[];
  waypoints: string[];
}

const CABIN_FILTER_OPTIONS = ['First', 'Business', 'Premium Economy', 'Economy'];

export function FlightFilters({ filters, onChange, carriers, origins, destinations, waypoints }: FlightFiltersProps) {
  const [carrierDropdownOpen, setCarrierDropdownOpen] = useState(false);
  const [originDropdownOpen, setOriginDropdownOpen] = useState(false);
  const [destDropdownOpen, setDestDropdownOpen] = useState(false);
  const [waypointDropdownOpen, setWaypointDropdownOpen] = useState(false);
  const [cabinDropdownOpen, setCabinDropdownOpen] = useState(false);

  const allCarriersSelected = filters.selectedCarriers.size === 0;

  const toggleCarrier = (carrier: string) => {
    const next = new Set(filters.selectedCarriers);
    if (next.has(carrier)) next.delete(carrier);
    else next.add(carrier);
    onChange({ ...filters, selectedCarriers: next });
  };

  const carrierButtonLabel = allCarriersSelected
    ? 'All'
    : filters.selectedCarriers.size === 1
      ? [...filters.selectedCarriers][0]
      : `${filters.selectedCarriers.size} selected`;

  const toggleDepartureDay = (day: number) => {
    const days = filters.departureDays.includes(day)
      ? filters.departureDays.filter((d) => d !== day)
      : [...filters.departureDays, day];
    onChange({ ...filters, departureDays: days });
  };

  return (
    <div className="px-3 sm:px-6 py-2 bg-gray-50 border-b border-gray-200">
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        {/* Stops */}
        <FilterSelect
          label="Stops"
          value={filters.stops}
          onChange={(v) => onChange({ ...filters, stops: v as FlightFilterState['stops'] })}
          options={[
            { value: 'any', label: 'Any' },
            { value: 'direct', label: 'Direct' },
            { value: '1stop', label: '\u2264 1 stop' },
            { value: '2stop', label: '\u2264 2 stops' },
          ]}
        />

        {/* Duration */}
        <FilterSelect
          label="Duration"
          value={filters.maxDuration != null ? String(filters.maxDuration) : ''}
          onChange={(v) => onChange({ ...filters, maxDuration: v ? Number(v) : null })}
          options={[{ value: '', label: 'Any' }, ...DURATION_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))]}
        />

        {/* Mixed carriers */}
        <FilterSelect
          label="Mixed"
          value={filters.mixedCarriers}
          onChange={(v) => onChange({ ...filters, mixedCarriers: v as FlightFilterState['mixedCarriers'] })}
          options={[
            { value: 'any', label: 'Any' },
            { value: 'no', label: 'No' },
            { value: 'yes', label: 'Yes' },
          ]}
        />

        {/* Carrier multi-select */}
        <MultiSelectDropdown
          label="Carrier"
          buttonLabel={carrierButtonLabel}
          open={carrierDropdownOpen}
          setOpen={setCarrierDropdownOpen}
          items={carriers}
          selected={filters.selectedCarriers}
          allSelected={allCarriersSelected}
          onToggle={toggleCarrier}
          onSelectAll={() => onChange({ ...filters, selectedCarriers: new Set() })}
        />

        {/* Dep time */}
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <span>Dep:</span>
          <TimeRangeSlider value={filters.depRange} onChange={(v) => onChange({ ...filters, depRange: v })} />
        </div>

        {/* Arr time */}
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <span>Arr:</span>
          <TimeRangeSlider value={filters.arrRange} onChange={(v) => onChange({ ...filters, arrRange: v })} />
        </div>

        {/* Origin filter */}
        {origins.length > 1 && (
          <MultiSelectDropdown
            label="Origin"
            buttonLabel={filters.selectedOrigins.size === 0 ? 'All' : `${filters.selectedOrigins.size} selected`}
            open={originDropdownOpen}
            setOpen={setOriginDropdownOpen}
            items={origins}
            selected={filters.selectedOrigins}
            allSelected={filters.selectedOrigins.size === 0}
            onToggle={(code) => {
              const next = new Set(filters.selectedOrigins);
              if (next.has(code)) next.delete(code);
              else next.add(code);
              onChange({ ...filters, selectedOrigins: next });
            }}
            onSelectAll={() => onChange({ ...filters, selectedOrigins: new Set() })}
          />
        )}

        {/* Destination filter */}
        {destinations.length > 1 && (
          <MultiSelectDropdown
            label="Dest"
            buttonLabel={filters.selectedDestinations.size === 0 ? 'All' : `${filters.selectedDestinations.size} selected`}
            open={destDropdownOpen}
            setOpen={setDestDropdownOpen}
            items={destinations}
            selected={filters.selectedDestinations}
            allSelected={filters.selectedDestinations.size === 0}
            onToggle={(code) => {
              const next = new Set(filters.selectedDestinations);
              if (next.has(code)) next.delete(code);
              else next.add(code);
              onChange({ ...filters, selectedDestinations: next });
            }}
            onSelectAll={() => onChange({ ...filters, selectedDestinations: new Set() })}
          />
        )}

        {/* Waypoint filter */}
        {waypoints.length > 0 && (
          <MultiSelectDropdown
            label="Via"
            buttonLabel={filters.selectedWaypoints.size === 0 ? 'All' : `${filters.selectedWaypoints.size} selected`}
            open={waypointDropdownOpen}
            setOpen={setWaypointDropdownOpen}
            items={waypoints}
            selected={filters.selectedWaypoints}
            allSelected={filters.selectedWaypoints.size === 0}
            onToggle={(code) => {
              const next = new Set(filters.selectedWaypoints);
              if (next.has(code)) next.delete(code);
              else next.add(code);
              onChange({ ...filters, selectedWaypoints: next });
            }}
            onSelectAll={() => onChange({ ...filters, selectedWaypoints: new Set(), includeNoVia: true })}
            noneOption={{
              checked: filters.includeNoVia,
              onChange: (v) => onChange({ ...filters, includeNoVia: v }),
            }}
          />
        )}

        {/* Departure day of week */}
        <div className="flex items-center gap-1 text-xs text-gray-600">
          <span>Day:</span>
          {DAY_LABELS.map((label, i) => {
            const jsDay = DAY_JS_VALUES[i];
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggleDepartureDay(jsDay)}
                className={`w-5 h-5 rounded text-[10px] font-medium transition-colors ${
                  filters.departureDays.length === 0 || filters.departureDays.includes(jsDay)
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Cabin filter */}
        <MultiSelectDropdown
          label="Cabin"
          buttonLabel={filters.selectedCabins.size === 0 ? 'All' : `${filters.selectedCabins.size} selected`}
          open={cabinDropdownOpen}
          setOpen={setCabinDropdownOpen}
          items={CABIN_FILTER_OPTIONS}
          selected={filters.selectedCabins}
          allSelected={filters.selectedCabins.size === 0}
          onToggle={(cabin) => {
            const next = new Set(filters.selectedCabins);
            if (next.has(cabin)) next.delete(cabin);
            else next.add(cabin);
            onChange({ ...filters, selectedCabins: next });
          }}
          onSelectAll={() => onChange({ ...filters, selectedCabins: new Set() })}
        />
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-600">
      <span>{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-300 rounded px-1.5 py-0.5 text-xs"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function MultiSelectDropdown({ label, buttonLabel, open, setOpen, items, selected, allSelected, onToggle, onSelectAll, noneOption }: {
  label: string;
  buttonLabel: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  items: string[];
  selected: Set<string>;
  allSelected: boolean;
  onToggle: (item: string) => void;
  onSelectAll: () => void;
  noneOption?: { checked: boolean; onChange: (v: boolean) => void };
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-600 relative">
      <span>{label}:</span>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="border border-gray-300 rounded px-1.5 py-0.5 text-xs bg-white min-w-[60px] text-left"
      >
        {buttonLabel}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px] max-h-60 overflow-auto">
            <button
              onClick={onSelectAll}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 ${allSelected ? 'text-blue-700 font-medium' : 'text-gray-600'}`}
            >
              Select All
            </button>
            {noneOption && (
              <label className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={noneOption.checked}
                  onChange={(e) => noneOption.onChange(e.target.checked)}
                  className="rounded"
                />
                <span className="italic text-gray-500">None (direct)</span>
              </label>
            )}
            <div className="border-t border-gray-100 my-0.5" />
            {items.map((item) => (
              <label key={item} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allSelected || selected.has(item)}
                  onChange={() => {
                    if (allSelected) {
                      // Switch from "all" to selecting all except this one
                      for (const i of items) {
                        if (i !== item) onToggle(i);
                      }
                      return;
                    }
                    onToggle(item);
                  }}
                  className="rounded"
                />
                {item}
              </label>
            ))}
          </div>
        </>
      )}
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

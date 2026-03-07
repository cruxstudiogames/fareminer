import { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { Search, Loader2, Table2, Map as MapIcon, Grid3x3, AlertTriangle, BarChart3, List } from 'lucide-react';
import { searchFlights, searchCachedFlights, generateDatesInRange, checkCachedCombos } from '../../services/flightService';
import { FlightResultsTable } from './FlightResultsTable';
import { FlightMap } from './FlightMap';
import { ODMatrix } from './ODMatrix';
import { TimeView } from './TimeView';
import { FlightFilters, applyFlightFilters, extractCarriers, extractUniqueValues } from './FlightFilters';
import { useFlightSearchStore } from '../../store/useFlightSearchStore';
import { useAuthStore } from '../../store/useAuthStore';
import { MultiAirportInput } from './MultiAirportInput';
import { useRecentAirports } from './AirportInput';
import type { FlightSearchResult } from '../../types';

// MTWTFSS order: display index -> JS day number (0=Sun)
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_JS_VALUES = [1, 2, 3, 4, 5, 6, 0]; // Mon=1..Sat=6, Sun=0
const CABIN_OPTIONS = ['Economy', 'Premium Economy', 'Business', 'First'];

export function FlightSearchPage() {
  const s = useFlightSearchStore((st) => st.search);
  const set = useFlightSearchStore((st) => st.setSearch);
  const addRecent = useRecentAirports((st) => st.addRecent);
  const user = useAuthStore((st) => st.user);
  const abortRef = useRef(false);

  const isOwner = user?.role === 'owner';

  // Apply user preferences as defaults (once on mount)
  const prefsApplied = useRef(false);
  useEffect(() => {
    if (!user || prefsApplied.current) return;
    prefsApplied.current = true;
    const updates: Partial<typeof s> = {};
    if (user.homePort && s.origins.length === 0) {
      updates.origins = [user.homePort];
    }
    if (user.defaultCurrency) {
      updates.currency = user.defaultCurrency;
    }
    if (Object.keys(updates).length > 0) set(updates);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build search combos
  const searchCombos = useMemo(() => {
    const dates = generateDatesInRange(s.dateBegin, s.dateEnd, s.daysOfWeek);
    const combos: { origin: string; destination: string; departureDate: string; adults: number; currency?: string; cabin?: string }[] = [];
    for (const origin of s.origins) {
      for (const destination of s.destinations) {
        if (origin === destination) continue;
        for (const date of dates) {
          combos.push({ origin, destination, departureDate: date, adults: s.passengers, currency: s.currency, cabin: s.cabin });
        }
      }
    }
    return combos;
  }, [s.origins, s.destinations, s.dateBegin, s.dateEnd, s.daysOfWeek, s.passengers, s.currency, s.cabin]);

  // Check which combos are cached (per-combo boolean array)
  const [comboCacheFlags, setComboCacheFlags] = useState<boolean[] | null>(null);
  useEffect(() => {
    if (searchCombos.length === 0) {
      setComboCacheFlags(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const results = await checkCachedCombos(searchCombos);
        if (!cancelled) setComboCacheFlags(results);
      } catch {
        if (!cancelled) setComboCacheFlags(null);
      }
    }, 300); // debounce
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchCombos]);

  const cacheStatus = useMemo(() => {
    if (!comboCacheFlags) return null;
    const cached = comboCacheFlags.filter(Boolean).length;
    return { cached, fresh: comboCacheFlags.length - cached };
  }, [comboCacheFlags]);

  const searchCost = useMemo(() => {
    if (!s.liveSearch) return 0;
    return cacheStatus?.fresh ?? searchCombos.length;
  }, [s.liveSearch, cacheStatus, searchCombos.length]);

  // Apply filters to results
  const filteredResults = useMemo(
    () => applyFlightFilters(s.results, s.filters),
    [s.results, s.filters],
  );

  const carriers = useMemo(() => extractCarriers(s.results), [s.results]);
  const uniqueOrigins = useMemo(() => extractUniqueValues(s.results, 'origin'), [s.results]);
  const uniqueDestinations = useMemo(() => extractUniqueValues(s.results, 'destination'), [s.results]);
  const uniqueWaypoints = useMemo(() => extractUniqueValues(s.results, 'waypoints'), [s.results]);

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (s.origins.length === 0 || s.destinations.length === 0) {
      set({ error: 'Please select at least one origin and one destination.' });
      return;
    }

    abortRef.current = false;
    set({ error: '', results: [], loading: true, searchProgress: null, viewMode: 'table' });

    // Add airports to recent
    for (const code of s.origins) addRecent(code);
    for (const code of s.destinations) addRecent(code);

    try {
      if (!s.liveSearch) {
        // Cache search
        const dates = generateDatesInRange(s.dateBegin, s.dateEnd, s.daysOfWeek);
        const results = await searchCachedFlights({
          origins: s.origins,
          destinations: s.destinations,
          departureDates: dates,
          cabin: s.cabin,
        });
        set({
          results: results as FlightSearchResult[],
          loading: false,
          searchProgress: null,
        });
        if (results.length === 0) set({ error: 'No cached results found. Try a live search.' });
      } else {
        // Live search: iterate over all O/D/date combinations
        const dates = generateDatesInRange(s.dateBegin, s.dateEnd, s.daysOfWeek);
        const combos: { origin: string; destination: string; date: string }[] = [];
        for (const origin of s.origins) {
          for (const destination of s.destinations) {
            if (origin === destination) continue;
            for (const date of dates) {
              combos.push({ origin, destination, date });
            }
          }
        }

        if (combos.length === 0) {
          set({ error: 'No valid search combinations. Check your origins, destinations, and dates.', loading: false });
          return;
        }

        set({ searchProgress: { completed: 0, total: combos.length } });
        const allResults: FlightSearchResult[] = [];
        let completed = 0;

        for (const combo of combos) {
          if (abortRef.current) {
            set({ error: `Search cancelled. ${allResults.length} results collected.`, loading: false, searchProgress: null });
            return;
          }
          try {
            const results = await searchFlights({
              origin: combo.origin,
              destination: combo.destination,
              departureDate: combo.date,
              adults: s.passengers,
              currency: s.currency,
              cabin: s.cabin,
            });
            allResults.push(...results);
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Search failed';
            if (msg.includes('INSUFFICIENT_CREDITS') || msg.includes('Insufficient credits')) {
              set({
                results: allResults,
                error: `Ran out of credits after ${completed} searches. ${allResults.length} results collected.`,
                loading: false,
                searchProgress: null,
              });
              return;
            }
            // Continue on individual search errors
            console.warn(`Search failed for ${combo.origin}-${combo.destination} ${combo.date}:`, msg);
          }
          completed++;
          set({ results: [...allResults], searchProgress: { completed, total: combos.length } });
        }

        set({ results: allResults, loading: false, searchProgress: null });
        if (allResults.length === 0) set({ error: 'No flights found.' });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Search failed', loading: false, searchProgress: null });
    }
  }, [s.origins, s.destinations, s.dateBegin, s.dateEnd, s.daysOfWeek, s.passengers, s.currency, s.cabin, s.liveSearch, set, addRecent]);

  const handleCancel = useCallback(() => {
    abortRef.current = true;
  }, []);

  const toggleDayOfWeek = useCallback((jsDay: number) => {
    set({
      daysOfWeek: s.daysOfWeek.includes(jsDay)
        ? s.daysOfWeek.filter((d) => d !== jsDay)
        : [...s.daysOfWeek, jsDay],
    });
  }, [s.daysOfWeek, set]);

  const handleODCellClick = useCallback((origin: string, destination: string) => {
    set({
      filters: {
        ...s.filters,
        selectedOrigins: new Set([origin]),
        selectedDestinations: new Set([destination]),
      },
      viewMode: 'table',
    });
  }, [s.filters, set]);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left panel - Search Query */}
      <div className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-auto">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">Search</h2>
        </div>

        <form onSubmit={handleSearch} className="flex-1 overflow-auto">
          <div className="p-4 space-y-4">
            {/* Origins */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Departure Airports</label>
              <MultiAirportInput
                codes={s.origins}
                onChange={(codes) => set({ origins: codes })}
                placeholder="Add airports..."
                color="blue"
              />
            </div>

            {/* Destinations */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Arrival Airports</label>
              <MultiAirportInput
                codes={s.destinations}
                onChange={(codes) => set({ destinations: codes })}
                placeholder="Add airports..."
                color="green"
              />
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date Begin</label>
                <input
                  type="date"
                  value={s.dateBegin}
                  onChange={(e) => set({ dateBegin: e.target.value })}
                  required
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date End</label>
                <input
                  type="date"
                  value={s.dateEnd}
                  onChange={(e) => set({ dateEnd: e.target.value })}
                  min={s.dateBegin}
                  required
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </div>

            {/* Day of Week */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Days of Week</label>
              <div className="flex gap-1">
                {DAY_LABELS.map((label, i) => {
                  const jsDay = DAY_JS_VALUES[i];
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDayOfWeek(jsDay)}
                      className={`w-8 h-7 rounded text-xs font-medium transition-colors ${
                        s.daysOfWeek.length === 0 || s.daysOfWeek.includes(jsDay)
                          ? 'bg-blue-100 text-blue-700 border border-blue-300'
                          : 'bg-gray-100 text-gray-400 border border-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {s.daysOfWeek.length === 0 ? 'All days' : `${s.daysOfWeek.length} selected`}
              </p>
            </div>

            {/* Passengers */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Passengers</label>
                <input
                  type="number"
                  value={s.passengers}
                  onChange={(e) => set({ passengers: Math.max(1, parseInt(e.target.value) || 1) })}
                  min={1}
                  max={9}
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
                <input
                  value={s.currency}
                  onChange={(e) => set({ currency: e.target.value.toUpperCase() })}
                  placeholder="USD"
                  maxLength={3}
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm uppercase placeholder:normal-case focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </div>

            {/* Cabin */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cabin</label>
              <select
                value={s.cabin}
                onChange={(e) => set({ cabin: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                {CABIN_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Live Search Toggle */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <span className="font-medium">Live Search</span>
                <input
                  type="checkbox"
                  checked={s.liveSearch}
                  onChange={(e) => set({ liveSearch: e.target.checked })}
                  className="rounded border-gray-300"
                />
              </label>
            </div>

            {/* Cache status & credit warning */}
            {cacheStatus && searchCombos.length > 0 && (
              <div className="p-2 bg-gray-100 border border-gray-200 rounded-md text-xs text-gray-600 space-y-1">
                <div>{searchCombos.length} queries: <span className="text-green-600 font-medium">{cacheStatus.cached} cached</span>, <span className="text-amber-600 font-medium">{cacheStatus.fresh} new</span></div>
                {s.liveSearch && cacheStatus.fresh > 0 && !isOwner && (
                  <div className="flex items-center gap-1 text-amber-700">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    <span>Will use <strong>{cacheStatus.fresh}</strong> credit{cacheStatus.fresh !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Search Button */}
          <div className="p-4 border-t border-gray-200 bg-gray-50 sticky bottom-0">
            {s.loading ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="w-full bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 flex items-center justify-center gap-2"
                >
                  Cancel
                </button>
                {s.searchProgress && (
                  <div>
                    <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                      <span>{s.searchProgress.completed}/{s.searchProgress.total}</span>
                      <span>{Math.round((s.searchProgress.completed / s.searchProgress.total) * 100)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${(s.searchProgress.completed / s.searchProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="submit"
                disabled={s.origins.length === 0 || s.destinations.length === 0}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Search className="w-4 h-4" />
                Search
                {s.liveSearch && !isOwner && searchCost > 0 && (
                  <span className="text-blue-200 text-xs">({searchCost} credits)</span>
                )}
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Right panel - Filters + Results */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {s.error && (
          <p className="mx-3 sm:mx-6 mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">{s.error}</p>
        )}

        {/* Filters bar - only when results exist and not on build view */}
        {s.results.length > 0 && s.viewMode !== 'build' && (
          <FlightFilters
            filters={s.filters}
            onChange={(f) => set({ filters: f })}
            carriers={carriers}
            origins={uniqueOrigins}
            destinations={uniqueDestinations}
            waypoints={uniqueWaypoints}
          />
        )}

        {/* View toggle - always visible */}
        <div className="flex items-center justify-between px-3 sm:px-6 py-2 bg-gray-50 border-b border-gray-200">
          <div className="text-xs text-gray-500">
            {s.viewMode === 'build' ? (
              <span>{searchCombos.length} quer{searchCombos.length !== 1 ? 'ies' : 'y'}</span>
            ) : s.results.length > 0 ? (
              <>
                {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''}
                {filteredResults.length !== s.results.length && (
                  <span className="text-gray-400 ml-1">({s.results.length} total)</span>
                )}
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-1 bg-gray-200 rounded p-0.5">
            <button
              onClick={() => set({ viewMode: 'build' })}
              className={`p-1 rounded text-xs flex items-center gap-1 ${s.viewMode === 'build' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <List className="w-3.5 h-3.5" />
              Build
            </button>
            <button
              onClick={() => set({ viewMode: 'table' })}
              className={`p-1 rounded text-xs flex items-center gap-1 ${s.viewMode === 'table' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Table2 className="w-3.5 h-3.5" />
              Table
            </button>
            <button
              onClick={() => set({ viewMode: 'time' })}
              className={`p-1 rounded text-xs flex items-center gap-1 ${s.viewMode === 'time' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Chart
            </button>
            <button
              onClick={() => set({ viewMode: 'od' })}
              className={`p-1 rounded text-xs flex items-center gap-1 ${s.viewMode === 'od' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Grid3x3 className="w-3.5 h-3.5" />
              O&D
            </button>
            <button
              onClick={() => set({ viewMode: 'map' })}
              className={`p-1 rounded text-xs flex items-center gap-1 ${s.viewMode === 'map' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              Map
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto">
          {s.viewMode === 'build' && (
            <QueryBuildTable combos={searchCombos} cacheFlags={comboCacheFlags} />
          )}
          {s.viewMode !== 'build' && s.results.length > 0 && (
            <>
              {s.viewMode === 'table' && (
                <FlightResultsTable results={filteredResults} passengers={s.passengers} showCacheAge />
              )}
              {s.viewMode === 'time' && (
                <TimeView results={filteredResults} />
              )}
              {s.viewMode === 'od' && (
                <ODMatrix results={filteredResults} onCellClick={handleODCellClick} />
              )}
              {s.viewMode === 'map' && (
                <FlightMap results={filteredResults} />
              )}
            </>
          )}
          {s.viewMode !== 'build' && s.loading && s.results.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm h-full">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Searching...
            </div>
          )}
          {s.viewMode !== 'build' && !s.loading && s.results.length === 0 && !s.error && (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm p-4 text-center h-full">
              Configure your search and click Search to see results
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QueryBuildTable({ combos, cacheFlags }: {
  combos: { origin: string; destination: string; departureDate: string; adults: number; currency?: string; cabin?: string }[];
  cacheFlags: boolean[] | null;
}) {
  if (combos.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm p-4 h-full">
        Add origins, destinations, and dates to see query plan
      </div>
    );
  }

  const cachedCount = cacheFlags ? cacheFlags.filter(Boolean).length : 0;
  const freshCount = cacheFlags ? cacheFlags.length - cachedCount : combos.length;

  return (
    <div className="p-4">
      <div className="mb-3 text-xs text-gray-500">
        {combos.length} quer{combos.length !== 1 ? 'ies' : 'y'}:
        {cacheFlags && (
          <>
            {' '}<span className="text-green-600 font-medium">{cachedCount} cached</span>,
            {' '}<span className="text-amber-600 font-medium">{freshCount} new</span>
          </>
        )}
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-100 text-gray-600">
            <th className="text-left px-3 py-1.5 font-medium border-b border-gray-200">#</th>
            <th className="text-left px-3 py-1.5 font-medium border-b border-gray-200">Origin</th>
            <th className="text-left px-3 py-1.5 font-medium border-b border-gray-200">Destination</th>
            <th className="text-left px-3 py-1.5 font-medium border-b border-gray-200">Date</th>
            <th className="text-left px-3 py-1.5 font-medium border-b border-gray-200">Cabin</th>
            <th className="text-left px-3 py-1.5 font-medium border-b border-gray-200">Status</th>
          </tr>
        </thead>
        <tbody>
          {combos.map((combo, i) => {
            const isCached = cacheFlags?.[i] ?? false;
            return (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                <td className="px-3 py-1.5 font-mono">{combo.origin}</td>
                <td className="px-3 py-1.5 font-mono">{combo.destination}</td>
                <td className="px-3 py-1.5">{combo.departureDate}</td>
                <td className="px-3 py-1.5">{combo.cabin || 'Economy'}</td>
                <td className="px-3 py-1.5">
                  {cacheFlags === null ? (
                    <span className="text-gray-400">checking...</span>
                  ) : isCached ? (
                    <span className="text-green-600 font-medium">cached</span>
                  ) : (
                    <span className="text-amber-600 font-medium">new</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { Search, Loader2, Table2, Map as MapIcon, Grid3x3, BarChart3, List, RefreshCw } from 'lucide-react';
import { searchFlights, searchCachedFlights, generateDatesInRange, checkCachedCombos, type CacheCheckResult } from '../../services/flightService';
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

  // Check which combos are cached (per-combo metadata)
  const [comboCacheInfo, setComboCacheInfo] = useState<CacheCheckResult[] | null>(null);
  useEffect(() => {
    if (searchCombos.length === 0) {
      setComboCacheInfo(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const results = await checkCachedCombos(searchCombos);
        if (!cancelled) setComboCacheInfo(results);
      } catch {
        if (!cancelled) setComboCacheInfo(null);
      }
    }, 300); // debounce
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchCombos]);

  const cacheStatus = useMemo(() => {
    if (!comboCacheInfo) return null;
    const cached = comboCacheInfo.filter((c) => c.cached).length;
    return { cached, fresh: comboCacheInfo.length - cached };
  }, [comboCacheInfo]);

  // Auto-select best default search mode when cache status changes
  useEffect(() => {
    if (!cacheStatus) return;
    if (cacheStatus.fresh > 0 && cacheStatus.cached > 0) {
      set({ searchMode: 'fill' });
    } else if (cacheStatus.fresh === 0) {
      set({ searchMode: 'cached' });
    } else {
      set({ searchMode: 'refresh' });
    }
  }, [cacheStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchCost = useMemo(() => {
    if (s.searchMode === 'cached') return 0;
    if (s.searchMode === 'fill') return cacheStatus?.fresh ?? searchCombos.length;
    return searchCombos.length; // refresh
  }, [s.searchMode, cacheStatus, searchCombos.length]);

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
    set({ error: '', results: [], comboResults: new Map(), loading: true, searchProgress: null, viewMode: 'table' });

    // Add airports to recent
    for (const code of s.origins) addRecent(code);
    for (const code of s.destinations) addRecent(code);

    try {
      if (s.searchMode === 'cached') {
        // Cache-only search
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
        if (results.length === 0) set({ error: 'No cached results found.' });
      } else {
        // Live search (refresh = all combos, fill = only new combos)
        const dates = generateDatesInRange(s.dateBegin, s.dateEnd, s.daysOfWeek);
        const combos: { origin: string; destination: string; date: string }[] = [];
        let comboIdx = 0;
        for (const origin of s.origins) {
          for (const destination of s.destinations) {
            if (origin === destination) continue;
            for (const date of dates) {
              // In fill mode, skip combos that are already cached
              if (s.searchMode === 'fill' && comboCacheInfo?.[comboIdx]?.cached) {
                comboIdx++;
                continue;
              }
              combos.push({ origin, destination, date });
              comboIdx++;
            }
          }
        }

        // In fill mode, start by loading cached results
        const allResults: FlightSearchResult[] = [];
        if (s.searchMode === 'fill') {
          try {
            const cachedResults = await searchCachedFlights({
              origins: s.origins,
              destinations: s.destinations,
              departureDates: dates,
              cabin: s.cabin,
            });
            allResults.push(...(cachedResults as FlightSearchResult[]));
            set({ results: [...allResults] });
          } catch {
            // Continue even if cache fetch fails
          }
        }

        if (combos.length === 0) {
          if (allResults.length > 0) {
            set({ results: allResults, loading: false, searchProgress: null });
          } else {
            set({ error: 'No valid search combinations. Check your origins, destinations, and dates.', loading: false });
          }
          return;
        }

        set({ searchProgress: { completed: 0, total: combos.length } });
        let completed = 0;
        const comboResults: Map<string, number> = new Map();

        for (const combo of combos) {
          if (abortRef.current) {
            set({ error: `Search cancelled. ${allResults.length} results collected.`, loading: false, searchProgress: null });
            return;
          }
          const comboKey = `${combo.origin}-${combo.destination}-${combo.date}`;
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
            comboResults.set(comboKey, results.length);
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Search failed';
            comboResults.set(comboKey, -1); // mark as failed
            if (msg.includes('INSUFFICIENT_CREDITS') || msg.includes('Insufficient credits')) {
              set({
                results: allResults,
                comboResults: new Map(comboResults),
                error: `Ran out of credits after ${completed} searches. ${allResults.length} results collected.`,
                loading: false,
                searchProgress: null,
              });
              return;
            }
            console.warn(`Search failed for ${comboKey}:`, msg);
          }
          completed++;
          set({ results: [...allResults], comboResults: new Map(comboResults), searchProgress: { completed, total: combos.length } });
        }

        set({ results: allResults, comboResults: new Map(comboResults), loading: false, searchProgress: null });
        if (allResults.length === 0) set({ error: 'No flights found.' });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Search failed', loading: false, searchProgress: null });
    }
  }, [s.origins, s.destinations, s.dateBegin, s.dateEnd, s.daysOfWeek, s.passengers, s.currency, s.cabin, s.searchMode, comboCacheInfo, set, addRecent]);

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

  const handleRefreshRow = useCallback(async (combo: { origin: string; destination: string; departureDate: string; adults: number; currency?: string; cabin?: string }) => {
    const comboKey = `${combo.origin}-${combo.destination}-${combo.departureDate}`;
    // Mark as loading
    const updated = new Map(s.comboResults);
    updated.set(comboKey, -2); // -2 = loading
    set({ comboResults: updated });
    try {
      const results = await searchFlights({
        origin: combo.origin,
        destination: combo.destination,
        departureDate: combo.departureDate,
        adults: combo.adults,
        currency: combo.currency,
        cabin: combo.cabin,
      });
      const next = new Map(s.comboResults);
      next.set(comboKey, results.length);
      // Merge new results: remove old results for this combo, add new ones
      const filtered = s.results.filter((r) => {
        const dep = r.departureAt.split('T')[0];
        return !(r.origin === combo.origin && r.destination === combo.destination && dep === combo.departureDate);
      });
      set({ results: [...filtered, ...results], comboResults: next });
    } catch {
      const next = new Map(s.comboResults);
      next.set(comboKey, -1);
      set({ comboResults: next });
    }
  }, [s.comboResults, s.results, set]);

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

            {/* Search Mode */}
            {cacheStatus && searchCombos.length > 0 && (
              <div className="p-2 bg-gray-100 border border-gray-200 rounded-md text-xs text-gray-600 space-y-1.5">
                <div className="font-medium text-gray-700">{searchCombos.length} queries: <span className="text-green-600">{cacheStatus.cached} cached</span>, <span className="text-amber-600">{cacheStatus.fresh} new</span></div>
                <div className="space-y-1">
                  {cacheStatus.fresh > 0 && cacheStatus.cached > 0 && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="searchMode"
                        checked={s.searchMode === 'fill'}
                        onChange={() => set({ searchMode: 'fill' })}
                        className="text-blue-600"
                      />
                      <span>Fill new queries{!isOwner && <span className="text-amber-600 ml-1">({cacheStatus.fresh} credits)</span>}</span>
                    </label>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="searchMode"
                      checked={s.searchMode === 'refresh'}
                      onChange={() => set({ searchMode: 'refresh' })}
                      className="text-blue-600"
                    />
                    <span>Refresh all{!isOwner && <span className="text-amber-600 ml-1">({searchCombos.length} credits)</span>}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="searchMode"
                      checked={s.searchMode === 'cached'}
                      onChange={() => set({ searchMode: 'cached' })}
                      className="text-blue-600"
                    />
                    <span>Cached only{!isOwner && <span className="text-green-600 ml-1">(0 credits)</span>}</span>
                  </label>
                </div>
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
                {s.searchMode !== 'cached' && !isOwner && searchCost > 0 && (
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
        <div className={`flex-1 ${s.viewMode === 'map' ? 'relative' : 'overflow-auto'}`}>
          {s.viewMode === 'build' && (
            <QueryBuildTable combos={searchCombos} cacheInfo={comboCacheInfo} comboResults={s.comboResults} onRefreshRow={handleRefreshRow} />
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

function formatCacheAge(cachedAt: string): string {
  const d = new Date(cachedAt);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffH / 24);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  if (diffD === 0) return `today ${time}`;
  if (diffD === 1) return `yesterday ${time}`;
  return `${date} ${time}`;
}

type BuildSortCol = 'origin' | 'destination' | 'date' | 'cabin' | 'status' | 'flights' | 'refreshed';
type BuildSortDir = 'asc' | 'desc';

interface BuildFilters {
  origin: Set<string>;
  destination: Set<string>;
  cabin: Set<string>;
  status: Set<string>;
}

function getRowStatus(isCached: boolean, resultCount: number | undefined, cachedResultCount: number | undefined): string {
  if (resultCount === -2) return 'loading';
  if (resultCount === -1) return 'failed';
  if (isCached && resultCount === undefined) {
    return cachedResultCount === 0 ? 'empty' : 'cached';
  }
  if (resultCount !== undefined) {
    return resultCount === 0 ? 'empty' : 'done';
  }
  return 'new';
}

function getRowFlights(resultCount: number | undefined, cachedResultCount: number | undefined): number {
  if (resultCount !== undefined && resultCount >= 0) return resultCount;
  if (cachedResultCount !== undefined) return cachedResultCount;
  return -Infinity; // unknown sorts last
}

function FilterDropdown({ values, selected, onChange }: {
  values: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = selected.size > 0 && selected.size < values.length;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`ml-1 text-[9px] leading-none align-middle ${active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
        title="Filter"
      >
        {active ? `(${selected.size})` : '▼'}
      </button>
      {open && (
        <div className="absolute z-20 top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg py-1 min-w-[100px] max-h-48 overflow-auto">
          <button
            type="button"
            className="block w-full text-left px-2 py-0.5 text-[10px] text-blue-600 hover:bg-gray-50"
            onClick={() => { onChange(new Set()); setOpen(false); }}
          >
            Show all
          </button>
          {values.map((v) => (
            <label key={v} className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.size === 0 || selected.has(v)}
                onChange={(e) => {
                  const next = new Set(selected.size === 0 ? values : selected);
                  if (e.target.checked) next.add(v); else next.delete(v);
                  onChange(next.size === values.length ? new Set() : next);
                }}
                className="rounded border-gray-300"
              />
              {v}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function QueryBuildTable({ combos, cacheInfo, comboResults, onRefreshRow }: {
  combos: { origin: string; destination: string; departureDate: string; adults: number; currency?: string; cabin?: string }[];
  cacheInfo: CacheCheckResult[] | null;
  comboResults: Map<string, number>;
  onRefreshRow: (combo: { origin: string; destination: string; departureDate: string; adults: number; currency?: string; cabin?: string }) => void;
}) {
  const [sortCol, setSortCol] = useState<BuildSortCol | null>(null);
  const [sortDir, setSortDir] = useState<BuildSortDir>('asc');
  const [filters, setFilters] = useState<BuildFilters>({ origin: new Set(), destination: new Set(), cabin: new Set(), status: new Set() });

  const toggleSort = useCallback((col: BuildSortCol) => {
    if (sortCol === col) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }, [sortCol]);

  // Build enriched rows with index preserved
  const rows = useMemo(() => combos.map((combo, i) => {
    const info = cacheInfo?.[i];
    const isCached = info?.cached ?? false;
    const comboKey = `${combo.origin}-${combo.destination}-${combo.departureDate}`;
    const resultCount = comboResults.get(comboKey);
    const status = getRowStatus(isCached, resultCount, info?.resultCount);
    const flights = getRowFlights(resultCount, info?.resultCount);
    return { combo, info, resultCount, isCached, status, flights, comboKey, idx: i };
  }), [combos, cacheInfo, comboResults]);

  // Unique values for filter dropdowns
  const uniqueOrigins = useMemo(() => [...new Set(combos.map((c) => c.origin))].sort(), [combos]);
  const uniqueDestinations = useMemo(() => [...new Set(combos.map((c) => c.destination))].sort(), [combos]);
  const uniqueCabins = useMemo(() => [...new Set(combos.map((c) => c.cabin || 'Economy'))].sort(), [combos]);
  const uniqueStatuses = useMemo(() => [...new Set(rows.map((r) => r.status))].sort(), [rows]);

  // Filter
  const filtered = useMemo(() => rows.filter((r) => {
    if (filters.origin.size > 0 && !filters.origin.has(r.combo.origin)) return false;
    if (filters.destination.size > 0 && !filters.destination.has(r.combo.destination)) return false;
    if (filters.cabin.size > 0 && !filters.cabin.has(r.combo.cabin || 'Economy')) return false;
    if (filters.status.size > 0 && !filters.status.has(r.status)) return false;
    return true;
  }), [rows, filters]);

  // Sort
  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    const arr = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case 'origin': cmp = a.combo.origin.localeCompare(b.combo.origin); break;
        case 'destination': cmp = a.combo.destination.localeCompare(b.combo.destination); break;
        case 'date': cmp = a.combo.departureDate.localeCompare(b.combo.departureDate); break;
        case 'cabin': cmp = (a.combo.cabin || 'Economy').localeCompare(b.combo.cabin || 'Economy'); break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
        case 'flights': cmp = a.flights - b.flights; break;
        case 'refreshed': {
          const aT = a.info?.cachedAt ? new Date(a.info.cachedAt).getTime() : 0;
          const bT = b.info?.cachedAt ? new Date(b.info.cachedAt).getTime() : 0;
          cmp = aT - bT;
          break;
        }
      }
      return cmp * dir;
    });
    return arr;
  }, [filtered, sortCol, sortDir]);

  if (combos.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm p-4 h-full">
        Add origins, destinations, and dates to see query plan
      </div>
    );
  }

  const cachedCount = cacheInfo ? cacheInfo.filter((c) => c.cached).length : 0;
  const freshCount = cacheInfo ? cacheInfo.length - cachedCount : combos.length;

  const sortIndicator = (col: BuildSortCol) => sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const thClass = 'text-left px-3 py-1.5 font-medium border-b border-gray-200 cursor-pointer select-none hover:text-gray-900 whitespace-nowrap';

  return (
    <div className="p-4">
      <div className="mb-3 text-xs text-gray-500 flex items-center gap-2">
        <span>
          {combos.length} quer{combos.length !== 1 ? 'ies' : 'y'}:
          {cacheInfo && (
            <>
              {' '}<span className="text-green-600 font-medium">{cachedCount} cached</span>,
              {' '}<span className="text-amber-600 font-medium">{freshCount} new</span>
            </>
          )}
        </span>
        {filtered.length !== rows.length && (
          <span className="text-blue-600">(showing {filtered.length})</span>
        )}
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-100 text-gray-600">
            <th className="text-left px-3 py-1.5 font-medium border-b border-gray-200">#</th>
            <th className={thClass} onClick={() => toggleSort('origin')}>
              Origin{sortIndicator('origin')}
              {uniqueOrigins.length > 1 && <FilterDropdown values={uniqueOrigins} selected={filters.origin} onChange={(s) => setFilters((f) => ({ ...f, origin: s }))} />}
            </th>
            <th className={thClass} onClick={() => toggleSort('destination')}>
              Dest{sortIndicator('destination')}
              {uniqueDestinations.length > 1 && <FilterDropdown values={uniqueDestinations} selected={filters.destination} onChange={(s) => setFilters((f) => ({ ...f, destination: s }))} />}
            </th>
            <th className={thClass} onClick={() => toggleSort('date')}>Date{sortIndicator('date')}</th>
            <th className={thClass} onClick={() => toggleSort('cabin')}>
              Cabin{sortIndicator('cabin')}
              {uniqueCabins.length > 1 && <FilterDropdown values={uniqueCabins} selected={filters.cabin} onChange={(s) => setFilters((f) => ({ ...f, cabin: s }))} />}
            </th>
            <th className={thClass} onClick={() => toggleSort('status')}>
              Status{sortIndicator('status')}
              {uniqueStatuses.length > 1 && <FilterDropdown values={uniqueStatuses} selected={filters.status} onChange={(s) => setFilters((f) => ({ ...f, status: s }))} />}
            </th>
            <th className={thClass} onClick={() => toggleSort('flights')}>Flights{sortIndicator('flights')}</th>
            <th className={thClass} onClick={() => toggleSort('refreshed')}>Last Refreshed{sortIndicator('refreshed')}</th>
            <th className="text-left px-3 py-1.5 font-medium border-b border-gray-200"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const { combo, info, resultCount, isCached, status, comboKey } = row;
            const isLoading = resultCount === -2;
            const isFailed = resultCount === -1;
            const isZero = status === 'empty';
            const rowBg = isFailed ? 'bg-red-50' : (isZero ? 'bg-amber-50' : '');
            return (
              <tr key={comboKey} className={`border-b border-gray-100 hover:bg-gray-50 ${rowBg}`}>
                <td className="px-3 py-1.5 text-gray-400">{row.idx + 1}</td>
                <td className="px-3 py-1.5 font-mono">{combo.origin}</td>
                <td className="px-3 py-1.5 font-mono">{combo.destination}</td>
                <td className="px-3 py-1.5">{combo.departureDate}</td>
                <td className="px-3 py-1.5">{combo.cabin || 'Economy'}</td>
                <td className="px-3 py-1.5">
                  {cacheInfo === null ? (
                    <span className="text-gray-400">checking...</span>
                  ) : isLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin text-blue-500 inline" />
                  ) : isFailed ? (
                    <span className="text-red-600 font-medium">failed</span>
                  ) : isCached && resultCount === undefined ? (
                    <span className={`font-medium ${isZero ? 'text-amber-600' : 'text-green-600'}`}>cached</span>
                  ) : resultCount !== undefined ? (
                    <span className="text-green-600 font-medium">done</span>
                  ) : (
                    <span className="text-amber-600 font-medium">new</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  {isLoading ? (
                    <span className="text-gray-400">...</span>
                  ) : isFailed ? (
                    <span className="text-red-500">--</span>
                  ) : resultCount !== undefined && resultCount >= 0 ? (
                    <span className={resultCount === 0 ? 'text-amber-600 font-medium' : ''}>{resultCount}</span>
                  ) : info?.resultCount !== undefined ? (
                    <span className={info.resultCount === 0 ? 'text-amber-600 font-medium' : ''}>{info.resultCount}</span>
                  ) : (
                    <span className="text-gray-300">--</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-gray-400">
                  {info?.cachedAt ? formatCacheAge(info.cachedAt) : '--'}
                </td>
                <td className="px-3 py-1.5">
                  {!isLoading && (
                    <button
                      type="button"
                      onClick={() => onRefreshRow(combo)}
                      className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Refresh this query"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
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

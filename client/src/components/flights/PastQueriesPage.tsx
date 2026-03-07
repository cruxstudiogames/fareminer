import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, RefreshCw, Loader2, Plane, Search, Users } from 'lucide-react';
import { fetchCachedQueries, fetchCachedResults, searchCachedFlights } from '../../services/cacheService';
import type { CachedQuery, FlightSearchResult, CacheSearchResult } from '../../types';
import { FlightResultsTable } from './FlightResultsTable';
import { useAuthStore } from '../../store/useAuthStore';

type ViewMode = 'queries' | 'search';

export function PastQueriesPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('queries');
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [showAllUsers, setShowAllUsers] = useState(false);

  // Query list state
  const [queries, setQueries] = useState<CachedQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedResults, setExpandedResults] = useState<FlightSearchResult[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);

  // Search state
  const [searchOrigin, setSearchOrigin] = useState('');
  const [searchDestination, setSearchDestination] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [searchResults, setSearchResults] = useState<CacheSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const loadQueries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchCachedQueries(showAllUsers && isAdmin);
      setQueries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queries');
    } finally {
      setLoading(false);
    }
  }, [showAllUsers, isAdmin]);

  useEffect(() => { loadQueries(); }, [loadQueries]);

  const toggleExpand = async (queryId: number) => {
    if (expandedId === queryId) {
      setExpandedId(null);
      setExpandedResults([]);
      return;
    }

    setExpandedId(queryId);
    setLoadingResults(true);
    try {
      const results = await fetchCachedResults(queryId);
      setExpandedResults(results);
    } catch {
      setExpandedResults([]);
    } finally {
      setLoadingResults(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const origin = searchOrigin.trim();
    const destination = searchDestination.trim();
    const departureDate = searchDate.trim();

    if (!origin && !destination && !departureDate) return;

    setSearchLoading(true);
    setSearchError('');
    setHasSearched(true);
    try {
      const results = await searchCachedFlights({
        origins: origin ? [origin] : undefined,
        destinations: destination ? [destination] : undefined,
        departureDates: departureDate ? [departureDate] : undefined,
      }, showAllUsers && isAdmin);
      setSearchResults(results);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const formatTimestamp = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading cached queries...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 text-sm mb-2">{error}</p>
          <button onClick={loadQueries} className="text-sm text-blue-600 hover:underline">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-2 flex items-center gap-2 sm:gap-4 flex-wrap">
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => setViewMode('queries')}
            className={`flex items-center gap-1.5 text-sm px-2 sm:px-3 py-1.5 rounded-md whitespace-nowrap ${
              viewMode === 'queries'
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Plane className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cached</span> Queries
          </button>
          <button
            onClick={() => setViewMode('search')}
            className={`flex items-center gap-1.5 text-sm px-2 sm:px-3 py-1.5 rounded-md whitespace-nowrap ${
              viewMode === 'search'
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Search</span> Cache
          </button>
        </div>

        {viewMode === 'queries' && (
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {isAdmin && (
              <button
                onClick={() => setShowAllUsers((v) => !v)}
                className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded ${
                  showAllUsers
                    ? 'bg-purple-100 text-purple-700 font-medium'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">All Users</span>
              </button>
            )}
            <span className="text-xs sm:text-sm text-gray-500 whitespace-nowrap">
              {queries.length} quer{queries.length !== 1 ? 'ies' : 'y'}
            </span>
            <button
              onClick={loadQueries}
              className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-blue-600 px-2 py-1.5 rounded hover:bg-gray-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        )}
      </div>

      {/* Search view */}
      {viewMode === 'search' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <form onSubmit={handleSearch} className="bg-white border-b border-gray-200 px-3 sm:px-6 py-4">
            <div className="flex items-end gap-2 sm:gap-3 flex-wrap">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Origin</label>
                <input
                  type="text"
                  value={searchOrigin}
                  onChange={(e) => setSearchOrigin(e.target.value.toUpperCase())}
                  placeholder="e.g. LHR"
                  maxLength={4}
                  className="w-24 px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Destination</label>
                <input
                  type="text"
                  value={searchDestination}
                  onChange={(e) => setSearchDestination(e.target.value.toUpperCase())}
                  placeholder="e.g. JFK"
                  maxLength={4}
                  className="w-24 px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Departure Date</label>
                <input
                  type="date"
                  value={searchDate}
                  onChange={(e) => setSearchDate(e.target.value)}
                  className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={searchLoading || (!searchOrigin.trim() && !searchDestination.trim() && !searchDate.trim())}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {searchLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                Search
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Search across all cached results. Fill in any combination of filters.
            </p>
          </form>

          <div className="flex-1 overflow-auto">
            {searchError && (
              <div className="px-3 sm:px-6 py-4 text-red-600 text-sm">{searchError}</div>
            )}
            {!hasSearched ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                Enter filters above to search across all cached flights.
              </div>
            ) : searchLoading ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Searching...
              </div>
            ) : searchResults.length > 0 ? (
              <div className="flex flex-col h-full">
                <div className="px-3 sm:px-6 py-2 text-sm text-gray-500 border-b border-gray-100">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found across cached queries
                </div>
                <FlightResultsTable results={searchResults} passengers={1} showCacheAge />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                No cached flights match your filters.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Queries list view */}
      {viewMode === 'queries' && (
        <div className="flex-1 overflow-auto">
          {queries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              No cached queries yet. Search for flights to populate the cache.
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {queries.map((q) => (
                <div key={q.id}>
                  <button
                    onClick={() => toggleExpand(q.id)}
                    className="w-full px-3 sm:px-6 py-3 flex items-start sm:items-center gap-2 sm:gap-4 hover:bg-gray-50 text-left"
                  >
                    <Plane className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5 sm:mt-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                        <span className="text-sm font-medium">
                          {q.origin} → {q.destination}
                        </span>
                        <span className="text-xs text-gray-500">{q.departure_date}</span>
                        {q.return_date && (
                          <span className="text-xs text-gray-500">Return: {q.return_date}</span>
                        )}
                        <span className="text-xs text-gray-400">{q.adults} pax</span>
                        <span className="text-xs text-gray-400">{q.currency}</span>
                        {q.non_stop === 1 && (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Direct</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 mt-1 sm:mt-0">
                        <span className="text-xs text-gray-400">
                          {q.result_count} result{q.result_count !== 1 ? 's' : ''}
                        </span>
                        <span className="text-xs text-gray-400 hidden sm:inline">{formatTimestamp(q.created_at)}</span>
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${expandedId === q.id ? 'rotate-180' : ''}`} />
                  </button>

                  {expandedId === q.id && (
                    <div className="border-t border-gray-100 bg-gray-50">
                      {loadingResults ? (
                        <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Loading results...
                        </div>
                      ) : expandedResults.length > 0 ? (
                        <FlightResultsTable results={expandedResults} passengers={q.adults} />
                      ) : (
                        <div className="py-8 text-center text-gray-400 text-sm">
                          No results stored for this query
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

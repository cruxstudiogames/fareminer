import { useState } from 'react';
import { ChevronUp, ChevronDown, X, ArrowRight, Plane } from 'lucide-react';
import type { FlightSearchResult, FlightSegment, CacheSearchResult } from '../../types';
import { formatCurrency } from '../../utils/formatCurrency';
import { parseDuration, formatDuration, formatMinutes } from '../../utils/flightUtils';

function isCacheResult(r: FlightSearchResult): r is CacheSearchResult {
  return 'queryCachedAt' in r;
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatCacheTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

type SortKey = 'totalPrice' | 'airlineName' | 'duration' | 'stops' | 'departureAt';
type SortDir = 'asc' | 'desc';

function formatTime(isoDate: string): string {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDateShort(isoDate: string): string {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

function dayOffset(departure: string, arrival: string): string {
  if (!departure || !arrival) return '';
  const depDate = new Date(departure);
  const arrDate = new Date(arrival);
  const depDay = new Date(depDate.getFullYear(), depDate.getMonth(), depDate.getDate());
  const arrDay = new Date(arrDate.getFullYear(), arrDate.getMonth(), arrDate.getDate());
  const diff = Math.round((arrDay.getTime() - depDay.getTime()) / (1000 * 60 * 60 * 24));
  if (diff > 0) return `+${diff}`;
  return '';
}

function carrierNames(segments: FlightSegment[]): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const seg of segments) {
    if (!seen.has(seg.airlineName)) {
      seen.add(seg.airlineName);
      names.push(seg.airlineName);
    }
  }
  return names.join(', ');
}

function operatingCarrierNote(segments: FlightSegment[]): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const seg of segments) {
    if (seg.operatingCarrierName && !seen.has(seg.operatingCarrierName)) {
      seen.add(seg.operatingCarrierName);
      names.push(seg.operatingCarrierName);
    }
  }
  return names.length > 0 ? `op. by ${names.join(', ')}` : '';
}

function stopoverDuration(segments: FlightSegment[]): number {
  let total = 0;
  for (let i = 0; i < segments.length - 1; i++) {
    const arrTime = new Date(segments[i].arrivalAt).getTime();
    const depTime = new Date(segments[i + 1].departureAt).getTime();
    total += Math.max(0, depTime - arrTime);
  }
  return Math.round(total / (1000 * 60));
}

interface FlightResultsTableProps {
  results: FlightSearchResult[];
  passengers: number;
  showCacheAge?: boolean;
}

export function FlightResultsTable({ results, passengers: _passengers, showCacheAge }: FlightResultsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('totalPrice');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedFlight, setSelectedFlight] = useState<FlightSearchResult | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = [...results].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'totalPrice': cmp = a.totalPrice - b.totalPrice; break;
      case 'airlineName': cmp = a.airlineName.localeCompare(b.airlineName); break;
      case 'duration': cmp = parseDuration(a.duration) - parseDuration(b.duration); break;
      case 'stops': cmp = a.stops - b.stops; break;
      case 'departureAt': cmp = a.departureAt.localeCompare(b.departureAt); break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronUp className="w-3 h-3 text-gray-300" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-blue-600" />
      : <ChevronDown className="w-3 h-3 text-blue-600" />;
  };

  const thClass = "px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none";
  const thStatic = "px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider";

  return (
    <>
      {/* Mobile card list */}
      <div className="sm:hidden flex-1 overflow-auto divide-y divide-gray-100">
        {sorted.map((r) => {
          const arrOffset = dayOffset(r.departureAt, r.arrivalAt);
          return (
            <div
              key={r.id}
              className="px-3 py-3 active:bg-blue-50/40"
              onClick={() => setSelectedFlight(r)}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <span>{r.origin}</span>
                  <ArrowRight className="w-3 h-3 text-gray-400" />
                  <span>{r.destination}</span>
                </div>
                <span className="text-sm font-bold text-blue-700">{formatCurrency(r.totalPrice)}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-gray-600">
                <div>{formatDateShort(r.departureAt)}</div>
                <div className="text-right">{r.airlineName}</div>
                <div className="font-mono">
                  {formatTime(r.departureAt)} → {formatTime(r.arrivalAt)}
                  {arrOffset && <sup className="text-red-500 ml-0.5">{arrOffset}</sup>}
                </div>
                <div className="text-right">{formatDuration(r.duration)}</div>
                <div>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${
                    r.stops === 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {r.stops === 0 ? 'Direct' : `${r.stops} stop${r.stops > 1 ? 's' : ''}`}
                  </span>
                  {r.stopCodes.length > 0 && <span className="text-gray-400 ml-1">{r.stopCodes.join(',')}</span>}
                </div>
                <div className="text-right text-gray-400">{formatCurrency(r.pricePerPerson)}/pp</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="overflow-auto flex-1 hidden sm:block">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className={thStatic}>Route</th>
              <th className={thClass} onClick={() => handleSort('departureAt')}>
                <span className="flex items-center gap-1">Date <SortIcon col="departureAt" /></span>
              </th>
              <th className={thStatic}>Dep</th>
              <th className={thStatic}>Arr</th>
              <th className={thClass} onClick={() => handleSort('airlineName')}>
                <span className="flex items-center gap-1">Carrier <SortIcon col="airlineName" /></span>
              </th>
              <th className={thClass} onClick={() => handleSort('duration')}>
                <span className="flex items-center gap-1">Duration <SortIcon col="duration" /></span>
              </th>
              <th className={thClass} onClick={() => handleSort('stops')}>
                <span className="flex items-center gap-1">Stops <SortIcon col="stops" /></span>
              </th>
              <th className={thStatic}>Layover</th>
              <th className={`${thStatic} text-right`}>Per Person</th>
              <th className={`${thClass} text-right`} onClick={() => handleSort('totalPrice')}>
                <span className="flex items-center justify-end gap-1">Total <SortIcon col="totalPrice" /></span>
              </th>
              {showCacheAge && <th className={thStatic}>Cached</th>}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sorted.map((r) => {
              const arrOffset = dayOffset(r.departureAt, r.arrivalAt);
              const outCarriers = r.segments?.length > 0 ? carrierNames(r.segments) : r.airlineName;
              const outOpNote = r.segments?.length > 0 ? operatingCarrierNote(r.segments) : '';
              const outStopover = r.segments?.length > 1 ? stopoverDuration(r.segments) : 0;

              return (
                <tr
                  key={r.id}
                  className="hover:bg-blue-50/40 cursor-pointer align-top"
                  onClick={() => setSelectedFlight(r)}
                >
                  <td className="px-3 py-2.5 text-sm whitespace-nowrap">
                    <div className="font-medium">{r.origin} <ArrowRight className="w-3 h-3 inline text-gray-400" /> {r.destination}</div>
                  </td>
                  <td className="px-3 py-2.5 text-sm whitespace-nowrap">
                    <div>{formatDateShort(r.departureAt)}</div>
                  </td>
                  <td className="px-3 py-2.5 text-sm whitespace-nowrap font-mono">
                    <div>{formatTime(r.departureAt)}</div>
                  </td>
                  <td className="px-3 py-2.5 text-sm whitespace-nowrap font-mono">
                    <div>
                      {formatTime(r.arrivalAt)}
                      {arrOffset && <sup className="text-[10px] text-red-500 ml-0.5">{arrOffset}</sup>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-sm max-w-[220px]">
                    <div className="truncate" title={outCarriers}>{outCarriers}</div>
                    {outOpNote && (
                      <div className="text-[11px] text-gray-400 mt-0.5 truncate italic" title={outOpNote}>{outOpNote}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-sm whitespace-nowrap">
                    <div>{formatDuration(r.duration)}</div>
                  </td>
                  <td className="px-3 py-2.5 text-sm whitespace-nowrap">
                    <div>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                        r.stops === 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {r.stops === 0 ? 'Direct' : r.stops}
                      </span>
                      {r.stopCodes.length > 0 && (
                        <span className="text-[10px] text-gray-400 ml-1">{r.stopCodes.join(', ')}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-sm whitespace-nowrap text-gray-500">
                    <div>{outStopover > 0 ? formatMinutes(outStopover) : '-'}</div>
                  </td>
                  <td className="px-3 py-2.5 text-sm text-right whitespace-nowrap text-gray-600">
                    {formatCurrency(r.pricePerPerson)}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-right whitespace-nowrap font-semibold text-blue-700">
                    {formatCurrency(r.totalPrice)}
                  </td>
                  {showCacheAge && isCacheResult(r) && (
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap text-gray-400" title={r.queryCachedAt}>
                      <div>{formatAge(r.queryCachedAt)}</div>
                      <div className="text-[10px] text-gray-300">{formatCacheTimestamp(r.queryCachedAt)}</div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Flight Detail Modal */}
      {selectedFlight && (
        <FlightDetailModal
          flight={selectedFlight}
          onClose={() => setSelectedFlight(null)}
        />
      )}
    </>
  );
}

function FlightDetailModal({ flight, onClose }: { flight: FlightSearchResult; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {flight.origin} <ArrowRight className="w-4 h-4 inline text-gray-400" /> {flight.destination}
            </h3>
            <p className="text-sm text-gray-500">
              {formatDateShort(flight.departureAt)} &middot; {formatCurrency(flight.totalPrice)} total
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <div className="px-5 py-4">
          <LegDetail
            segments={flight.segments}
            totalDuration={flight.duration}
            stops={flight.stops}
            stopCodes={flight.stopCodes}
          />
        </div>
      </div>
    </div>
  );
}

function LegDetail({ segments, totalDuration, stops, stopCodes }: {
  segments: FlightSegment[];
  totalDuration: string;
  stops: number;
  stopCodes: string[];
}) {
  return (
    <div>
      <div className="space-y-0">
        {segments.map((seg, i) => {
          const offset = dayOffset(segments[0].departureAt, seg.arrivalAt);
          const layover = i < segments.length - 1
            ? Math.round((new Date(segments[i + 1].departureAt).getTime() - new Date(seg.arrivalAt).getTime()) / 60000)
            : 0;

          return (
            <div key={i}>
              <div className="flex items-start gap-3 py-2">
                <Plane className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <span className="font-mono font-medium">{seg.flightNumber}</span>
                    <span className="text-gray-400">&middot;</span>
                    <span className="text-gray-600">{seg.airlineName}</span>
                    {seg.operatingCarrierName && (
                      <span className="text-xs text-gray-400 italic">op. by {seg.operatingCarrierName}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm">
                    <div>
                      <span className="font-medium">{seg.origin}</span>
                      <span className="text-gray-500 ml-1.5">{formatTime(seg.departureAt)}</span>
                    </div>
                    <ArrowRight className="w-3 h-3 text-gray-300" />
                    <div>
                      <span className="font-medium">{seg.destination}</span>
                      <span className="text-gray-500 ml-1.5">
                        {formatTime(seg.arrivalAt)}
                        {offset && <sup className="text-[10px] text-red-500 ml-0.5">{offset}</sup>}
                      </span>
                    </div>
                    <span className="text-gray-400 text-xs">{formatDuration(seg.duration)}</span>
                  </div>
                </div>
              </div>
              {layover > 0 && (
                <div className="ml-7 py-1.5 text-xs text-amber-600 border-l-2 border-dashed border-amber-200 pl-3">
                  {formatMinutes(layover)} layover in {segments[i + 1].origin}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
        <span>Total: {formatDuration(totalDuration)}</span>
        <span>{stops === 0 ? 'Direct' : `${stops} stop${stops > 1 ? 's' : ''}${stopCodes.length > 0 ? ` (${stopCodes.join(', ')})` : ''}`}</span>
      </div>
    </div>
  );
}

import { useMemo, useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { airports } from '../../data/airports';
import { formatCurrency } from '../../utils/formatCurrency';
import { computeBezierArcSegments } from '../../utils/bezierArc';
import type { FlightSearchResult } from '../../types';

/** A unique itinerary path: origin -> [stops in order] -> destination */
interface RoutePath {
  origin: string;
  destination: string;
  stops: string[]; // ordered stop codes for this specific path
  cheapestPrice: number;
  count: number;
}

interface FlightMapProps {
  results: FlightSearchResult[];
  onRouteSelect?: (origin: string, destination: string) => void;
  selectedRoute?: { origin: string; destination: string } | null;
  onAirportSelect?: (code: string | null) => void;
  selectedAirport?: string | null;
}

function FitBounds({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 5);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as L.LatLngTuple));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 });
  }, [map, points]);
  return null;
}

const WORLD_OFFSETS = [-360, 0, 360];

function MapLegend({ priceRange }: { priceRange: { min: number; max: number } }) {
  return (
    <div
      className="leaflet-bottom leaflet-left"
      style={{ pointerEvents: 'none' }}
    >
      <div
        className="leaflet-control"
        style={{
          pointerEvents: 'auto',
          background: 'white',
          borderRadius: 6,
          padding: '8px 10px',
          fontSize: 11,
          lineHeight: '18px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          minWidth: 120,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Legend</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3B82F6', border: '2px solid #1E40AF', display: 'inline-block', flexShrink: 0 }} />
          <span>Origin</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981', border: '2px solid #065F46', display: 'inline-block', flexShrink: 0 }} />
          <span>Destination</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#D1D5DB', border: '1px solid #9CA3AF', display: 'inline-block', flexShrink: 0 }} />
          <span>Stop</span>
        </div>
        {priceRange.max > 0 && (
          <>
            <div style={{ fontWeight: 600, marginTop: 6, marginBottom: 4 }}>Route price</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 16, height: 2, background: '#22C55E', display: 'inline-block', flexShrink: 0 }} />
              <span>Cheap</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 16, height: 2, background: '#F59E0B', display: 'inline-block', flexShrink: 0 }} />
              <span>Mid</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 16, height: 2, background: '#EF4444', display: 'inline-block', flexShrink: 0 }} />
              <span>Expensive</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function FlightMap({ results, onRouteSelect, selectedRoute, onAirportSelect, selectedAirport: controlledAirport }: FlightMapProps) {
  const [internalAirport, setInternalAirport] = useState<string | null>(null);
  const selectedAirport = controlledAirport !== undefined ? controlledAirport : internalAirport;

  const handleAirportClick = useCallback((code: string) => {
    const next = selectedAirport === code ? null : code;
    if (onAirportSelect) {
      onAirportSelect(next);
    } else {
      setInternalAirport(next);
    }
  }, [selectedAirport, onAirportSelect]);

  // Build unique route paths from results
  const routePaths = useMemo<RoutePath[]>(() => {
    const pathMap = new Map<string, { prices: number[]; stops: string[] }>();
    for (const r of results) {
      const stops = r.stopCodes ?? [];
      const key = `${r.origin}|${stops.join(',')}|${r.destination}`;
      if (!pathMap.has(key)) {
        pathMap.set(key, { prices: [], stops });
      }
      pathMap.get(key)!.prices.push(r.totalPrice);
    }
    return Array.from(pathMap.entries()).map(([key, val]) => {
      const parts = key.split('|');
      return {
        origin: parts[0],
        destination: parts[2],
        stops: val.stops,
        cheapestPrice: Math.min(...val.prices),
        count: val.prices.length,
      };
    });
  }, [results]);

  const priceRange = useMemo(() => {
    const prices = routePaths.map((r) => r.cheapestPrice);
    if (prices.length === 0) return { min: 0, max: 0 };
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [routePaths]);

  const getRouteColor = (price: number): string => {
    if (priceRange.max === priceRange.min) return '#22C55E';
    const ratio = (price - priceRange.min) / (priceRange.max - priceRange.min);
    if (ratio <= 0.33) return '#22C55E';
    if (ratio <= 0.66) return '#F59E0B';
    return '#EF4444';
  };

  // Collect unique airports with cheapest prices
  const uniqueAirports = useMemo(() => {
    const map = new Map<string, {
      code: string; lat: number; lng: number; city: string;
      isOrigin: boolean; isDestination: boolean; isWaypoint: boolean;
      cheapestPrice: number | null;
    }>();
    const originSet = new Set<string>();
    const destSet = new Set<string>();
    const waypointSet = new Set<string>();
    const cheapestAtAirport = new Map<string, number>();

    for (const route of routePaths) {
      originSet.add(route.origin);
      destSet.add(route.destination);
      for (const wp of route.stops) waypointSet.add(wp);

      // Track cheapest price at each airport
      for (const code of [route.origin, route.destination]) {
        const existing = cheapestAtAirport.get(code);
        if (existing === undefined || route.cheapestPrice < existing) {
          cheapestAtAirport.set(code, route.cheapestPrice);
        }
      }
    }

    for (const code of new Set([...originSet, ...destSet, ...waypointSet])) {
      const apt = airports[code];
      if (!apt) continue;
      map.set(code, {
        code,
        lat: apt.lat,
        lng: apt.lng,
        city: apt.city,
        isOrigin: originSet.has(code),
        isDestination: destSet.has(code),
        isWaypoint: waypointSet.has(code) && !originSet.has(code) && !destSet.has(code),
        cheapestPrice: cheapestAtAirport.get(code) ?? null,
      });
    }
    return Array.from(map.values());
  }, [routePaths]);

  // Route arcs with stops
  const routeArcs = useMemo(() => {
    return routePaths
      .map((route) => {
        const orig = airports[route.origin];
        const dest = airports[route.destination];
        if (!orig || !dest) return null;

        // Build point chain: origin -> stops -> destination
        const allPoints: [number, number][] = [[orig.lat, orig.lng]];
        for (const wp of route.stops) {
          const wpApt = airports[wp];
          if (wpApt) allPoints.push([wpApt.lat, wpApt.lng]);
        }
        allPoints.push([dest.lat, dest.lng]);

        // Compute arcs between consecutive points
        const segments: L.LatLngTuple[][] = [];
        for (let i = 0; i < allPoints.length - 1; i++) {
          const arcSegments = computeBezierArcSegments(allPoints[i], allPoints[i + 1]);
          for (const seg of arcSegments) segments.push(seg);
        }

        const isSelected = selectedRoute?.origin === route.origin && selectedRoute?.destination === route.destination;
        const isAirportHighlighted = selectedAirport
          ? route.origin === selectedAirport || route.destination === selectedAirport || route.stops.includes(selectedAirport)
          : false;
        return { ...route, segments, isSelected, isAirportHighlighted };
      })
      .filter(Boolean) as (RoutePath & { segments: L.LatLngTuple[][]; isSelected: boolean; isAirportHighlighted: boolean })[];
  }, [routePaths, selectedRoute, selectedAirport]);

  if (uniqueAirports.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        No routes to display on map
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <MapContainer
        center={[20, 0]}
        zoom={2}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={uniqueAirports} />

        {/* Route arcs — repeated at world copy offsets */}
        {WORLD_OFFSETS.map((lngOffset) =>
          routeArcs.map((route) => {
            const color = getRouteColor(route.cheapestPrice);
            const highlighted = route.isSelected || route.isAirportHighlighted;
            const dimmed = selectedAirport && !route.isAirportHighlighted;
            const stopsKey = route.stops.join(',');
            return route.segments.map((seg, segIdx) => (
              <Polyline
                key={`${route.origin}-${stopsKey}-${route.destination}-${segIdx}-${lngOffset}`}
                positions={seg.map(([lat, lng]) => [lat, lng + lngOffset] as L.LatLngTuple)}
                pathOptions={{
                  color: highlighted ? '#2563EB' : color,
                  weight: highlighted ? 3.5 : 2,
                  opacity: dimmed ? 0.2 : highlighted ? 1 : 0.7,
                  dashArray: route.stops.length > 0 ? '6 4' : undefined,
                }}
                eventHandlers={
                  onRouteSelect
                    ? { click: () => onRouteSelect(route.origin, route.destination) }
                    : undefined
                }
              >
                <Tooltip sticky>
                  <span style={{ fontWeight: 600 }}>{route.origin} → {route.destination}</span>
                  {route.stops.length > 0 && (
                    <><br /><span style={{ fontSize: 11, color: '#6b7280' }}>via {route.stops.join(', ')}</span></>
                  )}
                  <br />
                  {formatCurrency(route.cheapestPrice)}
                  <span style={{ fontSize: 11, color: '#6b7280' }}> ({route.count} flight{route.count !== 1 ? 's' : ''})</span>
                </Tooltip>
              </Polyline>
            ));
          })
        )}

        {/* Waypoint markers — repeated at world copy offsets */}
        {WORLD_OFFSETS.map((lngOffset) =>
          uniqueAirports
            .filter((apt) => apt.isWaypoint)
            .map((apt) => (
              <CircleMarker
                key={`${apt.code}-wp-${lngOffset}`}
                center={[apt.lat, apt.lng + lngOffset]}
                radius={3}
                pathOptions={{
                  color: '#9CA3AF',
                  fillColor: '#D1D5DB',
                  fillOpacity: 0.8,
                  weight: 1,
                }}
              >
                <Tooltip direction="top" offset={[0, -4]}>
                  <span style={{ fontWeight: 600, fontSize: 11 }}>{apt.code}</span>
                  {apt.city && <> — {apt.city}</>}
                  <span style={{ color: '#9CA3AF' }}> (stop)</span>
                </Tooltip>
              </CircleMarker>
            ))
        )}

        {/* Origin & destination markers — repeated at world copy offsets */}
        {WORLD_OFFSETS.map((lngOffset) =>
          uniqueAirports
            .filter((apt) => !apt.isWaypoint)
            .map((apt) => {
              const isHighlighted = selectedAirport === apt.code;
              return (
                <CircleMarker
                  key={`${apt.code}-${lngOffset}`}
                  center={[apt.lat, apt.lng + lngOffset]}
                  radius={isHighlighted ? 7 : 5}
                  pathOptions={apt.isOrigin ? {
                    color: isHighlighted ? '#1E3A8A' : '#1E40AF',
                    fillColor: '#3B82F6',
                    fillOpacity: 1,
                    weight: isHighlighted ? 3 : 2,
                  } : {
                    color: isHighlighted ? '#064E3B' : '#065F46',
                    fillColor: '#10B981',
                    fillOpacity: 1,
                    weight: isHighlighted ? 3 : 2,
                  }}
                  eventHandlers={{
                    click: () => handleAirportClick(apt.code),
                  }}
                >
                  <Tooltip
                    direction="top"
                    offset={[0, -6]}
                    permanent
                    className="price-label"
                  >
                    <span style={{ fontWeight: 600 }}>{apt.code}</span>
                    {apt.cheapestPrice !== null && (
                      <span style={{ color: '#059669', fontWeight: 500 }}> {formatCurrency(apt.cheapestPrice)}</span>
                    )}
                  </Tooltip>
                </CircleMarker>
              );
            })
        )}

        <MapLegend priceRange={priceRange} />
      </MapContainer>
    </div>
  );
}

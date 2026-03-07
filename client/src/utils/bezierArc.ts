import type { LatLngTuple } from 'leaflet';

/**
 * Generate points along a quadratic bezier curve between two lat/lng points.
 * The control point is offset perpendicular to the midpoint for a curved arc effect.
 */
export function computeBezierArc(
  start: LatLngTuple,
  end: LatLngTuple,
  numPoints = 50,
  curvature = 0.3,
): LatLngTuple[] {
  const [lat1, lng1] = start;
  const [lat2, lng2] = end;

  const midLat = (lat1 + lat2) / 2;
  const midLng = (lng1 + lng2) / 2;

  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;

  // Offset perpendicular to the line, scaled by curvature
  const ctrlLat = midLat + -dLng * curvature;
  const ctrlLng = midLng + dLat * curvature;

  const points: LatLngTuple[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const u = 1 - t;
    const lat = u * u * lat1 + 2 * u * t * ctrlLat + t * t * lat2;
    const lng = u * u * lng1 + 2 * u * t * ctrlLng + t * t * lng2;
    points.push([lat, lng]);
  }
  return points;
}

/**
 * Compute a bezier arc that correctly handles the antimeridian (date line).
 * Uses the shortest longitude path and splits into multiple segments where
 * the line would cross ±180°.
 */
export function computeBezierArcSegments(
  start: LatLngTuple,
  end: LatLngTuple,
  numPoints = 50,
  curvature = 0.25,
): LatLngTuple[][] {
  const [lat1, lng1] = start;
  const [lat2, lng2] = end;

  // Determine shortest path direction across antimeridian
  let dLng = lng2 - lng1;
  if (dLng > 180) dLng -= 360;
  if (dLng < -180) dLng += 360;
  const effectiveLng2 = lng1 + dLng;

  const midLng = (lng1 + effectiveLng2) / 2;
  const dLatC = lat2 - lat1;
  const dLngC = effectiveLng2 - lng1;
  const ctrlLat = (lat1 + lat2) / 2 + -dLngC * curvature;
  const ctrlLng = midLng + dLatC * curvature;

  const rawPoints: [number, number][] = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const u = 1 - t;
    const lat = u * u * lat1 + 2 * u * t * ctrlLat + t * t * lat2;
    const lng = u * u * lng1 + 2 * u * t * ctrlLng + t * t * effectiveLng2;
    rawPoints.push([lat, lng]);
  }

  // Split into segments that don't cross the antimeridian
  const segments: LatLngTuple[][] = [];
  let current: LatLngTuple[] = [];

  for (const [lat, lng] of rawPoints) {
    const normLng = ((lng + 540) % 360) - 180;

    if (current.length > 0) {
      const prevLng = current[current.length - 1][1];
      if (Math.abs(normLng - prevLng) > 180) {
        segments.push(current);
        current = [];
      }
    }
    current.push([lat, normLng]);
  }
  if (current.length > 0) segments.push(current);

  return segments;
}

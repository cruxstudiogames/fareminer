import { getCachedResults, cacheResults } from './cacheService.js';
import logger from './logger.js';

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

// FlightAPI.io response types
interface FlightApiPlace {
  id: number;
  alt_id: string;
  display_code: string;
  name: string;
  type: string;
}

interface FlightApiCarrier {
  id: number;
  name: string;
  alt_id: string;
}

interface FlightApiSegment {
  id: string;
  origin_place_id: number;
  destination_place_id: number;
  departure: string;
  arrival: string;
  duration: number;
  marketing_flight_number: string;
  marketing_carrier_id: number;
  operating_carrier_id: number;
}

interface FlightApiLeg {
  id: string;
  origin_place_id: number;
  destination_place_id: number;
  departure: string;
  arrival: string;
  segment_ids: string[];
  duration: number;
  stop_count: number;
  marketing_carrier_ids: number[];
  stop_ids: number[][];
}

interface FlightApiItinerary {
  id: string;
  leg_ids: string[];
  pricing_options: Array<{
    price: { amount: number };
    agent_ids: string[];
    items: Array<{
      price: { amount: number };
      fares: Array<{ fare_family: string }>;
    }>;
  }>;
}

interface FlightApiResponse {
  itineraries: FlightApiItinerary[];
  legs: FlightApiLeg[];
  segments: FlightApiSegment[];
  places: FlightApiPlace[];
  carriers: FlightApiCarrier[];
  agents: Array<{ id: string; name: string }>;
}

function minutesToIsoDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `PT${h}H${m}M`;
}

export async function searchFlightsWithCache(params: FlightSearchParams, fresh = false, timeSweepId?: string, userId?: number): Promise<FlightSearchResult[]> {
  if (!fresh) {
    const cached = await getCachedResults(params);
    if (cached) {
      logger.info({ origin: params.origin, destination: params.destination }, 'Cache hit');
      return cached;
    }
  }

  const results = await searchFlights(params);
  await cacheResults(params, results, timeSweepId, userId);
  logger.info({ origin: params.origin, destination: params.destination, count: results.length }, 'Cached results');
  return results;
}

async function searchFlights(params: FlightSearchParams): Promise<FlightSearchResult[]> {
  const apiKey = process.env.FLIGHTAPI_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    throw new Error('FlightAPI key not configured. Update FLIGHTAPI_KEY in .env file.');
  }

  const from = params.origin.toUpperCase();
  const to = params.destination.toUpperCase();
  const currency = params.currency || 'USD';
  // FlightAPI.io expects Premium_Economy (underscore), not "Premium Economy"
  const cabinRaw = params.cabin || 'Economy';
  const cabin = cabinRaw.replace(/\s+/g, '_');

  let url: string;
  if (params.returnDate) {
    url = `https://api.flightapi.io/roundtrip/${apiKey}/${from}/${to}/${params.departureDate}/${params.returnDate}/${params.adults}/0/0/${cabin}/${currency}`;
  } else {
    url = `https://api.flightapi.io/onewaytrip/${apiKey}/${from}/${to}/${params.departureDate}/${params.adults}/0/0/${cabin}/${currency}`;
  }

  logger.info({ url: url.replace(apiKey, '***') }, 'FlightAPI request');

  let response = await fetch(url);

  // Retry once after a short delay on 400 (transient error)
  if (response.status === 400) {
    const text = await response.text().catch(() => '');
    logger.warn({ status: 400, body: text }, 'FlightAPI 400 — retrying in 3s');
    await new Promise((r) => setTimeout(r, 3000));
    response = await fetch(url);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    logger.error({ status: response.status, body: text }, 'FlightAPI error');
    throw new Error(`FlightAPI error: ${response.status} - ${text}`);
  }

  const body = await response.json() as FlightApiResponse;

  logger.debug({
    itineraries: body.itineraries?.length,
    legs: body.legs?.length,
    segments: body.segments?.length,
    places: body.places?.length,
    carriers: body.carriers?.length,
  }, 'FlightAPI response counts');

  // Build lookup maps - use string keys for safety (API may mix string/number IDs)
  const placesMap = new Map<string, FlightApiPlace>();
  for (const p of body.places ?? []) {
    placesMap.set(String(p.id), p);
  }

  const carriersMap = new Map<string, FlightApiCarrier>();
  for (const c of body.carriers ?? []) {
    carriersMap.set(String(c.id), c);
  }

  const legsMap = new Map<string, FlightApiLeg>();
  for (const l of body.legs ?? []) {
    legsMap.set(String(l.id), l);
  }

  const segmentsMap = new Map<string, FlightApiSegment>();
  for (const s of body.segments ?? []) {
    segmentsMap.set(String(s.id), s);
  }

  const itineraries = body.itineraries ?? [];

  logger.debug({ total: itineraries.length }, 'Processing itineraries');

  function resolveSegments(leg: FlightApiLeg): FlightSegment[] {
    return leg.segment_ids.map((segId) => {
      const seg = segmentsMap.get(String(segId))!;
      const mktCarrier = carriersMap.get(String(seg.marketing_carrier_id));
      const opCarrier = carriersMap.get(String(seg.operating_carrier_id));
      const segOrigin = placesMap.get(String(seg.origin_place_id));
      const segDest = placesMap.get(String(seg.destination_place_id));

      const mktCode = mktCarrier?.alt_id || String(seg.marketing_carrier_id);
      const mktName = mktCarrier?.name || mktCode;
      const opCode = opCarrier?.alt_id || String(seg.operating_carrier_id);
      const opName = opCarrier?.name || opCode;

      // Only include operating carrier if it differs from marketing
      const isDifferentOperator = String(seg.operating_carrier_id) !== String(seg.marketing_carrier_id);

      return {
        flightNumber: `${mktCode} ${seg.marketing_flight_number}`.trim(),
        airlineCode: mktCode,
        airlineName: mktName,
        ...(isDifferentOperator && {
          operatingCarrierCode: opCode,
          operatingCarrierName: opName,
        }),
        origin: segOrigin?.display_code || '???',
        destination: segDest?.display_code || '???',
        departureAt: seg.departure,
        arrivalAt: seg.arrival,
        duration: minutesToIsoDuration(seg.duration),
      };
    });
  }

  function resolveStopCodes(leg: FlightApiLeg): string[] {
    const codes: string[] = [];
    if (leg.stop_ids) {
      for (const group of leg.stop_ids) {
        for (const stopId of group) {
          const place = placesMap.get(String(stopId));
          if (place?.display_code) codes.push(place.display_code);
        }
      }
    }
    return codes;
  }

  return itineraries.map((it, index) => {
    const outboundLeg = legsMap.get(String(it.leg_ids[0]))!;
    const outboundSegments = resolveSegments(outboundLeg);
    const firstSeg = outboundSegments[0];
    const originPlace = placesMap.get(String(outboundLeg.origin_place_id));
    const destPlace = placesMap.get(String(outboundLeg.destination_place_id));

    const price = it.pricing_options[0]?.price?.amount ?? 0;

    const result: FlightSearchResult = {
      id: it.id || String(index + 1),
      airlineCode: firstSeg.airlineCode,
      airlineName: firstSeg.airlineName,
      flightNumber: firstSeg.flightNumber,
      origin: originPlace?.display_code || from,
      destination: destPlace?.display_code || to,
      departureAt: outboundLeg.departure,
      arrivalAt: outboundLeg.arrival,
      duration: minutesToIsoDuration(outboundLeg.duration),
      stops: outboundLeg.stop_count,
      stopCodes: resolveStopCodes(outboundLeg),
      segments: outboundSegments,
      totalPrice: price,
      pricePerPerson: price / params.adults,
      currency,
      cabin: cabinRaw,
    };

    // Return leg for round-trip
    if (it.leg_ids.length > 1) {
      const returnLeg = legsMap.get(String(it.leg_ids[1]));
      if (returnLeg) {
        const returnSegments = resolveSegments(returnLeg);
        const retFirstSeg = returnSegments[0];
        const retOrigin = placesMap.get(String(returnLeg.origin_place_id));
        const retDest = placesMap.get(String(returnLeg.destination_place_id));

        result.returnOrigin = retOrigin?.display_code || to;
        result.returnDestination = retDest?.display_code || from;
        result.returnDepartureAt = returnLeg.departure;
        result.returnArrivalAt = returnLeg.arrival;
        result.returnDuration = minutesToIsoDuration(returnLeg.duration);
        result.returnStops = returnLeg.stop_count;
        result.returnFlightNumber = retFirstSeg?.flightNumber;
        result.returnStopCodes = resolveStopCodes(returnLeg);
        result.returnSegments = returnSegments;
      }
    }

    return result;
  });
}

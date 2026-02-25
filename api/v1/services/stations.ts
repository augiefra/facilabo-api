import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SERVICE_CONTRACT_VERSION, ServiceResponseBase } from '../../../lib/service-search-types';
import {
  applyServiceCors,
  ensureGetMethod,
  handleServiceOptions,
  parseServiceSearchParams,
  resolveEndpointError,
} from '../../../lib/service-search-utils';
import {
  getStationStale,
  searchStationsByCity,
  searchStationsByPostalCode,
  searchStationsNearLocation,
  stationSourceName,
  StationServiceItem,
} from '../../../lib/station-fetcher';

interface StationSearchResponse extends ServiceResponseBase {
  stations: StationServiceItem[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleServiceOptions(req, res)) {
    return;
  }

  applyServiceCors(res);

  if (!ensureGetMethod(req, res)) {
    return;
  }

  let cacheKey: string | null = null;
  let query: StationSearchResponse['query'] = {};
  let limit = 25;

  try {
    const parsed = parseServiceSearchParams(req.query, {
      defaultLimit: 25,
      maxLimit: 50,
      defaultRadiusKm: 5,
      maxRadiusKm: 25,
      examples: [
        '/api/v1/services/stations?cp=75001',
        '/api/v1/services/stations?city=Paris',
        '/api/v1/services/stations?lat=48.8566&lng=2.3522&radius=5',
      ],
    });

    if (!parsed.ok) {
      return res.status(parsed.status).json(parsed.error);
    }

    const params = parsed.value;
    cacheKey = params.cacheKey;
    query = params.query;
    limit = params.limit;

    let stations: StationServiceItem[] = [];

    if (params.mode === 'cp' && params.postalCode) {
      stations = await searchStationsByPostalCode(params.postalCode, params.limit, params.cacheKey);
    } else if (params.mode === 'city' && params.city) {
      stations = await searchStationsByCity(params.city, params.limit, params.cacheKey);
    } else if (params.mode === 'geo' && params.lat !== undefined && params.lng !== undefined) {
      stations = await searchStationsNearLocation(
        params.lat,
        params.lng,
        params.radiusKm,
        params.limit,
        params.cacheKey,
      );
    }

    const response: StationSearchResponse = {
      stations,
      total: stations.length,
      query,
      limit,
      contractVersion: SERVICE_CONTRACT_VERSION,
      lastUpdated: new Date().toISOString(),
      source: stationSourceName(),
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('Stations search error:', error);

    if (cacheKey) {
      const stale = getStationStale(cacheKey);
      if (stale) {
        return res.status(200).json({
          stations: stale,
          total: stale.length,
          query,
          limit,
          contractVersion: SERVICE_CONTRACT_VERSION,
          lastUpdated: `${new Date().toISOString()} (cached)`,
          source: `${stationSourceName()} (cached)`,
          note: 'Resultats issus du cache stale suite a une indisponibilite upstream.',
        } as StationSearchResponse);
      }
    }

    const resolved = resolveEndpointError(error);
    return res.status(resolved.status).json(resolved.payload);
  }
}

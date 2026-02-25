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
  getHospitalStale,
  HospitalServiceItem,
  hospitalSourceName,
  searchHospitalsByCity,
  searchHospitalsByPostalCode,
  searchHospitalsNearLocation,
} from '../../../lib/hospital-fetcher';

interface HospitalSearchResponse extends ServiceResponseBase {
  hospitals: HospitalServiceItem[];
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
  let query: HospitalSearchResponse['query'] = {};
  let limit = 20;

  try {
    const parsed = parseServiceSearchParams(req.query, {
      defaultLimit: 20,
      maxLimit: 50,
      defaultRadiusKm: 8,
      maxRadiusKm: 30,
      examples: [
        '/api/v1/services/hospitals?cp=75001',
        '/api/v1/services/hospitals?city=Paris',
        '/api/v1/services/hospitals?lat=48.8566&lng=2.3522&radius=8',
      ],
    });

    if (!parsed.ok) {
      return res.status(parsed.status).json(parsed.error);
    }

    const params = parsed.value;
    cacheKey = params.cacheKey;
    query = params.query;
    limit = params.limit;

    let hospitals: HospitalServiceItem[] = [];

    if (params.mode === 'cp' && params.postalCode) {
      hospitals = await searchHospitalsByPostalCode(params.postalCode, params.limit, params.cacheKey);
    } else if (params.mode === 'city' && params.city) {
      hospitals = await searchHospitalsByCity(params.city, params.limit, params.cacheKey);
    } else if (params.mode === 'geo' && params.lat !== undefined && params.lng !== undefined) {
      hospitals = await searchHospitalsNearLocation(
        params.lat,
        params.lng,
        params.radiusKm,
        params.limit,
        params.cacheKey,
      );
    }

    const response: HospitalSearchResponse = {
      hospitals,
      total: hospitals.length,
      query,
      limit,
      contractVersion: SERVICE_CONTRACT_VERSION,
      lastUpdated: new Date().toISOString(),
      source: hospitalSourceName(),
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('Hospitals search error:', error);

    if (cacheKey) {
      const stale = getHospitalStale(cacheKey);
      if (stale) {
        return res.status(200).json({
          hospitals: stale,
          total: stale.length,
          query,
          limit,
          contractVersion: SERVICE_CONTRACT_VERSION,
          lastUpdated: `${new Date().toISOString()} (cached)`,
          source: `${hospitalSourceName()} (cached)`,
          note: 'Resultats issus du cache stale suite a une indisponibilite upstream.',
        } as HospitalSearchResponse);
      }
    }

    const resolved = resolveEndpointError(error);
    return res.status(resolved.status).json(resolved.payload);
  }
}

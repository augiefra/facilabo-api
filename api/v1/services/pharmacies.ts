/**
 * FacilAbo API v1 - Pharmacy Search
 *
 * Search pharmacies in France using the FINESS database
 * via OpenDataSoft.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PharmacySearchResponse, getPharmacyStale } from '../../../lib/pharmacy-types';
import { SERVICE_CONTRACT_VERSION } from '../../../lib/service-search-types';
import {
  applyServiceCors,
  ensureGetMethod,
  handleServiceOptions,
  parseServiceSearchParams,
  resolveEndpointError,
} from '../../../lib/service-search-utils';
import {
  searchByPostalCode,
  searchByCity,
  searchNearLocation,
} from '../../../lib/pharmacy-fetcher';

const PHARMACY_SOURCE = 'FINESS - public.opendatasoft.com';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (handleServiceOptions(req, res)) {
    return;
  }

  applyServiceCors(res);

  if (!ensureGetMethod(req, res)) {
    return;
  }

  let cacheKey: string | null = null;
  let query: PharmacySearchResponse['query'] = {};
  let limit = 100;

  try {
    const parsed = parseServiceSearchParams(req.query, {
      defaultLimit: 100,
      maxLimit: 100,
      defaultRadiusKm: 5,
      maxRadiusKm: 30,
      examples: [
        '/api/v1/services/pharmacies?cp=75001',
        '/api/v1/services/pharmacies?city=Paris',
        '/api/v1/services/pharmacies?lat=48.8566&lng=2.3522&radius=3',
      ],
    });

    if (!parsed.ok) {
      return res.status(parsed.status).json(parsed.error);
    }

    const params = parsed.value;
    cacheKey = params.cacheKey;
    query = params.query;
    limit = params.limit;

    let pharmacies: PharmacySearchResponse['pharmacies'] = [];

    if (params.mode === 'cp' && params.postalCode) {
      pharmacies = await searchByPostalCode(params.postalCode, params.limit);
    } else if (params.mode === 'city' && params.city) {
      pharmacies = await searchByCity(params.city, params.limit);
    } else if (params.mode === 'geo' && params.lat !== undefined && params.lng !== undefined) {
      pharmacies = await searchNearLocation(params.lat, params.lng, params.radiusKm, params.limit);
    }

    const response: PharmacySearchResponse = {
      pharmacies,
      total: pharmacies.length,
      query,
      limit,
      contractVersion: SERVICE_CONTRACT_VERSION,
      gardeInfo: {
        message: 'Pour les pharmacies de garde, appelez le 3237 ou consultez le site officiel',
        url: 'https://www.3237.fr',
      },
      lastUpdated: new Date().toISOString(),
      source: PHARMACY_SOURCE,
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('Pharmacy search error:', error);

    if (cacheKey) {
      const cached = getPharmacyStale(cacheKey);
      if (cached) {
        return res.status(200).json({
          pharmacies: cached,
          total: cached.length,
          query,
          limit,
          contractVersion: SERVICE_CONTRACT_VERSION,
          gardeInfo: {
            message: 'Pour les pharmacies de garde, appelez le 3237 ou consultez le site officiel',
            url: 'https://www.3237.fr',
          },
          note: 'Resultats issus du cache stale suite a une indisponibilite upstream.',
          lastUpdated: `${new Date().toISOString()} (cached)`,
          source: `${PHARMACY_SOURCE} (cached)`,
        } as PharmacySearchResponse);
      }
    }

    const resolved = resolveEndpointError(error);
    return res.status(resolved.status).json(resolved.payload);
  }
}

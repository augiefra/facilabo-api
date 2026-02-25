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
  getPostOfficeStale,
  postOfficeSourceName,
  PostOfficeServiceItem,
  searchPostOfficesByCity,
  searchPostOfficesByPostalCode,
  searchPostOfficesNearLocation,
} from '../../../lib/postoffice-fetcher';

interface PostOfficeSearchResponse extends ServiceResponseBase {
  postOffices: PostOfficeServiceItem[];
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
  let query: PostOfficeSearchResponse['query'] = {};
  let limit = 20;

  try {
    const parsed = parseServiceSearchParams(req.query, {
      defaultLimit: 20,
      maxLimit: 50,
      defaultRadiusKm: 10,
      maxRadiusKm: 50,
      examples: [
        '/api/v1/services/post-offices?cp=75001',
        '/api/v1/services/post-offices?city=Paris',
        '/api/v1/services/post-offices?lat=48.8566&lng=2.3522&radius=10',
      ],
    });

    if (!parsed.ok) {
      return res.status(parsed.status).json(parsed.error);
    }

    const params = parsed.value;
    cacheKey = params.cacheKey;
    query = params.query;
    limit = params.limit;

    let postOffices: PostOfficeServiceItem[] = [];

    if (params.mode === 'cp' && params.postalCode) {
      postOffices = await searchPostOfficesByPostalCode(params.postalCode, params.limit, params.cacheKey);
    } else if (params.mode === 'city' && params.city) {
      postOffices = await searchPostOfficesByCity(params.city, params.limit, params.cacheKey);
    } else if (params.mode === 'geo' && params.lat !== undefined && params.lng !== undefined) {
      postOffices = await searchPostOfficesNearLocation(
        params.lat,
        params.lng,
        params.radiusKm,
        params.limit,
        params.cacheKey,
      );
    }

    const response: PostOfficeSearchResponse = {
      postOffices,
      total: postOffices.length,
      query,
      limit,
      contractVersion: SERVICE_CONTRACT_VERSION,
      lastUpdated: new Date().toISOString(),
      source: postOfficeSourceName(),
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('Post offices search error:', error);

    if (cacheKey) {
      const stale = getPostOfficeStale(cacheKey);
      if (stale) {
        return res.status(200).json({
          postOffices: stale,
          total: stale.length,
          query,
          limit,
          contractVersion: SERVICE_CONTRACT_VERSION,
          lastUpdated: `${new Date().toISOString()} (cached)`,
          source: `${postOfficeSourceName()} (cached)`,
          note: 'Resultats issus du cache stale suite a une indisponibilite upstream.',
        } as PostOfficeSearchResponse);
      }
    }

    const resolved = resolveEndpointError(error);
    return res.status(resolved.status).json(resolved.payload);
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  SERVICE_CONTRACT_VERSION,
  ServiceErrorPayload,
  ServiceSearchQuery,
} from './service-search-types';

export type QueryMode = 'cp' | 'city' | 'geo';

export interface ParsedServiceSearchParams {
  mode: QueryMode;
  cacheKey: string;
  query: ServiceSearchQuery;
  limit: number;
  radiusKm: number;
  postalCode?: string;
  city?: string;
  lat?: number;
  lng?: number;
}

interface ParseOptions {
  defaultLimit: number;
  maxLimit: number;
  defaultRadiusKm: number;
  maxRadiusKm: number;
  examples: string[];
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const DEFAULT_PARSE_OPTIONS: ParseOptions = {
  defaultLimit: 25,
  maxLimit: 50,
  defaultRadiusKm: 5,
  maxRadiusKm: 30,
  examples: [],
};

export class InMemoryTTLCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.entries.delete(key);
      return null;
    }

    return entry.data;
  }

  getStale(key: string): T | null {
    return this.entries.get(key)?.data ?? null;
  }

  set(key: string, data: T): void {
    this.entries.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.entries.clear();
  }
}

export class UpstreamServiceError extends Error {
  readonly status: number;
  readonly upstream: string;
  readonly retryable: boolean;

  constructor(message: string, options: {
    status: number;
    upstream: string;
    retryable?: boolean;
  }) {
    super(message);
    this.name = 'UpstreamServiceError';
    this.status = options.status;
    this.upstream = options.upstream;
    this.retryable = options.retryable ?? (options.status >= 500 || options.status === 429);
  }
}

export function applyServiceCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export function handleServiceOptions(req: VercelRequest, res: VercelResponse): boolean {
  applyServiceCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }

  return false;
}

export function ensureGetMethod(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method !== 'GET') {
    res.status(405).json(createServiceErrorPayload({
      error: 'Method Not Allowed',
      message: 'Only GET requests are supported',
      retryable: false,
    }));
    return false;
  }

  return true;
}

function queryValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return typeof value === 'string' ? value : undefined;
}

function parseLimit(
  rawLimit: string | undefined,
  options: ParseOptions,
): number | ServiceErrorPayload {
  if (!rawLimit) {
    return options.defaultLimit;
  }

  const limit = Number.parseInt(rawLimit, 10);
  if (Number.isNaN(limit) || limit < 1 || limit > options.maxLimit) {
    return createServiceErrorPayload({
      error: 'Bad Request',
      message: `limit must be an integer between 1 and ${options.maxLimit}`,
      retryable: false,
    });
  }

  return limit;
}

export function parseServiceSearchParams(
  reqQuery: VercelRequest['query'],
  overrides: Partial<ParseOptions> = {},
): { ok: true; value: ParsedServiceSearchParams } | { ok: false; status: number; error: ServiceErrorPayload } {
  const options = {
    ...DEFAULT_PARSE_OPTIONS,
    ...overrides,
  };

  const cp = queryValue(reqQuery.cp)?.trim();
  const city = queryValue(reqQuery.city)?.trim();
  const latRaw = queryValue(reqQuery.lat);
  const lngRaw = queryValue(reqQuery.lng);
  const radiusRaw = queryValue(reqQuery.radius);
  const limitRaw = queryValue(reqQuery.limit);

  const parsedLimit = parseLimit(limitRaw, options);
  if (typeof parsedLimit !== 'number') {
    return {
      ok: false,
      status: 400,
      error: {
        ...parsedLimit,
        examples: options.examples,
      },
    };
  }

  if (cp) {
    if (!/^\d{5}$/.test(cp)) {
      return {
        ok: false,
        status: 400,
        error: {
          ...createServiceErrorPayload({
            error: 'Bad Request',
            message: 'cp must be a 5-digit postal code',
            retryable: false,
          }),
          examples: options.examples,
        },
      };
    }

    return {
      ok: true,
      value: {
        mode: 'cp',
        cacheKey: `cp_${cp}_${parsedLimit}`,
        limit: parsedLimit,
        radiusKm: options.defaultRadiusKm,
        postalCode: cp,
        query: {
          postalCode: cp,
          limit: parsedLimit,
        },
      },
    };
  }

  if (city) {
    if (city.length < 2) {
      return {
        ok: false,
        status: 400,
        error: {
          ...createServiceErrorPayload({
            error: 'Bad Request',
            message: 'city must contain at least 2 characters',
            retryable: false,
          }),
          examples: options.examples,
        },
      };
    }

    const normalizedCity = normalizeCity(city);

    return {
      ok: true,
      value: {
        mode: 'city',
        cacheKey: `city_${normalizedCity}_${parsedLimit}`,
        limit: parsedLimit,
        radiusKm: options.defaultRadiusKm,
        city,
        query: {
          city,
          limit: parsedLimit,
        },
      },
    };
  }

  if (latRaw || lngRaw) {
    const lat = Number.parseFloat(latRaw ?? '');
    const lng = Number.parseFloat(lngRaw ?? '');
    const radiusKm = radiusRaw ? Number.parseFloat(radiusRaw) : options.defaultRadiusKm;

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return {
        ok: false,
        status: 400,
        error: {
          ...createServiceErrorPayload({
            error: 'Bad Request',
            message: 'lat and lng must be valid numbers',
            retryable: false,
          }),
          examples: options.examples,
        },
      };
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return {
        ok: false,
        status: 400,
        error: {
          ...createServiceErrorPayload({
            error: 'Bad Request',
            message: 'lat or lng is out of range',
            retryable: false,
          }),
          examples: options.examples,
        },
      };
    }

    if (Number.isNaN(radiusKm) || radiusKm <= 0 || radiusKm > options.maxRadiusKm) {
      return {
        ok: false,
        status: 400,
        error: {
          ...createServiceErrorPayload({
            error: 'Bad Request',
            message: `radius must be a positive number up to ${options.maxRadiusKm} km`,
            retryable: false,
          }),
          examples: options.examples,
        },
      };
    }

    return {
      ok: true,
      value: {
        mode: 'geo',
        cacheKey: `geo_${lat.toFixed(3)}_${lng.toFixed(3)}_${radiusKm}_${parsedLimit}`,
        limit: parsedLimit,
        radiusKm,
        lat,
        lng,
        query: {
          lat,
          lng,
          radius: radiusKm,
          limit: parsedLimit,
        },
      },
    };
  }

  return {
    ok: false,
    status: 400,
    error: {
      ...createServiceErrorPayload({
        error: 'Bad Request',
        message: 'Provide cp, city, or lat+lng search parameters',
        retryable: false,
      }),
      examples: options.examples,
    },
  };
}

export function createServiceErrorPayload(args: {
  error: string;
  message: string;
  retryable: boolean;
  upstream?: string;
  examples?: string[];
}): ServiceErrorPayload {
  return {
    error: args.error,
    message: args.message,
    retryable: args.retryable,
    upstream: args.upstream,
    examples: args.examples,
    contractVersion: SERVICE_CONTRACT_VERSION,
  };
}

export function resolveEndpointError(error: unknown): { status: number; payload: ServiceErrorPayload } {
  if (error instanceof UpstreamServiceError) {
    const status = error.status === 429 ? 429 : 502;
    return {
      status,
      payload: createServiceErrorPayload({
        error: status === 429 ? 'Rate Limited' : 'Bad Gateway',
        message: error.message,
        retryable: error.retryable,
        upstream: error.upstream,
      }),
    };
  }

  return {
    status: 500,
    payload: createServiceErrorPayload({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown internal error',
      retryable: true,
    }),
  };
}

export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const earthRadiusMeters = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

export function normalizeCity(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

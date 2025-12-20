/**
 * FacilAbo API v1 - Shared Utilities
 *
 * Standardized response formats, error handling, and caching
 * for all v1 API endpoints.
 *
 * @version 1.0.0
 * @author FacilAbo
 */

import type { VercelResponse } from '@vercel/node';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta: ApiMeta;
}

/**
 * Standard error format
 */
export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: string;
}

/**
 * Response metadata
 */
export interface ApiMeta {
  version: string;
  timestamp: string;
  cached?: boolean;
  source?: string;
  ttl?: number;
}

/**
 * Error codes for categorization
 */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'INTERNAL_ERROR'
  | 'SOURCE_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'VALIDATION_ERROR';

// ============================================================================
// CONSTANTS
// ============================================================================

export const API_VERSION = '1.0.0';

/**
 * Cache TTL values in seconds
 */
export const CACHE_TTL = {
  CALENDAR: 3600,       // 1 hour for ICS calendars
  TV_SCHEDULE: 1800,    // 30 minutes for TV schedule
  SPORT_RESULTS: 300,   // 5 minutes for live results
  PHARMACIES: 86400,    // 24 hours for pharmacy data
  HEALTH: 60,           // 1 minute for health check
} as const;

/**
 * HTTP status codes
 */
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  INTERNAL_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

/**
 * Create a successful API response
 *
 * @param compat - If true, returns data directly (backward compatible with iOS)
 */
export function successResponse<T>(
  res: VercelResponse,
  data: T,
  options: {
    cached?: boolean;
    source?: string;
    ttl?: number;
    compat?: boolean; // Backward compatibility mode (returns data directly)
  } = {}
): VercelResponse {
  // Set cache headers
  if (options.ttl) {
    res.setHeader(
      'Cache-Control',
      `s-maxage=${options.ttl}, stale-while-revalidate=${options.ttl * 2}`
    );
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Backward compatibility mode - return data directly
  if (options.compat) {
    return res.status(HTTP_STATUS.OK).json(data);
  }

  // V1 wrapped response
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      version: API_VERSION,
      timestamp: new Date().toISOString(),
      cached: options.cached,
      source: options.source,
      ttl: options.ttl,
    },
  };

  return res.status(HTTP_STATUS.OK).json(response);
}

/**
 * Create an error API response
 */
export function errorResponse(
  res: VercelResponse,
  code: ErrorCode,
  message: string,
  details?: string,
  statusCode?: number
): VercelResponse {
  const httpStatus = statusCode || mapErrorCodeToStatus(code);

  const response: ApiResponse<never> = {
    success: false,
    error: {
      code,
      message,
      details,
    },
    meta: {
      version: API_VERSION,
      timestamp: new Date().toISOString(),
    },
  };

  // Set CORS headers even for errors
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  return res.status(httpStatus).json(response);
}

/**
 * Handle OPTIONS preflight requests
 */
export function handleOptions(res: VercelResponse): VercelResponse {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return res.status(200).end();
}

/**
 * Validate HTTP method (returns true if valid)
 */
export function validateMethod(
  res: VercelResponse,
  method: string | undefined,
  allowed: string[] = ['GET']
): boolean {
  if (method === 'OPTIONS') {
    handleOptions(res);
    return false;
  }

  if (!method || !allowed.includes(method)) {
    errorResponse(
      res,
      'METHOD_NOT_ALLOWED',
      `Method ${method} not allowed`,
      `Allowed methods: ${allowed.join(', ')}`
    );
    return false;
  }

  return true;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Map error codes to HTTP status codes
 */
function mapErrorCodeToStatus(code: ErrorCode): number {
  const mapping: Record<ErrorCode, number> = {
    BAD_REQUEST: HTTP_STATUS.BAD_REQUEST,
    NOT_FOUND: HTTP_STATUS.NOT_FOUND,
    METHOD_NOT_ALLOWED: HTTP_STATUS.METHOD_NOT_ALLOWED,
    INTERNAL_ERROR: HTTP_STATUS.INTERNAL_ERROR,
    SOURCE_UNAVAILABLE: HTTP_STATUS.BAD_GATEWAY,
    RATE_LIMITED: 429,
    VALIDATION_ERROR: HTTP_STATUS.BAD_REQUEST,
  };
  return mapping[code] || HTTP_STATUS.INTERNAL_ERROR;
}

// ============================================================================
// GENERIC CACHE
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const genericCache = new Map<string, CacheEntry<unknown>>();

/**
 * Get cached data if still valid
 */
export function getCache<T>(key: string): T | null {
  const entry = genericCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.timestamp > entry.ttl * 1000) {
    genericCache.delete(key);
    return null;
  }

  return entry.data;
}

/**
 * Set cache with TTL (in seconds)
 */
export function setCache<T>(key: string, data: T, ttlSeconds: number): void {
  genericCache.set(key, {
    data,
    timestamp: Date.now(),
    ttl: ttlSeconds,
  });
}

/**
 * Get stale cache (even if expired) for fallback
 */
export function getStaleCache<T>(key: string): T | null {
  const entry = genericCache.get(key) as CacheEntry<T> | undefined;
  return entry?.data ?? null;
}

/**
 * Clear specific cache entry
 */
export function clearCache(key: string): void {
  genericCache.delete(key);
}

// ============================================================================
// LOGGING
// ============================================================================

/**
 * Structured log for debugging
 */
export function log(
  level: 'info' | 'warn' | 'error',
  endpoint: string,
  message: string,
  data?: Record<string, unknown>
): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    endpoint,
    message,
    ...data,
  };

  if (level === 'error') {
    console.error(JSON.stringify(logEntry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(logEntry));
  } else {
    console.log(JSON.stringify(logEntry));
  }
}

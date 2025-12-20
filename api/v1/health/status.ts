/**
 * FacilAbo API v1 - Health Status
 *
 * Monitors the health of all backend sources.
 * Use this endpoint to quickly diagnose issues.
 *
 * @endpoint GET /api/v1/health/status
 * @returns Status of all data sources
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

interface SourceStatus {
  name: string;
  category: string;
  status: 'ok' | 'degraded' | 'down';
  latency?: number;
  error?: string;
}

interface HealthResponse {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  sources: SourceStatus[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    down: number;
  };
  timestamp: string;
}

const SOURCES_TO_CHECK = [
  {
    name: 'Fixtur.es (Football)',
    category: 'calendars',
    url: 'https://ics.fixtur.es/v2/paris-saint-germain.ics',
  },
  {
    name: 'Better F1 Calendar',
    category: 'calendars',
    url: 'https://better-f1-calendar.vercel.app/api/calendar.ics',
  },
  {
    name: 'FootMercato',
    category: 'scraping',
    url: 'https://www.footmercato.net/programme-tv/ligue-1/',
  },
  {
    name: 'OpenDataSoft (Pharmacies)',
    category: 'api',
    url: 'https://public.opendatasoft.com/api/records/1.0/search/?dataset=finess-etablissements&rows=1',
  },
];

async function checkSource(source: { name: string; category: string; url: string }): Promise<SourceStatus> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(source.url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'FacilAbo/1.0 Health Check' },
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const latency = Date.now() - startTime;

    if (response.ok) {
      return {
        name: source.name,
        category: source.category,
        status: latency > 3000 ? 'degraded' : 'ok',
        latency,
      };
    } else {
      return {
        name: source.name,
        category: source.category,
        status: 'degraded',
        latency,
        error: `HTTP ${response.status}`,
      };
    }
  } catch (error) {
    return {
      name: source.name,
      category: source.category,
      status: 'down',
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const results = await Promise.all(SOURCES_TO_CHECK.map(checkSource));

    const summary = {
      total: results.length,
      healthy: results.filter(r => r.status === 'ok').length,
      degraded: results.filter(r => r.status === 'degraded').length,
      down: results.filter(r => r.status === 'down').length,
    };

    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (summary.down > 0) {
      overall = summary.down >= summary.total / 2 ? 'unhealthy' : 'degraded';
    } else if (summary.degraded > 0) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }

    const response: HealthResponse = {
      overall,
      sources: results,
      summary,
      timestamp: new Date().toISOString(),
    };

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({
      error: 'Health check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

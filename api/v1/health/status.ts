/**
 * FacilAbo API v1 - Health Status
 *
 * Monitors the health of all backend sources.
 * Use this endpoint to quickly diagnose issues.
 *
 * @endpoint GET /api/v1/health/status
 * @returns Status of all data sources
 *
 * HTTP Status Codes (for UptimeRobot):
 * - 200: All sources healthy or degraded
 * - 503: System unhealthy (50%+ sources down)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

interface SourceStatus {
  name: string;
  category: string;
  status: 'ok' | 'degraded' | 'down';
  latency?: number;
  error?: string;
  critical: boolean;
}

interface HealthResponse {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  sources: SourceStatus[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    down: number;
    criticalDown: number;
  };
  timestamp: string;
  uptimeMessage: string;
}

// Sources to monitor with criticality flag
const SOURCES_TO_CHECK = [
  // Calendar sources (critical - core functionality)
  {
    name: 'Fixtur.es (Football/Rugby)',
    category: 'calendars',
    url: 'https://ics.fixtur.es/v2/paris-saint-germain.ics',
    method: 'HEAD' as const,
    critical: true,
  },
  {
    name: 'Better F1 Calendar',
    category: 'calendars',
    url: 'https://better-f1-calendar.vercel.app/api/calendar.ics',
    method: 'HEAD' as const,
    critical: true,
  },
  {
    name: 'RugbyFixture.io (Top 14)',
    category: 'calendars',
    url: 'https://data.rugbyfixture.io/ical/v1/top14.ics',
    method: 'HEAD' as const,
    critical: true,
  },
  {
    name: 'Etalab (Jours Fériés)',
    category: 'calendars',
    url: 'https://etalab.github.io/jours-feries-france-data/ics/jours_feries_metropole.ics',
    method: 'HEAD' as const,
    critical: true,
  },
  {
    name: 'Opendatasoft (Vacances)',
    category: 'calendars',
    url: 'https://fr.ftp.opendatasoft.com/openscol/fr-en-calendrier-scolaire/Zone-A.ics',
    method: 'HEAD' as const,
    critical: true,
  },
  // Scraping sources (non-critical - can fail temporarily)
  {
    name: 'FootMercato (TV Schedule)',
    category: 'scraping',
    url: 'https://www.footmercato.net/programme-tv/france/ligue-1',
    method: 'GET' as const, // HEAD not supported
    critical: false,
  },
  // API sources
  {
    name: 'OpenDataSoft (Pharmacies)',
    category: 'api',
    url: 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/healthref-france-finess/records?limit=1',
    method: 'GET' as const, // HEAD not supported
    critical: false,
  },
  // GitHub sources (static calendars)
  {
    name: 'GitHub (Calendriers statiques)',
    category: 'calendars',
    url: 'https://raw.githubusercontent.com/augiefra/facilabo/main/astronomie/calendrier-astronomie.ics',
    method: 'HEAD' as const,
    critical: false,
  },
];

async function checkSource(source: typeof SOURCES_TO_CHECK[0]): Promise<SourceStatus> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(source.url, {
      method: source.method,
      headers: {
        'User-Agent': 'FacilAbo/1.0 Health Check',
        'Accept': '*/*',
      },
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
        critical: source.critical,
      };
    } else {
      return {
        name: source.name,
        category: source.category,
        status: 'degraded',
        latency,
        error: `HTTP ${response.status}`,
        critical: source.critical,
      };
    }
  } catch (error) {
    return {
      name: source.name,
      category: source.category,
      status: 'down',
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      critical: source.critical,
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
      criticalDown: results.filter(r => r.status === 'down' && r.critical).length,
    };

    // Determine overall status
    // Unhealthy if: any critical source is down OR 50%+ sources down
    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (summary.criticalDown > 0 || summary.down >= summary.total / 2) {
      overall = 'unhealthy';
    } else if (summary.down > 0 || summary.degraded > 0) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }

    // Generate human-readable message for UptimeRobot
    let uptimeMessage: string;
    if (overall === 'healthy') {
      uptimeMessage = `OK - All ${summary.total} sources healthy`;
    } else if (overall === 'degraded') {
      uptimeMessage = `WARN - ${summary.degraded} degraded, ${summary.down} down`;
    } else {
      const criticalNames = results
        .filter(r => r.status === 'down' && r.critical)
        .map(r => r.name)
        .join(', ');
      uptimeMessage = `CRITICAL - ${summary.criticalDown} critical sources down: ${criticalNames || 'multiple failures'}`;
    }

    const response: HealthResponse = {
      overall,
      sources: results,
      summary,
      timestamp: new Date().toISOString(),
      uptimeMessage,
    };

    // Return 503 for unhealthy so UptimeRobot detects it as down
    const httpStatus = overall === 'unhealthy' ? 503 : 200;
    return res.status(httpStatus).json(response);
  } catch (error) {
    return res.status(503).json({
      overall: 'unhealthy',
      error: 'Health check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      uptimeMessage: 'CRITICAL - Health check execution failed',
      timestamp: new Date().toISOString(),
    });
  }
}

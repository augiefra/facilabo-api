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
 * - 503: System unhealthy (50%+ sources down OR multiple critical sources down)
 */

import type { VercelRequest, VercelResponse } from '../../../lib/vercel-http';
import { getAbuseHealthSummary } from '../../../lib/abuse-monitor';
import { validateNascarCalendar, validateNbaCalendar } from '../../../lib/calendar-source-health';
import { NASCAR_CALENDARS, NBA_CALENDARS } from '../../../lib/calendar-mappings';

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
  abuseSummary?: {
    mode: 'observe' | 'enforce';
    provider: 'disabled';
    requests5m: number;
    suspicious: boolean;
  };
}

interface HealthSource {
  name: string;
  category: string;
  url: string;
  method: 'GET' | 'HEAD';
  critical: boolean;
  validateBody?: (body: string) => string | undefined;
}

// Sources to monitor with criticality flag
const SOURCES_TO_CHECK: HealthSource[] = [
  // Core calendars (critical)
  {
    name: 'Opendatasoft (Vacances)',
    category: 'calendars',
    url: 'https://fr.ftp.opendatasoft.com/openscol/fr-en-calendrier-scolaire/Zone-A.ics',
    method: 'HEAD' as const,
    critical: true,
  },
  {
    name: 'Etalab (Jours Feries)',
    category: 'calendars',
    url: 'https://etalab.github.io/jours-feries-france-data/ics/jours_feries_metropole.ics',
    method: 'HEAD' as const,
    critical: true,
  },
  {
    name: 'Fixtur.es (Football)',
    category: 'calendars',
    url: 'https://ics.fixtur.es/v2/paris-saint-germain.ics',
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
    name: 'Better F1 Calendar',
    category: 'calendars',
    url: 'https://better-f1-calendar.vercel.app/api/calendar.ics',
    method: 'GET' as const,
    critical: true,
  },
  // Sports calendars (non-critical)
  {
    name: 'Fixtur.es (MotoGP)',
    category: 'calendars',
    url: 'https://ics.fixtur.es/v2/league/motogp.ics',
    method: 'HEAD' as const,
    critical: false,
  },
  {
    name: 'GitHub (NASCAR Cup 2027)',
    category: 'calendars',
    url: NASCAR_CALENDARS.nascar.sourceUrl,
    method: 'GET' as const,
    critical: false,
    validateBody: validateNascarCalendar,
  },
  {
    name: 'GitHub (NBA 2026-27)',
    category: 'calendars',
    url: NBA_CALENDARS.basketball.sourceUrl,
    method: 'GET' as const,
    critical: false,
    validateBody: validateNbaCalendar,
  },
  {
    name: "Data.gouv (Changement d'heure)",
    category: 'calendars',
    url: 'https://www.data.gouv.fr/api/1/datasets/r/44a31e90-3391-41aa-9c6a-18fae257b9e4',
    method: 'GET' as const,
    critical: false,
  },
  // GitHub calendars (non-critical)
  {
    name: 'GitHub (Astronomie)',
    category: 'calendars',
    url: 'https://raw.githubusercontent.com/augiefra/facilabo/main/astronomie/calendrier-astronomie.ics',
    method: 'HEAD' as const,
    critical: false,
  },
  {
    name: 'GitHub (Soldes)',
    category: 'calendars',
    url: 'https://raw.githubusercontent.com/augiefra/facilabo/main/soldes/france.ics',
    method: 'HEAD' as const,
    critical: false,
  },
  {
    name: 'GitHub (Fiscal)',
    category: 'calendars',
    url: 'https://raw.githubusercontent.com/augiefra/facilabo/main/fiscal/france.ics',
    method: 'HEAD' as const,
    critical: false,
  },
  {
    name: 'GitHub (Culture)',
    category: 'calendars',
    url: 'https://raw.githubusercontent.com/augiefra/facilabo/main/culture/france.ics',
    method: 'HEAD' as const,
    critical: false,
  },
  {
    name: 'GitHub (Ecommerce)',
    category: 'calendars',
    url: 'https://raw.githubusercontent.com/augiefra/facilabo/main/ecommerce/blackfriday.ics',
    method: 'HEAD' as const,
    critical: false,
  },
  {
    name: 'GitHub (Ecommerce - Prime Day)',
    category: 'calendars',
    url: 'https://raw.githubusercontent.com/augiefra/facilabo/main/ecommerce/primeday.ics',
    method: 'HEAD' as const,
    critical: false,
  },
  {
    name: 'GitHub (Ecommerce - French Days)',
    category: 'calendars',
    url: 'https://raw.githubusercontent.com/augiefra/facilabo/main/ecommerce/frenchdays.ics',
    method: 'HEAD' as const,
    critical: false,
  },
  {
    name: 'GitHub (Ecommerce - Fetes Commerciales)',
    category: 'calendars',
    url: 'https://raw.githubusercontent.com/augiefra/facilabo/main/ecommerce/fetes-commerciales.ics',
    method: 'HEAD' as const,
    critical: false,
  },
  {
    name: 'GitHub (Jardin)',
    category: 'calendars',
    url: 'https://raw.githubusercontent.com/augiefra/facilabo/main/jardin/lunaire.ics',
    method: 'HEAD' as const,
    critical: false,
  },
  {
    name: 'GitHub (Sport - Equipe de France Football)',
    category: 'calendars',
    url: 'https://raw.githubusercontent.com/augiefra/facilabo/main/sport/france-foot-equipe-nationale.ics',
    method: 'HEAD' as const,
    critical: false,
  },
  {
    name: 'GitHub (Sport - Equipe de France Rugby)',
    category: 'calendars',
    url: 'https://raw.githubusercontent.com/augiefra/facilabo/main/sport/france-rugby-equipe-nationale.ics',
    method: 'HEAD' as const,
    critical: false,
  },
  // Scraping sources (non-critical)
  {
    name: 'FootMercato (TV Schedule)',
    category: 'scraping',
    url: 'https://www.footmercato.net/programme-tv/france/ligue-1',
    method: 'GET' as const, // HEAD not supported
    critical: false,
  },
  // API sources (non-critical)
  {
    name: 'OpenDataSoft (Pharmacies)',
    category: 'api',
    url: 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/healthref-france-finess/records?limit=1',
    method: 'GET' as const, // HEAD not supported
    critical: false,
  },
];

async function checkSource(source: HealthSource): Promise<SourceStatus> {
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
      const validationError = source.validateBody?.(await response.text());
      if (validationError) {
        return {
          name: source.name,
          category: source.category,
          status: 'degraded',
          latency,
          error: validationError,
          critical: source.critical,
        };
      }
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
    // Unhealthy if: multiple critical sources are down OR 50%+ sources down.
    // Rationale: external providers are flaky; one critical source down should be "degraded"
    // so we don't page/spam on transient outages.
    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (summary.criticalDown >= 2 || summary.down >= summary.total / 2) {
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

    let abuseSummary: HealthResponse['abuseSummary'];
    try {
      abuseSummary = await getAbuseHealthSummary();
    } catch {
      abuseSummary = undefined;
    }

    const response: HealthResponse = {
      overall,
      sources: results,
      summary,
      timestamp: new Date().toISOString(),
      uptimeMessage,
      abuseSummary,
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

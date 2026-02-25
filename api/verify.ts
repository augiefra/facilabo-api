import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * =============================================================================
 * DATA VERACITY API ENDPOINT
 * =============================================================================
 *
 * GET /api/verify - Run data verification checks
 * GET /api/verify?module=health|sport|pharmacy|stations|hospitals|post-offices|services
 * GET /api/verify?quick=true - Quick health check only
 *
 * =============================================================================
 */

interface VerificationResult {
  module: string;
  status: 'PASS' | 'WARN' | 'FAIL' | 'SKIP';
  message: string;
  details?: Record<string, unknown>;
  responseTime?: number;
  timestamp: string;
}

interface VerificationReport {
  agentId: string;
  timestamp: string;
  duration: number;
  summary: {
    total: number;
    passed: number;
    warnings: number;
    failed: number;
    score: number;
  };
  results: VerificationResult[];
  recommendations: string[];
}

const API_BASE = 'https://facilabo-api.vercel.app/api/v1';

async function fetchWithTiming(url: string): Promise<{
  ok: boolean;
  status: number;
  data?: unknown;
  error?: string;
  responseTime: number;
}> {
  const start = Date.now();
  try {
    const response = await fetch(url);
    const responseTime = Date.now() - start;

    if (!response.ok) {
      return { ok: false, status: response.status, error: `HTTP ${response.status}`, responseTime };
    }

    const data = await response.json();
    return { ok: true, status: response.status, data, responseTime };
  } catch (error) {
    return { ok: false, status: 0, error: String(error), responseTime: Date.now() - start };
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

// =============================================================================
// VERIFICATION MODULES
// =============================================================================

async function verifyHealth(): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];

  const endpoints = [
    { path: '/health/status', name: 'API Health' },
    { path: '/sports/results/football', name: 'Sport Results (Football - Ligue 1)' },
    { path: '/sports/results/rugby', name: 'Sport Results (Rugby - Top 14)' },
    { path: '/sports/results/f1', name: 'Sport Results (F1)' },
    { path: '/sports/results/motogp', name: 'Sport Results (MotoGP)' },
    { path: '/services/pharmacies?cp=75001', name: 'Services / Pharmacies' },
    { path: '/services/stations?cp=75001', name: 'Services / Stations' },
    { path: '/services/hospitals?cp=75001', name: 'Services / Hospitals' },
    { path: '/services/post-offices?cp=75001', name: 'Services / Post Offices' },
    { path: '/sports/tv-schedule', name: 'TV Schedule' },
  ];

  for (const endpoint of endpoints) {
    const response = await fetchWithTiming(`${API_BASE}${endpoint.path}`);

    results.push({
      module: 'health',
      status: response.ok ? (response.responseTime < 3000 ? 'PASS' : 'WARN') : 'FAIL',
      message: `${endpoint.name}: ${response.ok ? `${response.responseTime}ms` : 'Echec'}`,
      responseTime: response.responseTime,
      details: response.ok ? undefined : { error: response.error },
      timestamp: nowIso(),
    });
  }

  return results;
}

async function verifySportResults(): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];

  const response = await fetchWithTiming(`${API_BASE}/sports/results/football`);

  if (!response.ok) {
    results.push({
      module: 'sport-results',
      status: 'FAIL',
      message: 'API indisponible',
      details: { error: response.error },
      timestamp: nowIso(),
    });
    return results;
  }

  const data = response.data as {
    competition: string;
    results: Array<{
      homeTeam: string;
      awayTeam: string;
      homeScore: number;
      awayScore: number;
      date: string;
    }>;
    source: string;
  };

  if (!data.results?.length) {
    results.push({
      module: 'sport-results',
      status: 'WARN',
      message: 'Aucun resultat disponible',
      timestamp: nowIso(),
    });
    return results;
  }

  results.push({
    module: 'sport-results',
    status: 'PASS',
    message: `${data.results.length} resultats disponibles`,
    details: {
      competition: data.competition,
      source: data.source,
      latestMatch: data.results[0]
        ? `${data.results[0].homeTeam} ${data.results[0].homeScore}-${data.results[0].awayScore} ${data.results[0].awayTeam}`
        : null,
    },
    timestamp: nowIso(),
  });

  const latestDate = new Date(data.results[0].date);
  const daysSince = Math.floor((Date.now() - latestDate.getTime()) / (1000 * 60 * 60 * 24));

  results.push({
    module: 'sport-results',
    status: daysSince <= 7 ? 'PASS' : 'WARN',
    message: daysSince <= 7 ? 'Donnees recentes' : `Donnees datant de ${daysSince} jours`,
    details: { latestMatchDate: data.results[0].date, daysSince },
    timestamp: nowIso(),
  });

  const invalidScores = data.results.filter(
    (match) => match.homeScore < 0 || match.awayScore < 0 || match.homeScore > 15 || match.awayScore > 15,
  );

  results.push({
    module: 'sport-results',
    status: invalidScores.length === 0 ? 'PASS' : 'FAIL',
    message: invalidScores.length === 0 ? 'Scores valides' : `${invalidScores.length} score(s) invalide(s)`,
    timestamp: nowIso(),
  });

  return results;
}

async function verifyServiceEndpoint(args: {
  module: string;
  itemKey: 'pharmacies' | 'stations' | 'hospitals' | 'postOffices';
  pathPrefix: '/services/pharmacies' | '/services/stations' | '/services/hospitals' | '/services/post-offices';
  testCases: Array<{ label: string; query: string }>;
}): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];

  for (const testCase of args.testCases) {
    const response = await fetchWithTiming(`${API_BASE}${args.pathPrefix}?${testCase.query}`);

    if (!response.ok) {
      results.push({
        module: args.module,
        status: 'FAIL',
        message: `${testCase.label}: Echec requete`,
        details: { error: response.error },
        timestamp: nowIso(),
      });
      continue;
    }

    const payload = response.data as {
      total?: number;
      contractVersion?: string;
      source?: string;
      [key: string]: unknown;
    };

    const total = typeof payload.total === 'number' ? payload.total : 0;
    const items = Array.isArray(payload[args.itemKey]) ? payload[args.itemKey] as unknown[] : [];

    results.push({
      module: args.module,
      status: total > 0 ? 'PASS' : 'WARN',
      message: `${testCase.label}: ${total} resultat(s)`,
      responseTime: response.responseTime,
      details: {
        total,
        sample: items[0] ?? null,
      },
      timestamp: nowIso(),
    });

    results.push({
      module: args.module,
      status: typeof payload.contractVersion === 'string' ? 'PASS' : 'FAIL',
      message: typeof payload.contractVersion === 'string'
        ? `${testCase.label}: contractVersion present`
        : `${testCase.label}: contractVersion manquant`,
      timestamp: nowIso(),
    });
  }

  const invalidParamsResponse = await fetchWithTiming(`${API_BASE}${args.pathPrefix}?cp=75`);
  results.push({
    module: args.module,
    status: invalidParamsResponse.status === 400 ? 'PASS' : 'WARN',
    message: invalidParamsResponse.status === 400
      ? 'Validation des parametres invalide OK'
      : `Validation parametres inattendue (HTTP ${invalidParamsResponse.status})`,
    timestamp: nowIso(),
  });

  return results;
}

async function verifyPharmacies(): Promise<VerificationResult[]> {
  return verifyServiceEndpoint({
    module: 'pharmacies',
    itemKey: 'pharmacies',
    pathPrefix: '/services/pharmacies',
    testCases: [
      { label: 'Paris CP', query: 'cp=75001' },
      { label: 'Paris city', query: 'city=Paris' },
      { label: 'Paris geo', query: 'lat=48.8566&lng=2.3522&radius=3' },
    ],
  });
}

async function verifyStations(): Promise<VerificationResult[]> {
  return verifyServiceEndpoint({
    module: 'stations',
    itemKey: 'stations',
    pathPrefix: '/services/stations',
    testCases: [
      { label: 'Paris CP', query: 'cp=75001' },
      { label: 'Lyon city', query: 'city=Lyon' },
      { label: 'Paris geo', query: 'lat=48.8610&lng=2.3410&radius=5' },
    ],
  });
}

async function verifyHospitals(): Promise<VerificationResult[]> {
  return verifyServiceEndpoint({
    module: 'hospitals',
    itemKey: 'hospitals',
    pathPrefix: '/services/hospitals',
    testCases: [
      { label: 'Paris CP', query: 'cp=75001' },
      { label: 'Marseille city', query: 'city=Marseille' },
      { label: 'Paris geo', query: 'lat=48.8566&lng=2.3522&radius=10' },
    ],
  });
}

async function verifyPostOffices(): Promise<VerificationResult[]> {
  return verifyServiceEndpoint({
    module: 'post-offices',
    itemKey: 'postOffices',
    pathPrefix: '/services/post-offices',
    testCases: [
      { label: 'Paris CP', query: 'cp=75001' },
      { label: 'Paris city', query: 'city=Paris' },
      { label: 'Paris geo', query: 'lat=48.8566&lng=2.3522&radius=10' },
    ],
  });
}

async function verifyServices(): Promise<VerificationResult[]> {
  const [pharmacies, stations, hospitals, postOffices] = await Promise.all([
    verifyPharmacies(),
    verifyStations(),
    verifyHospitals(),
    verifyPostOffices(),
  ]);

  return [...pharmacies, ...stations, ...hospitals, ...postOffices];
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const startTime = Date.now();
  const agentId = `DVA-${Date.now().toString(36).toUpperCase()}`;
  const { module, quick } = req.query;

  try {
    let allResults: VerificationResult[] = [];

    if (quick === 'true') {
      allResults = await verifyHealth();
    } else if (module === 'health') {
      allResults = await verifyHealth();
    } else if (module === 'sport') {
      allResults = await verifySportResults();
    } else if (module === 'pharmacy') {
      allResults = await verifyPharmacies();
    } else if (module === 'stations') {
      allResults = await verifyStations();
    } else if (module === 'hospitals') {
      allResults = await verifyHospitals();
    } else if (module === 'post-offices') {
      allResults = await verifyPostOffices();
    } else if (module === 'services') {
      allResults = await verifyServices();
    } else {
      const [health, sport, services] = await Promise.all([
        verifyHealth(),
        verifySportResults(),
        verifyServices(),
      ]);
      allResults = [...health, ...sport, ...services];
    }

    const passed = allResults.filter((result) => result.status === 'PASS').length;
    const warnings = allResults.filter((result) => result.status === 'WARN').length;
    const failed = allResults.filter((result) => result.status === 'FAIL').length;
    const total = allResults.length;
    const score = total > 0 ? Math.round((passed / total) * 100) : 0;

    const recommendations: string[] = [];
    if (failed > 0) {
      recommendations.push('CRITIQUE: Des tests ont echoue - investigation immediate requise');
    }
    if (warnings > 2) {
      recommendations.push('ATTENTION: Plusieurs avertissements - surveillance recommandee');
    }
    if (score < 80) {
      recommendations.push('QUALITE: Score de veracite insuffisant');
    }
    if (score === 100) {
      recommendations.push('EXCELLENT: Toutes les verifications ont reussi');
    }

    const report: VerificationReport = {
      agentId,
      timestamp: nowIso(),
      duration: Date.now() - startTime,
      summary: {
        total,
        passed,
        warnings,
        failed,
        score,
      },
      results: allResults,
      recommendations,
    };

    const httpStatus = failed > 0 ? 503 : 200;
    return res.status(httpStatus).json(report);
  } catch (error) {
    console.error('Verification error:', error);

    return res.status(500).json({
      agentId,
      timestamp: nowIso(),
      duration: Date.now() - startTime,
      error: 'Verification agent failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

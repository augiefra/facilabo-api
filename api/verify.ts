import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * =============================================================================
 * DATA VERACITY API ENDPOINT
 * =============================================================================
 *
 * GET /api/verify - Run data verification checks
 * GET /api/verify?module=sport - Run specific module
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

const API_BASE = 'https://facilabo-api.vercel.app/api';

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

// =============================================================================
// VERIFICATION MODULES
// =============================================================================

async function verifyHealth(): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];

  const endpoints = [
    { path: '/sport-results', name: 'Sport Results (Ligue 1)' },
    { path: '/sport-results-rugby', name: 'Sport Results (Rugby Top 14)' },
    { path: '/sport-results-f1', name: 'Sport Results (F1)' },
    { path: '/sport-results-motogp', name: 'Sport Results (MotoGP)' },
    { path: '/pharmacies?cp=75001', name: 'Pharmacies' },
    { path: '/tv-schedule', name: 'TV Schedule' },
  ];

  for (const endpoint of endpoints) {
    const response = await fetchWithTiming(`${API_BASE}${endpoint.path}`);

    results.push({
      module: 'health',
      status: response.ok ? (response.responseTime < 3000 ? 'PASS' : 'WARN') : 'FAIL',
      message: `${endpoint.name}: ${response.ok ? `${response.responseTime}ms` : 'Echec'}`,
      responseTime: response.responseTime,
      details: response.ok ? undefined : { error: response.error },
      timestamp: new Date().toISOString(),
    });
  }

  return results;
}

async function verifySportResults(): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];

  const response = await fetchWithTiming(`${API_BASE}/sport-results`);

  if (!response.ok) {
    results.push({
      module: 'sport-results',
      status: 'FAIL',
      message: 'API indisponible',
      details: { error: response.error },
      timestamp: new Date().toISOString(),
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

  // Check data presence
  if (!data.results?.length) {
    results.push({
      module: 'sport-results',
      status: 'WARN',
      message: 'Aucun resultat disponible',
      timestamp: new Date().toISOString(),
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
      latestMatch: data.results[0] ? `${data.results[0].homeTeam} ${data.results[0].homeScore}-${data.results[0].awayScore} ${data.results[0].awayTeam}` : null,
    },
    timestamp: new Date().toISOString(),
  });

  // Check data freshness
  const latestDate = new Date(data.results[0].date);
  const daysSince = Math.floor((Date.now() - latestDate.getTime()) / (1000 * 60 * 60 * 24));

  results.push({
    module: 'sport-results',
    status: daysSince <= 7 ? 'PASS' : 'WARN',
    message: daysSince <= 7 ? 'Donnees recentes' : `Donnees datant de ${daysSince} jours`,
    details: { latestMatchDate: data.results[0].date, daysSince },
    timestamp: new Date().toISOString(),
  });

  // Validate scores
  const invalidScores = data.results.filter(
    m => m.homeScore < 0 || m.awayScore < 0 || m.homeScore > 15 || m.awayScore > 15
  );

  results.push({
    module: 'sport-results',
    status: invalidScores.length === 0 ? 'PASS' : 'FAIL',
    message: invalidScores.length === 0 ? 'Scores valides' : `${invalidScores.length} score(s) invalide(s)`,
    timestamp: new Date().toISOString(),
  });

  return results;
}

async function verifyPharmacies(): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];

  // Test multiple regions
  const testCases = [
    { cp: '75001', name: 'Paris' },
    { cp: '69001', name: 'Lyon' },
    { cp: '13001', name: 'Marseille' },
  ];

  for (const test of testCases) {
    const response = await fetchWithTiming(`${API_BASE}/pharmacies?cp=${test.cp}`);

    if (!response.ok) {
      results.push({
        module: 'pharmacies',
        status: 'FAIL',
        message: `${test.name}: Echec requete`,
        details: { error: response.error },
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    const data = response.data as { pharmacies: Array<{ name: string; phone: string | null }>; total: number };

    results.push({
      module: 'pharmacies',
      status: data.total > 0 ? 'PASS' : 'WARN',
      message: `${test.name}: ${data.total} pharmacies`,
      responseTime: response.responseTime,
      details: {
        total: data.total,
        sample: data.pharmacies[0]?.name,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Test geolocation
  const geoResponse = await fetchWithTiming(`${API_BASE}/pharmacies?lat=48.8566&lng=2.3522&radius=2`);

  results.push({
    module: 'pharmacies',
    status: geoResponse.ok ? 'PASS' : 'FAIL',
    message: geoResponse.ok ? 'Recherche geoloc OK' : 'Recherche geoloc Echec',
    responseTime: geoResponse.responseTime,
    timestamp: new Date().toISOString(),
  });

  return results;
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
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

    // Quick mode - health check only
    if (quick === 'true') {
      allResults = await verifyHealth();
    }
    // Specific module
    else if (module === 'sport') {
      allResults = await verifySportResults();
    } else if (module === 'pharmacy') {
      allResults = await verifyPharmacies();
    } else if (module === 'health') {
      allResults = await verifyHealth();
    }
    // Full verification
    else {
      const [health, sport, pharmacy] = await Promise.all([
        verifyHealth(),
        verifySportResults(),
        verifyPharmacies(),
      ]);
      allResults = [...health, ...sport, ...pharmacy];
    }

    // Calculate summary
    const passed = allResults.filter(r => r.status === 'PASS').length;
    const warnings = allResults.filter(r => r.status === 'WARN').length;
    const failed = allResults.filter(r => r.status === 'FAIL').length;
    const total = allResults.length;
    const score = total > 0 ? Math.round((passed / total) * 100) : 0;

    // Generate recommendations
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
      timestamp: new Date().toISOString(),
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

    // Set status based on results
    const httpStatus = failed > 0 ? 503 : 200;

    return res.status(httpStatus).json(report);

  } catch (error) {
    console.error('Verification error:', error);

    return res.status(500).json({
      agentId,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      error: 'Verification agent failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

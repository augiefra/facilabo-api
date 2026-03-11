import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * =============================================================================
 * DATA VERACITY API ENDPOINT
 * =============================================================================
 *
 * GET /api/verify - Run data verification checks
 * GET /api/verify?module=health|metadata|sport|pharmacy|stations|hospitals|post-offices|services
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

interface RuntimeContractPayload {
  runtime?: {
    freshness?: string;
    degraded?: boolean;
    fallbackUsed?: boolean;
    lastUpdated?: string;
  };
}

interface MetadataVerifyPayload extends RuntimeContractPayload {
  success?: boolean;
  data?: {
    slug?: string;
    nextEvent?: unknown;
  };
  meta?: {
    killSwitchActive?: boolean;
  };
}

interface MetadataRolloutProbe {
  slug: string;
  label: string;
}

const API_BASE = 'https://facilabo-api.vercel.app/api/v1';
const METADATA_ROLLOUT_SAMPLE: MetadataRolloutProbe[] = [
  { slug: 'vacances-zone-a', label: 'Vacances Zone A' },
  { slug: 'feries-metropole', label: 'Feries Metropole' },
  { slug: 'fiscal-france', label: 'Fiscalite France' },
  { slug: 'sport-france-foot-equipe-nationale', label: 'Equipe de France football' },
];

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

function hasRuntimeContract(payload: unknown): payload is RuntimeContractPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const runtime = (payload as RuntimeContractPayload).runtime;
  if (!runtime || typeof runtime !== 'object') {
    return false;
  }

  return (
    typeof runtime.freshness === 'string' &&
    typeof runtime.degraded === 'boolean' &&
    typeof runtime.fallbackUsed === 'boolean' &&
    typeof runtime.lastUpdated === 'string'
  );
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

  results.push({
    module: 'sport-results',
    status: hasRuntimeContract(data) ? 'PASS' : 'FAIL',
    message: hasRuntimeContract(data)
      ? `Contrat runtime present (${data.runtime?.freshness})`
      : 'Contrat runtime manquant',
    details: hasRuntimeContract(data) ? { runtime: data.runtime } : undefined,
    timestamp: nowIso(),
  });

  return results;
}

async function verifyMetadataContract(): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];
  const response = await fetchWithTiming(`${API_BASE}/calendars/metadata/vacances-zone-a`);

  if (!response.ok) {
    results.push({
      module: 'metadata',
      status: 'FAIL',
      message: 'Metadata indisponible',
      details: { error: response.error },
      timestamp: nowIso(),
    });
    return results;
  }

  const payload = response.data as MetadataVerifyPayload;

  results.push({
    module: 'metadata',
    status: payload.success === true ? 'PASS' : 'FAIL',
    message: payload.success === true ? 'success=true' : 'success=true manquant',
    timestamp: nowIso(),
  });

  results.push({
    module: 'metadata',
    status: payload.data?.slug === 'vacances-zone-a' ? 'PASS' : 'FAIL',
    message: payload.data?.slug === 'vacances-zone-a'
      ? 'Slug metadata coherent'
      : `Slug metadata incoherent (${payload.data?.slug ?? 'absent'})`,
    timestamp: nowIso(),
  });

  results.push({
    module: 'metadata',
    status: hasRuntimeContract(payload) ? 'PASS' : 'FAIL',
    message: hasRuntimeContract(payload)
      ? `Contrat runtime present (${payload.runtime?.freshness})`
      : 'Contrat runtime manquant',
    details: hasRuntimeContract(payload) ? { runtime: payload.runtime } : undefined,
    timestamp: nowIso(),
  });

  results.push({
    module: 'metadata',
    status: 'PASS',
    message: 'Projection locale stale-safe possible sans metadata fraiche',
    details: {
      metadataIsOptionalForUpcomingSnapshot: true,
      hasNextEvent: payload.data?.nextEvent != null,
      reliesOnRuntimeContract: true,
    },
    timestamp: nowIso(),
  });

  const probeResponses = await Promise.all(
    METADATA_ROLLOUT_SAMPLE.map(async (probe) => {
      const probeResponse = await fetchWithTiming(`${API_BASE}/calendars/metadata/${probe.slug}`);
      const probePayload = probeResponse.data as MetadataVerifyPayload | undefined;

      return {
        slug: probe.slug,
        label: probe.label,
        ok: probeResponse.ok,
        status: probeResponse.status,
        responseTime: probeResponse.responseTime,
        error: probeResponse.error,
        runtimePresent: hasRuntimeContract(probePayload),
        freshness: probePayload?.runtime?.freshness ?? null,
        degraded: probePayload?.runtime?.degraded ?? null,
        fallbackUsed: probePayload?.runtime?.fallbackUsed ?? null,
        killSwitchActive: probePayload?.meta?.killSwitchActive === true,
      };
    }),
  );

  const sampleSize = probeResponses.length;
  const failedRequests = probeResponses.filter((probe) => !probe.ok).length;
  const missingRuntime = probeResponses.filter((probe) => probe.ok && !probe.runtimePresent).length;
  const unavailableCount = probeResponses.filter(
    (probe) => probe.freshness === 'unavailable' || probe.killSwitchActive,
  ).length;
  const degradedCount = probeResponses.filter((probe) => probe.degraded === true).length;
  const fallbackCount = probeResponses.filter((probe) => probe.fallbackUsed === true).length;
  const freshCount = probeResponses.filter((probe) => probe.freshness === 'fresh').length;
  const degradedRatio = sampleSize > 0 ? Math.round((degradedCount / sampleSize) * 100) : 0;

  let rolloutStatus: VerificationResult['status'] = 'PASS';
  if (failedRequests > 0 || missingRuntime > 0 || unavailableCount > 0) {
    rolloutStatus = 'FAIL';
  } else if (degradedCount > 0 || fallbackCount > 0) {
    rolloutStatus = 'WARN';
  }

  const rolloutMessage = rolloutStatus === 'PASS'
    ? `Signal bascule metadata stable: ${freshCount}/${sampleSize} fresh, 0 fallback`
    : rolloutStatus === 'WARN'
      ? `Signal bascule metadata degrade: ${degradedCount}/${sampleSize} degraded, ${fallbackCount} fallback`
      : `Signal bascule metadata critique: ${failedRequests + missingRuntime + unavailableCount} sonde(s) KO/inexploitables`;

  results.push({
    module: 'metadata',
    status: rolloutStatus,
    message: rolloutMessage,
    details: {
      signalName: 'metadata-degradation-sample',
      sampleSize,
      freshCount,
      degradedCount,
      fallbackCount,
      unavailableCount,
      failedRequests,
      missingRuntime,
      degradedRatio,
      helpsSubscriptionStateRollout: true,
      interpretation:
        'Permet de distinguer une degradation metadata backend d un probleme introduit par une future bascule iOS.',
      probes: probeResponses,
    },
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

    results.push({
      module: args.module,
      status: hasRuntimeContract(payload) ? 'PASS' : 'FAIL',
      message: hasRuntimeContract(payload)
        ? `${testCase.label}: contrat runtime present (${payload.runtime?.freshness})`
        : `${testCase.label}: contrat runtime manquant`,
      details: hasRuntimeContract(payload) ? { runtime: payload.runtime } : undefined,
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
    } else if (module === 'metadata') {
      allResults = await verifyMetadataContract();
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
      const [health, metadata, sport, services] = await Promise.all([
        verifyHealth(),
        verifyMetadataContract(),
        verifySportResults(),
        verifyServices(),
      ]);
      allResults = [...health, ...metadata, ...sport, ...services];
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
    const metadataRolloutSignal = allResults.find(
      (result) =>
        result.module === 'metadata' &&
        result.details &&
        result.details['signalName'] === 'metadata-degradation-sample',
    );
    if (metadataRolloutSignal?.status === 'WARN') {
      recommendations.push(
        'BASCULE IOS: Echantillon metadata degrade - qualifier le runtime backend avant d attribuer un ecart a la future bascule SubscriptionState',
      );
    }
    if (metadataRolloutSignal?.status === 'FAIL') {
      recommendations.push(
        'BASCULE IOS: Echantillon metadata critique - bloquer toute analyse de regression iOS tant que le runtime metadata n est pas stabilise',
      );
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

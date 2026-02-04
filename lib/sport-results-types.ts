// Types for Sport Results API

export interface MatchResult {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  date: string; // ISO 8601 format
  time: string; // HH:mm format
  status: MatchStatus;
  competition: string;
  matchday?: string; // "Journée 15"
}

export type MatchStatus =
  | 'finished'    // Match terminé
  | 'live'        // En cours
  | 'halftime'    // Mi-temps
  | 'scheduled'   // Programmé
  | 'postponed'   // Reporté
  | 'cancelled';  // Annulé

export interface SportResultsResponse {
  competition: string;
  results: MatchResult[];
  lastUpdated: string;
  source: string;
}

// Ligue 1 team mappings for consistent naming
export const LIGUE1_TEAMS: Record<string, string> = {
  'paris saint-germain': 'PSG',
  'paris': 'PSG',
  'psg': 'PSG',
  'olympique de marseille': 'OM',
  'marseille': 'OM',
  'om': 'OM',
  'olympique lyonnais': 'OL',
  'lyon': 'OL',
  'ol': 'OL',
  'as monaco': 'Monaco',
  'monaco': 'Monaco',
  'asm': 'Monaco',
  'lille': 'LOSC',
  'losc': 'LOSC',
  'rc lens': 'Lens',
  'lens': 'Lens',
  'rcl': 'Lens',
  'stade rennais': 'Rennes',
  'rennes': 'Rennes',
  'srfc': 'Rennes',
  'nice': 'Nice',
  'ogc nice': 'Nice',
  'ogcn': 'Nice',
  'stade brestois': 'Brest',
  'brest': 'Brest',
  'sb29': 'Brest',
  'stade de reims': 'Reims',
  'reims': 'Reims',
  'toulouse': 'Toulouse',
  'tfc': 'Toulouse',
  'montpellier': 'Montpellier',
  'mhsc': 'Montpellier',
  'rc strasbourg': 'Strasbourg',
  'strasbourg': 'Strasbourg',
  'rcs': 'Strasbourg',
  'fc nantes': 'Nantes',
  'nantes': 'Nantes',
  'fcn': 'Nantes',
  'aj auxerre': 'Auxerre',
  'auxerre': 'Auxerre',
  'aja': 'Auxerre',
  'le havre': 'Le Havre',
  'hac': 'Le Havre',
  'angers': 'Angers',
  'sco': 'Angers',
  'as saint-etienne': 'Saint-Etienne',
  'saint-etienne': 'Saint-Etienne',
  'asse': 'Saint-Etienne',
};

// Normalize team name for display
export function normalizeTeamName(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return LIGUE1_TEAMS[lower] || raw.trim();
}

// Simple in-memory cache for results
interface ResultsCacheEntry {
  data: SportResultsResponse;
  timestamp: number;
}

const resultsCache: Map<string, ResultsCacheEntry> = new Map();
const RESULTS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes (results change more often)

export function getResultsCached(key: string): SportResultsResponse | null {
  const entry = resultsCache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > RESULTS_CACHE_TTL) {
    resultsCache.delete(key);
    return null;
  }

  return entry.data;
}

export function getResultsStale(key: string): SportResultsResponse | null {
  const entry = resultsCache.get(key);
  return entry?.data ?? null;
}

export function setResultsCache(key: string, data: SportResultsResponse): void {
  resultsCache.set(key, { data, timestamp: Date.now() });
}

// =============================================================================
// RACE RESULTS (F1 / MotoGP)
// =============================================================================

export interface RaceResult {
  id: string;
  position: number;        // 1, 2, 3 for podium
  driver: string;          // Driver/Rider name
  team: string;            // Constructor/Team
  time: string;            // Finishing time or gap (e.g., "1:34:05" or "+3.2s")
  points: number;          // Championship points awarded
  fastestLap?: boolean;    // F1 specific
}

export interface RaceResultsResponse {
  competition: 'Formula 1' | 'MotoGP';
  raceName: string;        // "Grand Prix de Las Vegas"
  circuit: string;         // Track name
  date: string;            // Race date ISO
  podium: RaceResult[];    // Top 3 only
  lastUpdated: string;
  source: string;
}

// Cache for race results (longer TTL since races are weekly)
interface RaceCacheEntry {
  data: RaceResultsResponse;
  timestamp: number;
}

const raceCache: Map<string, RaceCacheEntry> = new Map();
const RACE_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export function getRaceCached(key: string): RaceResultsResponse | null {
  const entry = raceCache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > RACE_CACHE_TTL) {
    raceCache.delete(key);
    return null;
  }

  return entry.data;
}

export function getRaceStale(key: string): RaceResultsResponse | null {
  const entry = raceCache.get(key);
  return entry?.data ?? null;
}

export function setRaceCache(key: string, data: RaceResultsResponse): void {
  raceCache.set(key, { data, timestamp: Date.now() });
}

// =============================================================================
// RUGBY TOP 14
// =============================================================================

export interface RugbyResultsResponse {
  competition: 'Top 14';
  results: MatchResult[];
  lastUpdated: string;
  source: string;
}

// Rugby cache (10 minutes - weekend matches)
const RUGBY_CACHE_TTL = 10 * 60 * 1000;

export function getRugbyCached(key: string): RugbyResultsResponse | null {
  const entry = resultsCache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > RUGBY_CACHE_TTL) {
    resultsCache.delete(key);
    return null;
  }

  return entry.data as unknown as RugbyResultsResponse;
}

export function getRugbyStale(key: string): RugbyResultsResponse | null {
  const entry = resultsCache.get(key);
  return (entry?.data as unknown as RugbyResultsResponse) ?? null;
}

export function setRugbyCache(key: string, data: RugbyResultsResponse): void {
  resultsCache.set(key, { data: data as unknown as SportResultsResponse, timestamp: Date.now() });
}

// Top 14 team mappings for consistent naming
export const TOP14_TEAMS: Record<string, string> = {
  'stade toulousain': 'Toulouse',
  'toulouse': 'Toulouse',
  'union bordeaux-begles': 'UBB',
  'bordeaux-begles': 'UBB',
  'bordeaux': 'UBB',
  'ubb': 'UBB',
  'montpellier herault': 'Montpellier',
  'montpellier hr': 'Montpellier',
  'montpellier': 'Montpellier',
  'mhr': 'Montpellier',
  'lou rugby': 'Lyon',
  'lyon ou': 'Lyon',
  'lyon': 'Lyon',
  'lou': 'Lyon',
  'castres olympique': 'Castres',
  'castres': 'Castres',
  'co': 'Castres',
  'section paloise': 'Pau',
  'pau': 'Pau',
  'stade rochelais': 'La Rochelle',
  'la rochelle': 'La Rochelle',
  'sr': 'La Rochelle',
  'rc toulon': 'Toulon',
  'toulon': 'Toulon',
  'rct': 'Toulon',
  'racing 92': 'Racing 92',
  'racing': 'Racing 92',
  'r92': 'Racing 92',
  'asm clermont': 'Clermont',
  'clermont auvergne': 'Clermont',
  'clermont': 'Clermont',
  'asm': 'Clermont',
  'usap': 'Perpignan',
  'usa perpignan': 'Perpignan',
  'perpignan': 'Perpignan',
  'aviron bayonnais': 'Bayonne',
  'bayonne': 'Bayonne',
  'ab': 'Bayonne',
  'stade francais': 'Stade Francais',
  'stade francais paris': 'Stade Francais',
  'sfp': 'Stade Francais',
  'rc vannes': 'Vannes',
  'vannes': 'Vannes',
  'rcv': 'Vannes',
};

// Normalize rugby team name
export function normalizeRugbyTeamName(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return TOP14_TEAMS[lower] || raw.trim();
}

// =============================================================================
// F1 DRIVERS / TEAMS
// =============================================================================

export const F1_DRIVERS: Record<string, { short: string; team: string }> = {
  'max verstappen': { short: 'Verstappen', team: 'Red Bull' },
  'verstappen': { short: 'Verstappen', team: 'Red Bull' },
  'sergio perez': { short: 'Perez', team: 'Red Bull' },
  'perez': { short: 'Perez', team: 'Red Bull' },
  'lewis hamilton': { short: 'Hamilton', team: 'Ferrari' },
  'hamilton': { short: 'Hamilton', team: 'Ferrari' },
  'charles leclerc': { short: 'Leclerc', team: 'Ferrari' },
  'leclerc': { short: 'Leclerc', team: 'Ferrari' },
  'carlos sainz': { short: 'Sainz', team: 'Williams' },
  'sainz': { short: 'Sainz', team: 'Williams' },
  'lando norris': { short: 'Norris', team: 'McLaren' },
  'norris': { short: 'Norris', team: 'McLaren' },
  'oscar piastri': { short: 'Piastri', team: 'McLaren' },
  'piastri': { short: 'Piastri', team: 'McLaren' },
  'george russell': { short: 'Russell', team: 'Mercedes' },
  'russell': { short: 'Russell', team: 'Mercedes' },
  'kimi antonelli': { short: 'Antonelli', team: 'Mercedes' },
  'antonelli': { short: 'Antonelli', team: 'Mercedes' },
  'fernando alonso': { short: 'Alonso', team: 'Aston Martin' },
  'alonso': { short: 'Alonso', team: 'Aston Martin' },
  'lance stroll': { short: 'Stroll', team: 'Aston Martin' },
  'stroll': { short: 'Stroll', team: 'Aston Martin' },
};

// =============================================================================
// MOTOGP RIDERS
// =============================================================================

export const MOTOGP_RIDERS: Record<string, { short: string; team: string }> = {
  'jorge martin': { short: 'Martin', team: 'Aprilia' },
  'martin': { short: 'Martin', team: 'Aprilia' },
  'francesco bagnaia': { short: 'Bagnaia', team: 'Ducati' },
  'bagnaia': { short: 'Bagnaia', team: 'Ducati' },
  'pecco bagnaia': { short: 'Bagnaia', team: 'Ducati' },
  'marc marquez': { short: 'Marquez', team: 'Ducati' },
  'marquez': { short: 'Marquez', team: 'Ducati' },
  'enea bastianini': { short: 'Bastianini', team: 'KTM' },
  'bastianini': { short: 'Bastianini', team: 'KTM' },
  'pedro acosta': { short: 'Acosta', team: 'KTM' },
  'acosta': { short: 'Acosta', team: 'KTM' },
  'maverick vinales': { short: 'Vinales', team: 'KTM' },
  'vinales': { short: 'Vinales', team: 'KTM' },
  'fabio quartararo': { short: 'Quartararo', team: 'Yamaha' },
  'quartararo': { short: 'Quartararo', team: 'Yamaha' },
  'alex rins': { short: 'Rins', team: 'Yamaha' },
  'rins': { short: 'Rins', team: 'Yamaha' },
};

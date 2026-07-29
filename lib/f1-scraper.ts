import { fetchRaceResultsJson } from './race-results-source';
import { RaceResult, RaceResultsResponse } from './sport-results-types';

const JOLPICA_LATEST_F1_RESULTS_URL = 'https://api.jolpi.ca/ergast/f1/current/last/results.json';

interface JolpicaF1Result {
  position?: string;
  points?: string;
  status?: string;
  Driver?: {
    driverId?: string;
    givenName?: string;
    familyName?: string;
  };
  Constructor?: { name?: string };
  Time?: { time?: string };
  FastestLap?: { rank?: string };
}

interface JolpicaF1Race {
  season?: string;
  round?: string;
  raceName?: string;
  date?: string;
  Circuit?: { circuitName?: string };
  Results?: JolpicaF1Result[];
}

interface JolpicaF1Response {
  MRData?: {
    RaceTable?: { Races?: JolpicaF1Race[] };
  };
}

function requiredText(value: string | undefined, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Jolpica F1 payload missing ${field}`);
  return normalized;
}

function parsePosition(value: string | undefined): number {
  const position = Number(value);
  return Number.isInteger(position) ? position : 0;
}

/** Convert Jolpica's latest completed race to the historical FacilAbo contract. */
export function parseJolpicaF1Results(
  payload: JolpicaF1Response,
  lastUpdated = new Date().toISOString(),
): RaceResultsResponse {
  const race = payload.MRData?.RaceTable?.Races?.[0];
  if (!race) throw new Error('Jolpica F1 payload contains no completed race');

  const season = requiredText(race.season, 'season');
  const round = requiredText(race.round, 'round');
  const results = (race.Results ?? [])
    .filter((result) => {
      const position = parsePosition(result.position);
      return position >= 1 && position <= 3;
    })
    .sort((lhs, rhs) => parsePosition(lhs.position) - parsePosition(rhs.position));

  if (results.length !== 3) {
    throw new Error(`Jolpica F1 payload contains ${results.length}/3 podium positions`);
  }

  const podium: RaceResult[] = results.map((result) => {
    const position = parsePosition(result.position);
    const driverId = requiredText(result.Driver?.driverId, `driver id at position ${position}`);
    const familyName = requiredText(result.Driver?.familyName, `driver name at position ${position}`);
    const givenName = result.Driver?.givenName?.trim();
    const points = Number(result.points ?? 0);

    return {
      id: `f1_${season}_${round}_${position}_${driverId}`,
      position,
      driver: givenName ? `${givenName} ${familyName}` : familyName,
      team: requiredText(result.Constructor?.name, `constructor at position ${position}`),
      time: result.Time?.time?.trim() || result.status?.trim() || '',
      points: Number.isFinite(points) ? points : 0,
      fastestLap: result.FastestLap?.rank === '1',
    };
  });

  return {
    competition: 'Formula 1',
    raceName: requiredText(race.raceName, 'race name'),
    circuit: requiredText(race.Circuit?.circuitName, 'circuit name'),
    date: requiredText(race.date, 'race date'),
    podium,
    lastUpdated,
    source: 'api.jolpi.ca',
  };
}

export async function scrapeF1Results(): Promise<RaceResultsResponse> {
  const payload = await fetchRaceResultsJson<JolpicaF1Response>(
    JOLPICA_LATEST_F1_RESULTS_URL,
    'jolpica-f1',
  );
  return parseJolpicaF1Results(payload);
}

import { fetchRaceResultsJson } from './race-results-source';
import { RaceResult, RaceResultsResponse } from './sport-results-types';

const MOTOGP_API_BASE = 'https://api.motogp.pulselive.com/motogp/v1/results';

export interface MotoGPSeason {
  id?: string;
  year?: number;
  current?: boolean;
}

export interface MotoGPEvent {
  id?: string;
  name?: string;
  sponsored_name?: string;
  date_end?: string;
  test?: boolean;
  status?: string;
  circuit?: { name?: string };
}

export interface MotoGPCategory {
  id?: string;
  name?: string;
  legacy_id?: number;
}

export interface MotoGPSession {
  id?: string;
  date?: string;
  type?: string;
  status?: string;
  circuit?: string;
  event?: MotoGPEvent;
}

interface MotoGPClassificationEntry {
  id?: string;
  position?: number | null;
  rider?: { id?: string; full_name?: string };
  team?: { name?: string };
  constructor?: { name?: string };
  gap?: { first?: string };
  time?: string;
  points?: number;
}

export interface MotoGPClassificationResponse {
  classification?: MotoGPClassificationEntry[];
}

function requiredText(value: string | undefined, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`MotoGP payload missing ${field}`);
  return normalized;
}

function buildUrl(path: string, query: Record<string, string>): string {
  return `${MOTOGP_API_BASE}/${path}?${new URLSearchParams(query).toString()}`;
}

export function selectLatestMotoGPEvent(events: MotoGPEvent[], now = new Date()): MotoGPEvent | null {
  const today = now.toISOString().slice(0, 10);
  return events
    .filter((event) => (
      event.test !== true &&
      event.status === 'FINISHED' &&
      typeof event.date_end === 'string' &&
      event.date_end <= today
    ))
    .sort((lhs, rhs) => (rhs.date_end ?? '').localeCompare(lhs.date_end ?? ''))[0] ?? null;
}

export function selectMotoGPCategory(categories: MotoGPCategory[]): MotoGPCategory | null {
  return categories.find((category) => category.legacy_id === 3) ??
    categories.find((category) => category.name?.toLowerCase().startsWith('motogp')) ??
    null;
}

export function selectLatestMotoGPRaceSession(
  sessions: MotoGPSession[],
  now = new Date(),
): MotoGPSession | null {
  const nowTime = now.getTime();
  return sessions
    .filter((session) => {
      const sessionTime = session.date ? new Date(session.date).getTime() : Number.NaN;
      return session.type === 'RAC' &&
        session.status === 'FINISHED' &&
        Number.isFinite(sessionTime) &&
        sessionTime <= nowTime;
    })
    .sort((lhs, rhs) => new Date(rhs.date ?? 0).getTime() - new Date(lhs.date ?? 0).getTime())[0] ?? null;
}

export function parseMotoGPClassification(
  session: MotoGPSession,
  payload: MotoGPClassificationResponse,
  lastUpdated = new Date().toISOString(),
): RaceResultsResponse {
  const sessionId = requiredText(session.id, 'race session id');
  const event = session.event;
  const podiumEntries = (payload.classification ?? [])
    .filter((entry) => typeof entry.position === 'number' && entry.position >= 1 && entry.position <= 3)
    .sort((lhs, rhs) => (lhs.position ?? 0) - (rhs.position ?? 0));

  if (podiumEntries.length !== 3) {
    throw new Error(`MotoGP classification contains ${podiumEntries.length}/3 podium positions`);
  }

  const podium: RaceResult[] = podiumEntries.map((entry) => {
    const position = entry.position as number;
    const riderId = requiredText(entry.rider?.id ?? entry.id, `rider id at position ${position}`);
    const gap = entry.gap?.first?.trim();
    return {
      id: `motogp_${sessionId}_${position}_${riderId}`,
      position,
      driver: requiredText(entry.rider?.full_name, `rider name at position ${position}`),
      team: requiredText(entry.team?.name ?? entry.constructor?.name, `team at position ${position}`),
      time: position === 1
        ? entry.time?.trim() || ''
        : gap && gap !== '0.000' ? `+${gap}s` : entry.time?.trim() || '',
      points: Number.isFinite(entry.points) ? entry.points as number : 0,
    };
  });

  const eventName = event?.name?.trim() || event?.sponsored_name?.trim();
  const sessionDate = requiredText(session.date, 'race date');
  return {
    competition: 'MotoGP',
    raceName: requiredText(eventName, 'race name'),
    circuit: requiredText(session.circuit ?? event?.circuit?.name, 'circuit name'),
    date: sessionDate.slice(0, 10),
    podium,
    lastUpdated,
    source: 'motogp.com',
  };
}

async function findLatestFinishedEvent(now: Date): Promise<MotoGPEvent> {
  const seasons = await fetchRaceResultsJson<MotoGPSeason[]>(
    `${MOTOGP_API_BASE}/seasons`,
    'motogp-seasons',
  );
  if (!Array.isArray(seasons)) throw new Error('MotoGP seasons payload is not an array');

  const seasonCandidates = [...seasons]
    .filter((season) => season.id && Number.isInteger(season.year))
    .sort((lhs, rhs) => {
      if (lhs.current !== rhs.current) return lhs.current ? -1 : 1;
      return (rhs.year ?? 0) - (lhs.year ?? 0);
    })
    .slice(0, 2);

  for (const season of seasonCandidates) {
    const events = await fetchRaceResultsJson<MotoGPEvent[]>(
      buildUrl('events', { seasonUuid: season.id as string, isFinished: 'true' }),
      `motogp-events-${season.year}`,
    );
    const latestEvent = Array.isArray(events) ? selectLatestMotoGPEvent(events, now) : null;
    if (latestEvent) return latestEvent;
  }
  throw new Error('MotoGP API contains no finished Grand Prix in the current or previous season');
}

export async function scrapeMotoGPResults(): Promise<RaceResultsResponse> {
  const now = new Date();
  const event = await findLatestFinishedEvent(now);
  const eventId = requiredText(event.id, 'event id');

  const categories = await fetchRaceResultsJson<MotoGPCategory[]>(
    buildUrl('categories', { eventUuid: eventId }),
    'motogp-categories',
  );
  const category = Array.isArray(categories) ? selectMotoGPCategory(categories) : null;
  const categoryId = requiredText(category?.id, 'MotoGP category id');

  const sessions = await fetchRaceResultsJson<MotoGPSession[]>(
    buildUrl('sessions', { eventUuid: eventId, categoryUuid: categoryId }),
    'motogp-sessions',
  );
  const raceSession = Array.isArray(sessions) ? selectLatestMotoGPRaceSession(sessions, now) : null;
  if (!raceSession) throw new Error('MotoGP API contains no finished main race for the latest event');

  const sessionId = requiredText(raceSession.id, 'race session id');
  const classification = await fetchRaceResultsJson<MotoGPClassificationResponse>(
    buildUrl(`session/${encodeURIComponent(sessionId)}/classification`, { test: 'false' }),
    'motogp-classification',
  );
  return parseMotoGPClassification(raceSession, classification);
}

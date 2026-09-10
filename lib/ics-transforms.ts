/**
 * ICS transforms shared by proxy and metadata endpoints.
 */

const RACE_ONLY_F1_SLUG = 'f1-races-only';
const F1_FULL_SLUG = 'f1';
const EUROPEAN_FOOTBALL_SLUG_PREFIX = 'football-europe-';

interface SchoolHolidayCorrection {
  uidSuffix: string;
  dtstart: string;
  oldDtend: string;
  correctedDtend: string;
  summary: string;
}

interface SupplementalSchoolHoliday {
  uid: string;
  dtstart: string;
  dtend?: string;
  summary: string;
  description: string;
  sourceUrl: string;
}

const SCHOOL_HOLIDAY_CORRECTIONS: Record<string, SchoolHolidayCorrection[]> = {
  'vacances-guadeloupe': [{
    uidSuffix: '-Guadeloupe@data.education.gouv.fr',
    dtstart: '20261219',
    oldDtend: '20260104',
    correctedDtend: '20270104',
    summary: 'Vacances de Noël',
  }],
  'vacances-saint-pierre-et-miquelon': [{
    uidSuffix: '-SaintPierreEtMiquelon@data.education.gouv.fr',
    dtstart: '20261218',
    oldDtend: '20260104',
    correctedDtend: '20270104',
    summary: 'Vacances de Noël',
  }],
};

const MAYOTTE_SOURCE_URL =
  'https://www.ac-mayotte.fr/sites/ac_mayotte/files/2025-12/calendrier-scolaire-2026-2027---mayotte-24459.pdf';
const NEW_CALEDONIA_SOURCE_URL =
  'https://www.ac-noumea.nc/spip.php?rubrique64=&sm=smenu11';

const SUPPLEMENTAL_SCHOOL_HOLIDAYS: Record<string, SupplementalSchoolHoliday[]> = {
  'vacances-mayotte': [
    {
      uid: 'vacances-mayotte-2026-2027-toussaint@facilabo.app',
      dtstart: '20261010',
      dtend: '20261026',
      summary: 'Vacances de la Toussaint',
      description: 'Calendrier scolaire officiel de Mayotte 2026-2027.',
      sourceUrl: MAYOTTE_SOURCE_URL,
    },
    {
      uid: 'vacances-mayotte-2026-2027-noel@facilabo.app',
      dtstart: '20261212',
      dtend: '20270111',
      summary: 'Vacances de Noël',
      description: 'Calendrier scolaire officiel de Mayotte 2026-2027.',
      sourceUrl: MAYOTTE_SOURCE_URL,
    },
    {
      uid: 'vacances-mayotte-2026-2027-carnaval@facilabo.app',
      dtstart: '20270220',
      dtend: '20270308',
      summary: 'Vacances de Carnaval',
      description: 'Calendrier scolaire officiel de Mayotte 2026-2027.',
      sourceUrl: MAYOTTE_SOURCE_URL,
    },
    {
      // Official end of classes: 1 May; classes resume: 17 May.
      // DTEND is exclusive for an all-day holiday interval.
      uid: 'vacances-mayotte-2026-2027-paques@facilabo.app',
      dtstart: '20270501',
      dtend: '20270517',
      summary: 'Vacances de Pâques',
      description: 'Calendrier scolaire officiel de Mayotte 2026-2027.',
      sourceUrl: MAYOTTE_SOURCE_URL,
    },
    {
      uid: 'vacances-mayotte-2026-2027-ete@facilabo.app',
      dtstart: '20270710',
      summary: "Début des vacances d'été",
      description: "Dernier jour de classe officiel à Mayotte; aucune date de fin n'est publiée.",
      sourceUrl: MAYOTTE_SOURCE_URL,
    },
  ],
  'vacances-nouvelle-caledonie': [
    {
      uid: 'vacances-nouvelle-caledonie-2027-prerentree@facilabo.app',
      dtstart: '20270212',
      dtend: '20270215',
      summary: 'Pré-rentrée des enseignants',
      description: 'Calendrier scolaire officiel de Nouvelle-Calédonie 2027.',
      sourceUrl: NEW_CALEDONIA_SOURCE_URL,
    },
    {
      uid: 'vacances-nouvelle-caledonie-2027-periode-1@facilabo.app',
      dtstart: '20270403',
      dtend: '20270419',
      summary: 'Vacances de la 1re période',
      description: 'Calendrier scolaire officiel de Nouvelle-Calédonie 2027.',
      sourceUrl: NEW_CALEDONIA_SOURCE_URL,
    },
    {
      uid: 'vacances-nouvelle-caledonie-2027-periode-2@facilabo.app',
      dtstart: '20270605',
      dtend: '20270621',
      summary: 'Vacances de la 2e période',
      description: 'Calendrier scolaire officiel de Nouvelle-Calédonie 2027.',
      sourceUrl: NEW_CALEDONIA_SOURCE_URL,
    },
    {
      uid: 'vacances-nouvelle-caledonie-2027-periode-3@facilabo.app',
      dtstart: '20270807',
      dtend: '20270823',
      summary: 'Vacances de la 3e période',
      description: 'Calendrier scolaire officiel de Nouvelle-Calédonie 2027.',
      sourceUrl: NEW_CALEDONIA_SOURCE_URL,
    },
    {
      uid: 'vacances-nouvelle-caledonie-2027-periode-4@facilabo.app',
      dtstart: '20271009',
      dtend: '20271025',
      summary: 'Vacances de la 4e période',
      description: 'Calendrier scolaire officiel de Nouvelle-Calédonie 2027.',
      sourceUrl: NEW_CALEDONIA_SOURCE_URL,
    },
    {
      uid: 'vacances-nouvelle-caledonie-2027-ete@facilabo.app',
      dtstart: '20271218',
      summary: "Début des vacances d'été",
      description: "Date officielle de début; aucune date de fin n'est publiée.",
      sourceUrl: NEW_CALEDONIA_SOURCE_URL,
    },
    {
      uid: 'vacances-nouvelle-caledonie-2028-prerentree@facilabo.app',
      dtstart: '20280211',
      dtend: '20280214',
      summary: 'Pré-rentrée des enseignants',
      description: 'Calendrier scolaire officiel de Nouvelle-Calédonie 2028.',
      sourceUrl: NEW_CALEDONIA_SOURCE_URL,
    },
    {
      uid: 'vacances-nouvelle-caledonie-2028-periode-1@facilabo.app',
      dtstart: '20280408',
      dtend: '20280424',
      summary: 'Vacances de la 1re période',
      description: 'Calendrier scolaire officiel de Nouvelle-Calédonie 2028.',
      sourceUrl: NEW_CALEDONIA_SOURCE_URL,
    },
    {
      uid: 'vacances-nouvelle-caledonie-2028-periode-2@facilabo.app',
      dtstart: '20280610',
      dtend: '20280626',
      summary: 'Vacances de la 2e période',
      description: 'Calendrier scolaire officiel de Nouvelle-Calédonie 2028.',
      sourceUrl: NEW_CALEDONIA_SOURCE_URL,
    },
    {
      uid: 'vacances-nouvelle-caledonie-2028-periode-3@facilabo.app',
      dtstart: '20280812',
      dtend: '20280828',
      summary: 'Vacances de la 3e période',
      description: 'Calendrier scolaire officiel de Nouvelle-Calédonie 2028.',
      sourceUrl: NEW_CALEDONIA_SOURCE_URL,
    },
    {
      uid: 'vacances-nouvelle-caledonie-2028-periode-4@facilabo.app',
      dtstart: '20281014',
      dtend: '20281030',
      summary: 'Vacances de la 4e période',
      description: 'Calendrier scolaire officiel de Nouvelle-Calédonie 2028.',
      sourceUrl: NEW_CALEDONIA_SOURCE_URL,
    },
    {
      uid: 'vacances-nouvelle-caledonie-2028-ete@facilabo.app',
      dtstart: '20281216',
      summary: "Début des vacances d'été",
      description: "Date officielle de début; aucune date de fin n'est publiée.",
      sourceUrl: NEW_CALEDONIA_SOURCE_URL,
    },
  ],
};

const NON_RACE_SESSION_PATTERN =
  /\b(sprint|qualif(?:ying|ication)?|practice|essai(?:s| libre| libres)?|fp1|fp2|fp3|shootout|testing|test session)\b/i;

function extractSummary(eventBlock: string): string {
  const unfolded = eventBlock.replace(/\r?\n[ \t]/g, '');
  const match = unfolded.match(/(?:^|\r?\n)SUMMARY[^:]*:(.+?)(?:\r?\n|$)/i);
  return (match?.[1] ?? '').trim();
}

function extractPropertyValue(
  eventBlock: string,
  propertyName: 'UID' | 'DTSTART' | 'DTEND' | 'URL'
): string {
  const unfolded = eventBlock.replace(/\r?\n[ \t]/g, '');
  const match = unfolded.match(
    new RegExp(`(?:^|\\r?\\n)${propertyName}[^:]*:(.+?)(?:\\r?\\n|$)`, 'i')
  );
  return (match?.[1] ?? '').trim();
}

function normalizeSummary(summary: string): string {
  return summary.replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeFootballFixtureSummary(summary: string): string {
  return normalizeSummary(summary).replace(/\s*\(\d+\s*-\s*\d+\)\s*$/, '');
}

function extractComparableTimestamp(eventBlock: string, propertyName: 'LAST-MODIFIED' | 'CREATED' | 'DTSTAMP'): number {
  const unfolded = eventBlock.replace(/\r?\n[ \t]/g, '');
  const match = unfolded.match(
    new RegExp(`(?:^|\\r?\\n)${propertyName}:(.+?)(?:\\r?\\n|$)`, 'i')
  );
  const rawValue = (match?.[1] ?? '').trim();
  if (!rawValue) {
    return Number.NEGATIVE_INFINITY;
  }

  const normalizedValue = rawValue.endsWith('Z') ? rawValue : `${rawValue}Z`;
  const isoValue = normalizedValue.replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
    '$1-$2-$3T$4:$5:$6Z'
  );
  const timestamp = Date.parse(isoValue);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

function hasResolvedScore(summary: string): boolean {
  return /\(\d+\s*-\s*\d+\)\s*$/.test(summary);
}

function isF1RaceEvent(eventBlock: string): boolean {
  const summary = extractSummary(eventBlock).toLowerCase();
  if (!summary) return false;

  if (NON_RACE_SESSION_PATTERN.test(summary)) {
    return false;
  }

  const hasRaceToken = /\brace\b/i.test(summary);
  const looksLikeGrandPrix = /\b(grand prix|gp)\b/i.test(summary);

  return hasRaceToken || looksLikeGrandPrix;
}

function filterEvents(
  icsContent: string,
  shouldKeep: (eventBlock: string) => boolean
): string {
  const eventRegex = /BEGIN:VEVENT[\s\S]*?END:VEVENT\r?\n?/g;
  const matches: Array<{ start: number; end: number; block: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = eventRegex.exec(icsContent)) !== null) {
    matches.push({
      start: match.index,
      end: eventRegex.lastIndex,
      block: match[0]
    });
  }

  if (matches.length === 0) {
    return icsContent;
  }

  const header = icsContent.slice(0, matches[0].start);
  const footer = icsContent.slice(matches[matches.length - 1].end);
  const keptEvents = matches
    .map((item) => item.block)
    .filter((block) => shouldKeep(block))
    .join('');

  return `${header}${keptEvents}${footer}`;
}

function dedupeEvents(
  icsContent: string,
  getEventKey: (eventBlock: string) => string | undefined,
  isPreferredCandidate?: (candidate: string, current: string) => boolean
): string {
  const eventRegex = /BEGIN:VEVENT[\s\S]*?END:VEVENT\r?\n?/g;
  const matches: Array<{ start: number; end: number; block: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = eventRegex.exec(icsContent)) !== null) {
    matches.push({
      start: match.index,
      end: eventRegex.lastIndex,
      block: match[0]
    });
  }

  if (matches.length === 0) {
    return icsContent;
  }

  const header = icsContent.slice(0, matches[0].start);
  const footer = icsContent.slice(matches[matches.length - 1].end);
  const keptEventsByKey = new Map<
    string,
    { block: string; order: number }
  >();
  const passthroughEvents: Array<{ block: string; order: number }> = [];

  matches.forEach((item, index) => {
    const eventKey = getEventKey(item.block);
    if (!eventKey) {
      passthroughEvents.push({ block: item.block, order: index });
      return;
    }

    const existing = keptEventsByKey.get(eventKey);
    if (!existing) {
      keptEventsByKey.set(eventKey, { block: item.block, order: index });
      return;
    }

    if (isPreferredCandidate?.(item.block, existing.block) == true) {
      keptEventsByKey.set(eventKey, {
        block: item.block,
        order: existing.order
      });
    }
  });

  const keptEvents = [
    ...passthroughEvents,
    ...Array.from(keptEventsByKey.values())
  ]
    .sort((lhs, rhs) => lhs.order - rhs.order)
    .map((item) => item.block)
    .join('');

  return `${header}${keptEvents}${footer}`;
}

function dedupeEuropeanFootballEvents(icsContent: string): string {
  return dedupeEvents(icsContent, (eventBlock) => {
    const dtstart = extractPropertyValue(eventBlock, 'DTSTART');
    const dtend = extractPropertyValue(eventBlock, 'DTEND');
    const summary = normalizeFootballFixtureSummary(extractSummary(eventBlock));

    if (!dtstart || !summary) {
      return undefined;
    }

    return `${dtstart}__${dtend}__${summary}`;
  }, (candidate, current) => {
    const candidateSummary = extractSummary(candidate);
    const currentSummary = extractSummary(current);

    const candidateHasScore = hasResolvedScore(candidateSummary);
    const currentHasScore = hasResolvedScore(currentSummary);
    if (candidateHasScore != currentHasScore) {
      return candidateHasScore;
    }

    const candidateTimestamp = Math.max(
      extractComparableTimestamp(candidate, 'LAST-MODIFIED'),
      extractComparableTimestamp(candidate, 'CREATED'),
      extractComparableTimestamp(candidate, 'DTSTAMP')
    );
    const currentTimestamp = Math.max(
      extractComparableTimestamp(current, 'LAST-MODIFIED'),
      extractComparableTimestamp(current, 'CREATED'),
      extractComparableTimestamp(current, 'DTSTAMP')
    );

    return candidateTimestamp > currentTimestamp;
  });
}

function dedupeF1ScheduleUpdateEvents(icsContent: string): string {
  return dedupeEvents(icsContent, (eventBlock) => {
    const dtstart = extractPropertyValue(eventBlock, 'DTSTART');
    const summary = normalizeSummary(extractSummary(eventBlock));
    const sourceUrl = extractPropertyValue(eventBlock, 'URL');
    const eventDate = dtstart.slice(0, 8);

    if (!eventDate || !summary || !sourceUrl) {
      return undefined;
    }

    return `${eventDate}__${summary}__${sourceUrl}`;
  }, (candidate, current) => {
    const candidateStart = extractPropertyValue(candidate, 'DTSTART');
    const currentStart = extractPropertyValue(current, 'DTSTART');

    if (!candidateStart || !currentStart) {
      return false;
    }

    // F1 can publish an advanced start while the old slot is still present
    // in the upstream ICS. Keep the earliest slot for same-day duplicate
    // session keys so the visible next event matches the latest safety move.
    return candidateStart < currentStart;
  });
}

// Etalab's single-day holidays currently repeat DTSTART in DTEND. RFC 5545
// requires an exclusive end for VALUE=DATE; keep all other upstream fields.
function correctEtalabHolidayEnds(slug: string, icsContent: string): string {
  if (![
    'feries-alsace-moselle', 'feries-guadeloupe', 'feries-guyane',
    'feries-la-reunion', 'feries-martinique', 'feries-mayotte',
  ].includes(slug) || !/(?:^|\r?\n)PRODID:-\/\/DINUM\/\/Jours fériés Métropole\/\/FR(?:\r?\n|$)/.test(icsContent)) {
    return icsContent;
  }

  return icsContent.replace(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g, (eventBlock) => {
    const start = eventBlock.match(/(?:^|\r?\n)DTSTART;VALUE=DATE:(\d{8})(?=\r?\n|$)/)?.[1];
    const end = eventBlock.match(/(?:^|\r?\n)DTEND;VALUE=DATE:(\d{8})(?=\r?\n|$)/)?.[1];
    if (!start || end !== start) return eventBlock;

    const date = new Date(`${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10).replace(/-/g, '') !== start) {
      return eventBlock;
    }
    date.setUTCDate(date.getUTCDate() + 1);
    const exclusiveEnd = date.toISOString().slice(0, 10).replace(/-/g, '');
    return eventBlock.replace(`DTEND;VALUE=DATE:${end}`, `DTEND;VALUE=DATE:${exclusiveEnd}`);
  });
}

function correctKnownSchoolHolidayIntervals(slug: string, icsContent: string): string {
  const corrections = SCHOOL_HOLIDAY_CORRECTIONS[slug];
  if (!corrections) return icsContent;

  return icsContent.replace(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g, (eventBlock) => {
    const uid = extractPropertyValue(eventBlock, 'UID');
    const correction = corrections.find((candidate) =>
      uid.endsWith(candidate.uidSuffix) &&
      extractPropertyValue(eventBlock, 'DTSTART') === candidate.dtstart &&
      extractPropertyValue(eventBlock, 'DTEND') === candidate.oldDtend &&
      extractSummary(eventBlock) === candidate.summary
    );

    if (!correction) return eventBlock;

    return eventBlock.replace(
      /(^|\r?\n)(DTEND[^:]*:)\d{8}(?=\r?\n|$)/i,
      `$1$2${correction.correctedDtend}`
    );
  });
}

function appendMissingSchoolHolidays(slug: string, icsContent: string): string {
  const supplements = SUPPLEMENTAL_SCHOOL_HOLIDAYS[slug];
  if (!supplements) return icsContent;

  const calendarEndIndex = icsContent.lastIndexOf('END:VCALENDAR');
  if (calendarEndIndex < 0) return icsContent;

  const existingUids = new Set(
    Array.from(icsContent.matchAll(/(?:^|\r?\n)UID:(.+?)(?:\r?\n|$)/gi))
      .map((match) => match[1].trim())
  );
  const missing = supplements.filter((event) => !existingUids.has(event.uid));
  if (missing.length === 0) return icsContent;

  const newline = icsContent.includes('\r\n') ? '\r\n' : '\n';
  const blocks = missing.map((event) => [
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    'DTSTAMP:20260829T000000Z',
    `DTSTART;VALUE=DATE:${event.dtstart}`,
    ...(event.dtend ? [`DTEND;VALUE=DATE:${event.dtend}`] : []),
    `SUMMARY:${event.summary}`,
    `DESCRIPTION:${event.description}`,
    `URL:${event.sourceUrl}`,
    'CATEGORIES:Vacances scolaires',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    '',
  ].join(newline)).join('');

  const beforeEnd = icsContent.slice(0, calendarEndIndex);
  const separator = beforeEnd.endsWith(newline) ? '' : newline;
  return `${beforeEnd}${separator}${blocks}${icsContent.slice(calendarEndIndex)}`;
}

export function applyCalendarTransform(slug: string, icsContent: string): string {
  let transformedContent = icsContent;

  if (slug === F1_FULL_SLUG || slug === RACE_ONLY_F1_SLUG) {
    transformedContent = dedupeF1ScheduleUpdateEvents(transformedContent);
  }

  if (slug === RACE_ONLY_F1_SLUG) {
    transformedContent = filterEvents(transformedContent, isF1RaceEvent);
  }

  if (slug.startsWith(EUROPEAN_FOOTBALL_SLUG_PREFIX)) {
    transformedContent = dedupeEuropeanFootballEvents(transformedContent);
  }

  transformedContent = correctEtalabHolidayEnds(slug, transformedContent);
  transformedContent = correctKnownSchoolHolidayIntervals(slug, transformedContent);
  transformedContent = appendMissingSchoolHolidays(slug, transformedContent);

  return transformedContent;
}

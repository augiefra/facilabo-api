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

interface SupplementalHoliday {
  uid: string;
  dtstart: string;
  dtend?: string;
  summary: string;
  description: string;
  sourceUrl: string;
}

// Official territorial holidays missing from the Etalab feeds, verified 2026-09-11.
// Keep the explicit evidence horizon; do not extrapolate future editions.
const SUPPLEMENTAL_PUBLIC_HOLIDAYS: Record<string, SupplementalHoliday[]> = {
  "feries-nouvelle-caledonie": [
    {
      uid: "feries-nouvelle-caledonie-20260924@facilabo.app",
      dtstart: "20260924",
      dtend: "20260925",
      summary: "Fête de la Nouvelle-Calédonie",
      description: "Jour férié local selon la source officielle territoriale.",
      sourceUrl: "https://data.gouv.nc/api/explore/v2.1/catalog/datasets/jours-feries-en-nc/records?limit=100",
    },
    {
      uid: "feries-nouvelle-caledonie-20270924@facilabo.app",
      dtstart: "20270924",
      dtend: "20270925",
      summary: "Fête de la Nouvelle-Calédonie",
      description: "Jour férié local selon la source officielle territoriale.",
      sourceUrl: "https://data.gouv.nc/api/explore/v2.1/catalog/datasets/jours-feries-en-nc/records?limit=100",
    },
    {
      uid: "feries-nouvelle-caledonie-20280924@facilabo.app",
      dtstart: "20280924",
      dtend: "20280925",
      summary: "Fête de la Nouvelle-Calédonie",
      description: "Jour férié local selon la source officielle territoriale.",
      sourceUrl: "https://data.gouv.nc/api/explore/v2.1/catalog/datasets/jours-feries-en-nc/records?limit=100",
    },
    {
      uid: "feries-nouvelle-caledonie-20290924@facilabo.app",
      dtstart: "20290924",
      dtend: "20290925",
      summary: "Fête de la Nouvelle-Calédonie",
      description: "Jour férié local selon la source officielle territoriale.",
      sourceUrl: "https://data.gouv.nc/api/explore/v2.1/catalog/datasets/jours-feries-en-nc/records?limit=100",
    },
    {
      uid: "feries-nouvelle-caledonie-20300924@facilabo.app",
      dtstart: "20300924",
      dtend: "20300925",
      summary: "Fête de la Nouvelle-Calédonie",
      description: "Jour férié local selon la source officielle territoriale.",
      sourceUrl: "https://data.gouv.nc/api/explore/v2.1/catalog/datasets/jours-feries-en-nc/records?limit=100",
    },
  ],
  "feries-polynesie-francaise": [
    {
      uid: "feries-polynesie-francaise-20270305@facilabo.app",
      dtstart: "20270305",
      dtend: "20270306",
      summary: "Arrivée de l’Évangile",
      description: "Jour férié local selon la source officielle territoriale.",
      sourceUrl: "https://www.service-public.pf/trav/glossaire-des-fiches-pratiques/",
    },
    {
      uid: "feries-polynesie-francaise-20270326@facilabo.app",
      dtstart: "20270326",
      dtend: "20270327",
      summary: "Vendredi Saint",
      description: "Jour férié local selon la source officielle territoriale.",
      sourceUrl: "https://www.service-public.pf/trav/glossaire-des-fiches-pratiques/",
    },
    {
      uid: "feries-polynesie-francaise-20270629@facilabo.app",
      dtstart: "20270629",
      dtend: "20270630",
      summary: "Fête de l’Autonomie interne",
      description: "Jour férié local selon la source officielle territoriale.",
      sourceUrl: "https://www.service-public.pf/trav/glossaire-des-fiches-pratiques/",
    },
    {
      uid: "feries-polynesie-francaise-20280305@facilabo.app",
      dtstart: "20280305",
      dtend: "20280306",
      summary: "Arrivée de l’Évangile",
      description: "Jour férié local selon la source officielle territoriale.",
      sourceUrl: "https://www.service-public.pf/trav/glossaire-des-fiches-pratiques/",
    },
    {
      uid: "feries-polynesie-francaise-20280414@facilabo.app",
      dtstart: "20280414",
      dtend: "20280415",
      summary: "Vendredi Saint",
      description: "Jour férié local selon la source officielle territoriale.",
      sourceUrl: "https://www.service-public.pf/trav/glossaire-des-fiches-pratiques/",
    },
    {
      uid: "feries-polynesie-francaise-20280629@facilabo.app",
      dtstart: "20280629",
      dtend: "20280630",
      summary: "Fête de l’Autonomie interne",
      description: "Jour férié local selon la source officielle territoriale.",
      sourceUrl: "https://www.service-public.pf/trav/glossaire-des-fiches-pratiques/",
    },
    {
      uid: "feries-polynesie-francaise-20290305@facilabo.app",
      dtstart: "20290305",
      dtend: "20290306",
      summary: "Arrivée de l’Évangile",
      description: "Jour férié local selon la source officielle territoriale.",
      sourceUrl: "https://www.service-public.pf/trav/glossaire-des-fiches-pratiques/",
    },
    {
      uid: "feries-polynesie-francaise-20290330@facilabo.app",
      dtstart: "20290330",
      dtend: "20290331",
      summary: "Vendredi Saint",
      description: "Jour férié local selon la source officielle territoriale.",
      sourceUrl: "https://www.service-public.pf/trav/glossaire-des-fiches-pratiques/",
    },
    {
      uid: "feries-polynesie-francaise-20290629@facilabo.app",
      dtstart: "20290629",
      dtend: "20290630",
      summary: "Fête de l’Autonomie interne",
      description: "Jour férié local selon la source officielle territoriale.",
      sourceUrl: "https://www.service-public.pf/trav/glossaire-des-fiches-pratiques/",
    },
    {
      uid: "feries-polynesie-francaise-20300305@facilabo.app",
      dtstart: "20300305",
      dtend: "20300306",
      summary: "Arrivée de l’Évangile",
      description: "Jour férié local selon la source officielle territoriale.",
      sourceUrl: "https://www.service-public.pf/trav/glossaire-des-fiches-pratiques/",
    },
    {
      uid: "feries-polynesie-francaise-20300419@facilabo.app",
      dtstart: "20300419",
      dtend: "20300420",
      summary: "Vendredi Saint",
      description: "Jour férié local selon la source officielle territoriale.",
      sourceUrl: "https://www.service-public.pf/trav/glossaire-des-fiches-pratiques/",
    },
    {
      uid: "feries-polynesie-francaise-20300629@facilabo.app",
      dtstart: "20300629",
      dtend: "20300630",
      summary: "Fête de l’Autonomie interne",
      description: "Jour férié local selon la source officielle territoriale.",
      sourceUrl: "https://www.service-public.pf/trav/glossaire-des-fiches-pratiques/",
    },
    {
      uid: "feries-polynesie-francaise-20310305@facilabo.app",
      dtstart: "20310305",
      dtend: "20310306",
      summary: "Arrivée de l’Évangile",
      description: "Jour férié local selon la source officielle territoriale.",
      sourceUrl: "https://www.service-public.pf/trav/glossaire-des-fiches-pratiques/",
    },
    {
      uid: "feries-polynesie-francaise-20310411@facilabo.app",
      dtstart: "20310411",
      dtend: "20310412",
      summary: "Vendredi Saint",
      description: "Jour férié local selon la source officielle territoriale.",
      sourceUrl: "https://www.service-public.pf/trav/glossaire-des-fiches-pratiques/",
    },
    {
      uid: "feries-polynesie-francaise-20310629@facilabo.app",
      dtstart: "20310629",
      dtend: "20310630",
      summary: "Fête de l’Autonomie interne",
      description: "Jour férié local selon la source officielle territoriale.",
      sourceUrl: "https://www.service-public.pf/trav/glossaire-des-fiches-pratiques/",
    },
  ],
};

const SCHOOL_HOLIDAY_CORRECTIONS: Record<string, SchoolHolidayCorrection[]> = {
  'vacances-guadeloupe': [
    {
      uidSuffix: '-Guadeloupe@data.education.gouv.fr',
      dtstart: '20261219',
      oldDtend: '20260104',
      correctedDtend: '20270104',
      summary: 'Vacances de Noël',
    },
    {
      // The Opendatasoft ICS export merges the October 2026 and May 2027
      // occurrences of "Abolition de l'esclavage" into a single 231-day block
      // (20261009 -> 20270528). The official data.education.gouv.fr dataset
      // keeps two separate single days: 9 and 10 October 2026.
      uidSuffix: '-Guadeloupe@data.education.gouv.fr',
      dtstart: '20261009',
      oldDtend: '20270528',
      correctedDtend: '20261010',
      summary: 'Abolition de l?esclavage',
    },
    {
      // Same merged-export defect for the Saint-Barthélemy pre-rentrée day.
      uidSuffix: '-Guadeloupe@data.education.gouv.fr',
      dtstart: '20261010',
      oldDtend: '20270529',
      correctedDtend: '20261011',
      summary: 'Abolition de l?esclavage(prérentrée Saint-Barthélémy)',
    },
  ],
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

const SUPPLEMENTAL_SCHOOL_HOLIDAYS: Record<string, SupplementalHoliday[]> = {
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
    'feries-metropole', 'feries-nouvelle-caledonie', 'feries-polynesie-francaise',
    'feries-saint-barthelemy', 'feries-saint-martin',
    'feries-saint-pierre-et-miquelon', 'feries-wallis-et-futuna',
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

function appendMissingHolidays(slug: string, icsContent: string): string {
  const publicHolidays = SUPPLEMENTAL_PUBLIC_HOLIDAYS[slug];
  if (publicHolidays && !icsContent.includes('PRODID:-//DINUM//Jours fériés Métropole//FR')) {
    return icsContent;
  }
  const supplements = publicHolidays ?? SUPPLEMENTAL_SCHOOL_HOLIDAYS[slug];
  if (!supplements) return icsContent;

  const calendarEndIndex = icsContent.lastIndexOf('END:VCALENDAR');
  if (calendarEndIndex < 0) return icsContent;

  const existingUids = new Set(
    Array.from(icsContent.matchAll(/(?:^|\r?\n)UID:(.+?)(?:\r?\n|$)/gi))
      .map((match) => match[1].trim())
  );
  // If Etalab supplies the local day later, keep its existing UID and avoid
  // adding a second holiday for that same date. School holiday rules stay unchanged.
  const existingDates = new Set(Array.from(
    icsContent.matchAll(/(?:^|\r?\n)DTSTART;VALUE=DATE:(\d{8})(?=\r?\n|$)/g),
    (match) => match[1]
  ));
  const missing = supplements.filter((event) => !existingUids.has(event.uid) &&
    (!publicHolidays || !existingDates.has(event.dtstart)));
  if (missing.length === 0) return icsContent;

  const newline = icsContent.includes('\r\n') ? '\r\n' : '\n';
  const blocks = missing.map((event) => [
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    publicHolidays ? 'DTSTAMP:20260911T000000Z' : 'DTSTAMP:20260829T000000Z',
    `DTSTART;VALUE=DATE:${event.dtstart}`,
    ...(event.dtend ? [`DTEND;VALUE=DATE:${event.dtend}`] : []),
    `SUMMARY:${event.summary}`,
    `DESCRIPTION:${event.description}`,
    `URL:${event.sourceUrl}`,
    publicHolidays ? 'CATEGORIES:Jours fériés' : 'CATEGORIES:Vacances scolaires',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    '',
  ].join(newline)).join('');

  const beforeEnd = icsContent.slice(0, calendarEndIndex);
  const separator = beforeEnd.endsWith(newline) ? '' : newline;
  return `${beforeEnd}${separator}${blocks}${icsContent.slice(calendarEndIndex)}`;
}

const TIMESTAMPED_EDUCATION_UID = /^\d{8}T\d{6}Z-/;

// Upstream Opendatasoft territory suffixes for the school-holiday exports.
// The stabilization only rewrites the UID of the calendar it belongs to.
const OPENDATASOFT_TERRITORY_UID_SUFFIXES: Record<string, string> = {
  'vacances-zone-a': '-Zone-A@data.education.gouv.fr',
  'vacances-zone-b': '-Zone-B@data.education.gouv.fr',
  'vacances-zone-c': '-Zone-C@data.education.gouv.fr',
  'vacances-corse': '-Corse@data.education.gouv.fr',
  'vacances-guadeloupe': '-Guadeloupe@data.education.gouv.fr',
  'vacances-guyane': '-Guyane@data.education.gouv.fr',
  'vacances-martinique': '-Martinique@data.education.gouv.fr',
  'vacances-mayotte': '-Mayotte@data.education.gouv.fr',
  'vacances-la-reunion': '-Reunion@data.education.gouv.fr',
  'vacances-polynesie': '-Polynesie@data.education.gouv.fr',
  'vacances-nouvelle-caledonie': '-NouvelleCaledonie@data.education.gouv.fr',
  'vacances-saint-pierre-et-miquelon': '-SaintPierreEtMiquelon@data.education.gouv.fr',
  'vacances-wallis-et-futuna': '-WallisEtFutuna@data.education.gouv.fr',
};

function slugifyEducationUidPart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// The Opendatasoft school-holiday exports rebuild every UID around the export
// timestamp, so each upstream regeneration published a brand new identity for
// the same holiday and subscribers collected duplicates. Deriving a stable UID
// from the slug, the start day and the label keeps identities across exports.
function stabilizeOpenDataSchoolHolidayUids(slug: string, icsContent: string): string {
  const territorySuffix = OPENDATASOFT_TERRITORY_UID_SUFFIXES[slug];
  if (!territorySuffix) return icsContent;

  return icsContent.replace(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g, (eventBlock) => {
    const uid = extractPropertyValue(eventBlock, 'UID');
    if (!uid || !TIMESTAMPED_EDUCATION_UID.test(uid) || !uid.endsWith(territorySuffix)) return eventBlock;

    const dtstart = extractPropertyValue(eventBlock, 'DTSTART');
    const summary = extractSummary(eventBlock);
    if (!dtstart || !summary) return eventBlock;

    const stableUid = `${slug}-${dtstart}-${slugifyEducationUidPart(summary)}@facilabo.app`;
    return eventBlock.replace(/(^|\r?\n)UID:[^\r\n]*/, `$1UID:${stableUid}`);
  });
}

// Some upstream school calendars publish marker days ("Début des Vacances
// d'Été", "Pont de l'Ascension") with DTEND equal to DTSTART, which renders as
// a zero-length all-day event. Those markers must cover their own day.
function normalizeZeroLengthAllDayEvents(slug: string, icsContent: string): string {
  // Etalab holiday feeds are already normalized by correctEtalabHolidayEnds;
  // only the school-holiday exports still publish zero-length marker days.
  if (!slug.startsWith('vacances-')) return icsContent;

  return icsContent.replace(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g, (eventBlock) => {
    const startMatch = eventBlock.match(/(?:^|\r?\n)DTSTART;VALUE=DATE:(\d{8})(?=\r?\n|$)/);
    const endMatch = eventBlock.match(/(?:^|\r?\n)DTEND;VALUE=DATE:(\d{8})(?=\r?\n|$)/);
    if (!startMatch || !endMatch || startMatch[1] !== endMatch[1]) return eventBlock;

    const year = Number(startMatch[1].slice(0, 4));
    const month = Number(startMatch[1].slice(4, 6));
    const day = Number(startMatch[1].slice(6, 8));
    if (month < 1 || month > 12 || day < 1 || day > 31) return eventBlock;

    const start = new Date(Date.UTC(
      year,
      month - 1,
      day,
    ));
    if (
      start.getUTCFullYear() !== year ||
      start.getUTCMonth() !== month - 1 ||
      start.getUTCDate() !== day
    ) {
      return eventBlock;
    }
    start.setUTCDate(start.getUTCDate() + 1);
    const exclusiveEnd = [
      start.getUTCFullYear(),
      String(start.getUTCMonth() + 1).padStart(2, '0'),
      String(start.getUTCDate()).padStart(2, '0'),
    ].join('');

    return eventBlock.replace(
      /((?:^|\r?\n)DTEND;VALUE=DATE:)\d{8}(?=\r?\n|$)/,
      `$1${exclusiveEnd}`,
    );
  });
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
  transformedContent = appendMissingHolidays(slug, transformedContent);
  transformedContent = normalizeZeroLengthAllDayEvents(slug, transformedContent);
  transformedContent = stabilizeOpenDataSchoolHolidayUids(slug, transformedContent);

  return transformedContent;
}

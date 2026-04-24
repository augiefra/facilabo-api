/**
 * ICS transforms shared by proxy and metadata endpoints.
 */

import { getWorldCup2026MatchNumbers } from './worldcup-2026-routes';

const RACE_ONLY_F1_SLUG = 'f1-races-only';
const F1_FULL_SLUG = 'f1';
const EUROPEAN_FOOTBALL_SLUG_PREFIX = 'football-europe-';
const CANCELLED_F1_GRAND_PRIX_MARKERS = [
  'f1 bahrain gp',
  'f1 saudi arabian gp',
];

const NON_RACE_SESSION_PATTERN =
  /\b(sprint|qualif(?:ying|ication)?|practice|essai(?:s| libre| libres)?|fp1|fp2|fp3|shootout|testing|test session)\b/i;

function extractSummary(eventBlock: string): string {
  const unfolded = eventBlock.replace(/\r?\n[ \t]/g, '');
  const match = unfolded.match(/(?:^|\r?\n)SUMMARY[^:]*:(.+?)(?:\r?\n|$)/i);
  return (match?.[1] ?? '').trim();
}

function extractPropertyValue(eventBlock: string, propertyName: 'DTSTART' | 'DTEND'): string {
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

function isCancelledF1Event(eventBlock: string): boolean {
  const summary = normalizeSummary(extractSummary(eventBlock));
  if (!summary) return false;

  return CANCELLED_F1_GRAND_PRIX_MARKERS.some((marker) => summary.includes(marker));
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

function extractWorldCup2026MatchNumber(eventBlock: string): number | undefined {
  const unfolded = eventBlock.replace(/\r?\n[ \t]/g, '');
  const uidMatch = unfolded.match(/(?:^|\r?\n)UID:worldcup-2026-match-(\d+)@facilabo\.app(?:\r?\n|$)/i);
  const descriptionMatch = unfolded.match(/(?:^|\r?\n)DESCRIPTION[^:]*:Match FIFA (\d+)/i);
  const rawMatchNumber = uidMatch?.[1] ?? descriptionMatch?.[1];
  if (!rawMatchNumber) {
    return undefined;
  }

  const matchNumber = Number.parseInt(rawMatchNumber, 10);
  return Number.isFinite(matchNumber) ? matchNumber : undefined;
}

function filterWorldCup2026Route(icsContent: string, slug: string): string {
  const matchNumbers = getWorldCup2026MatchNumbers(slug);
  if (!matchNumbers) {
    return icsContent;
  }

  return filterEvents(icsContent, (eventBlock) => {
    const matchNumber = extractWorldCup2026MatchNumber(eventBlock);
    return matchNumber !== undefined && matchNumbers.has(matchNumber);
  });
}

export function applyCalendarTransform(slug: string, icsContent: string): string {
  let transformedContent = icsContent;

  if (slug === F1_FULL_SLUG || slug === RACE_ONLY_F1_SLUG) {
    transformedContent = filterEvents(transformedContent, (eventBlock) => !isCancelledF1Event(eventBlock));
  }

  if (slug === RACE_ONLY_F1_SLUG) {
    transformedContent = filterEvents(transformedContent, isF1RaceEvent);
  }

  if (slug.startsWith(EUROPEAN_FOOTBALL_SLUG_PREFIX)) {
    transformedContent = dedupeEuropeanFootballEvents(transformedContent);
  }

  transformedContent = filterWorldCup2026Route(transformedContent, slug);

  return transformedContent;
}

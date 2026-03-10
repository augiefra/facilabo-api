/**
 * ICS transforms shared by proxy and metadata endpoints.
 */

const RACE_ONLY_F1_SLUG = 'f1-races-only';
const EUROPEAN_FOOTBALL_SLUG_PREFIX = 'football-europe-';

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
  getEventKey: (eventBlock: string) => string | undefined
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
  const seenKeys = new Set<string>();
  const keptEvents: string[] = [];

  for (const item of matches) {
    const eventKey = getEventKey(item.block);
    if (!eventKey) {
      keptEvents.push(item.block);
      continue;
    }

    if (seenKeys.has(eventKey)) {
      continue;
    }

    seenKeys.add(eventKey);
    keptEvents.push(item.block);
  }

  return `${header}${keptEvents.join('')}${footer}`;
}

function dedupeEuropeanFootballEvents(icsContent: string): string {
  return dedupeEvents(icsContent, (eventBlock) => {
    const dtstart = extractPropertyValue(eventBlock, 'DTSTART');
    const dtend = extractPropertyValue(eventBlock, 'DTEND');
    const summary = normalizeSummary(extractSummary(eventBlock));

    if (!dtstart || !summary) {
      return undefined;
    }

    return `${dtstart}__${dtend}__${summary}`;
  });
}

export function applyCalendarTransform(slug: string, icsContent: string): string {
  let transformedContent = icsContent;

  if (slug === RACE_ONLY_F1_SLUG) {
    transformedContent = filterEvents(transformedContent, isF1RaceEvent);
  }

  if (slug.startsWith(EUROPEAN_FOOTBALL_SLUG_PREFIX)) {
    transformedContent = dedupeEuropeanFootballEvents(transformedContent);
  }

  return transformedContent;
}

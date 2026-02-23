/**
 * ICS transforms shared by proxy and metadata endpoints.
 */

const RACE_ONLY_F1_SLUG = 'f1-races-only';

const NON_RACE_SESSION_PATTERN =
  /\b(sprint|qualif(?:ying|ication)?|practice|essai(?:s| libre| libres)?|fp1|fp2|fp3|shootout|testing|test session)\b/i;

function extractSummary(eventBlock: string): string {
  const unfolded = eventBlock.replace(/\r?\n[ \t]/g, '');
  const match = unfolded.match(/(?:^|\r?\n)SUMMARY[^:]*:(.+?)(?:\r?\n|$)/i);
  return (match?.[1] ?? '').trim();
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

export function applyCalendarTransform(slug: string, icsContent: string): string {
  if (slug === RACE_ONLY_F1_SLUG) {
    return filterEvents(icsContent, isF1RaceEvent);
  }

  return icsContent;
}

import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Rugby Calendar API - Individual Team Calendars
 *
 * Fetches the full Top 14 calendar from RugbyFixture.io,
 * filters events for a specific team, and returns a team-specific ICS.
 *
 * Usage: GET /api/calendar/rugby/[team]
 * Example: GET /api/calendar/rugby/toulouse
 *
 * Returns: ICS file with only matches for the specified team
 */

// Top 14 source calendar
const TOP14_SOURCE_URL = 'https://data.rugbyfixture.io/ical/v1/top14.ics';

// Team name mappings: iOS slug -> [names that appear in calendar SUMMARY]
const TEAM_MAPPINGS: Record<string, { names: string[]; frenchName: string }> = {
  'toulouse': {
    names: ['Toulouse'],
    frenchName: 'Stade Toulousain'
  },
  'stadefrancais': {
    names: ['Stade Français', 'Stade Francais'],
    frenchName: 'Stade Français Paris'
  },
  'racing92': {
    names: ['Racing Métro', 'Racing Metro', 'Racing 92'],
    frenchName: 'Racing 92'
  },
  'laRochelle': {
    names: ['La Rochelle', 'Stade Rochelais'],
    frenchName: 'Stade Rochelais'
  },
  'bordeaux': {
    names: ['Bordeaux', 'UBB', 'Bordeaux-Bègles'],
    frenchName: 'Union Bordeaux-Bègles'
  },
  'clermont': {
    names: ['Clermont', 'ASM Clermont'],
    frenchName: 'ASM Clermont'
  },
  'toulon': {
    names: ['Toulon', 'RC Toulon', 'RCT'],
    frenchName: 'RC Toulon'
  },
  'lyon': {
    names: ['Lyon', 'LOU', 'LOU Rugby'],
    frenchName: 'LOU Rugby'
  },
  'montpellier': {
    names: ['Montpellier', 'MHR'],
    frenchName: 'Montpellier Hérault Rugby'
  },
  'castres': {
    names: ['Castres', 'CO'],
    frenchName: 'Castres Olympique'
  },
  'pau': {
    names: ['Pau', 'Section Paloise'],
    frenchName: 'Section Paloise'
  },
  'perpignan': {
    names: ['Perpignan', 'USAP'],
    frenchName: 'USAP Perpignan'
  },
  'bayonne': {
    names: ['Bayonne', 'Aviron Bayonnais'],
    frenchName: 'Aviron Bayonnais'
  },
  'montauban': {
    names: ['Montauban', 'US Montauban'],
    frenchName: 'US Montauban'
  },
  // Legacy compatibility slug (kept to avoid breaking existing subscriptions)
  'vannes': {
    names: ['Vannes', 'RC Vannes'],
    frenchName: 'RC Vannes'
  }
};

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTeamMatchers(teamNames: string[]): RegExp[] {
  const aliases = [...new Set(teamNames.map(normalizeForMatch).filter(Boolean))];
  return aliases.map((alias) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(alias)}([^a-z0-9]|$)`, 'i'));
}

/**
 * Parse ICS content and filter events for a specific team
 */
function filterIcsForTeam(icsContent: string, teamNames: string[]): string {
  const teamMatchers = buildTeamMatchers(teamNames);

  // Split into lines
  const lines = icsContent.split(/\r?\n/);

  // Find the header (everything before the first VEVENT)
  const headerEndIndex = lines.findIndex(line => line === 'BEGIN:VEVENT');
  const headerLines = lines.slice(0, headerEndIndex);

  // Find the footer (everything after the last END:VEVENT)
  const footerStartIndex = lines.lastIndexOf('END:VEVENT');
  const footerLines = footerStartIndex >= 0 ? lines.slice(footerStartIndex + 1) : ['END:VCALENDAR'];

  // Extract all VEVENT blocks
  const events: string[][] = [];
  let currentEvent: string[] = [];
  let inEvent = false;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      currentEvent = [line];
    } else if (line === 'END:VEVENT') {
      currentEvent.push(line);
      events.push(currentEvent);
      inEvent = false;
    } else if (inEvent) {
      currentEvent.push(line);
    }
  }

  // Filter events that contain any of the team names in SUMMARY
  const filteredEvents = events.filter(event => {
    const summaryLine = event.find(line => line.startsWith('SUMMARY:'));
    if (!summaryLine) return false;

    const normalizedSummary = normalizeForMatch(summaryLine.substring(8));
    return teamMatchers.some((matcher) => matcher.test(normalizedSummary));
  });

  // Reconstruct the ICS
  const result = [
    ...headerLines,
    ...filteredEvents.flat(),
    ...footerLines
  ];

  return result.join('\r\n');
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { team } = req.query;

  if (!team || typeof team !== 'string') {
    return res.status(400).json({ error: 'Missing team parameter' });
  }

  // Get team mapping
  const teamMapping = TEAM_MAPPINGS[team];

  if (!teamMapping) {
    return res.status(404).json({
      error: 'Team not found',
      availableTeams: Object.keys(TEAM_MAPPINGS)
    });
  }

  const displayName = `${teamMapping.frenchName} (FacilAbo)`;

  try {
    // Fetch the full Top 14 calendar
    const response = await fetch(TOP14_SOURCE_URL, {
      headers: {
        'User-Agent': 'FacilAbo/1.0 (iOS Calendar App)',
        'Accept': 'text/calendar, text/plain, */*'
      }
    });

    if (!response.ok) {
      console.error(`Failed to fetch Top 14 calendar: ${response.status} ${response.statusText}`);
      return res.status(502).json({
        error: 'Failed to fetch calendar from source',
        status: response.status
      });
    }

    let icsContent = await response.text();

    // Filter events for this team
    icsContent = filterIcsForTeam(icsContent, teamMapping.names);

    // Some sources contain blank lines which are not valid in some iCalendar clients.
    // Normalize to CRLF and ensure header props are set (suffix "(FacilAbo)" to distinguish in Apple Calendar).
    const rawLines = icsContent.split(/\r?\n/);
    const filteredLines = rawLines.filter((line) => line.length > 0);

    const upsertHeaderProp = (lines: string[], key: string, value: string) => {
      const headerEnd = lines.findIndex((l) => l.startsWith('BEGIN:VEVENT'));
      const endIndex = headerEnd === -1 ? lines.length : headerEnd;
      const header = lines.slice(0, endIndex);
      const rest = lines.slice(endIndex);

      const prefix = `${key}:`;
      const existingIndex = header.findIndex((l) => l.startsWith(prefix));
      if (existingIndex >= 0) {
        header[existingIndex] = `${prefix}${value}`;
      } else {
        const beginIndex = header.findIndex((l) => l === 'BEGIN:VCALENDAR');
        const insertIndex = beginIndex >= 0 ? beginIndex + 1 : 0;
        header.splice(insertIndex, 0, `${prefix}${value}`);
      }

      return header.concat(rest);
    };

    let lines = filteredLines;
    lines = upsertHeaderProp(lines, 'X-WR-CALNAME', displayName);
    lines = upsertHeaderProp(lines, 'NAME', displayName);
    icsContent = lines.join('\r\n');
    if (!icsContent.endsWith('\r\n')) icsContent += '\r\n';

    // Update PRODID
    if (icsContent.includes('PRODID:')) {
      icsContent = icsContent.replace(
        /PRODID:.*/g,
        'PRODID:-//FacilAbo//Rugby Top 14//FR'
      );
    }

    // Set appropriate headers for ICS file
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${team}.ics"`);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

    return res.status(200).send(icsContent);

  } catch (error) {
    console.error('Rugby calendar error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

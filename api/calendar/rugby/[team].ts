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
    names: ['Lyon', 'LOU'],
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
  'vannes': {
    names: ['Vannes', 'RC Vannes'],
    frenchName: 'RC Vannes'
  }
};

/**
 * Parse ICS content and filter events for a specific team
 */
function filterIcsForTeam(icsContent: string, teamNames: string[]): string {
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

    const summary = summaryLine.substring(8).toLowerCase();
    return teamNames.some(name => summary.includes(name.toLowerCase()));
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

    // Replace or add X-WR-CALNAME with French team name (suffix "(FacilAbo)" to distinguish in Apple Calendar)
    if (icsContent.includes('X-WR-CALNAME:')) {
      icsContent = icsContent.replace(
        /X-WR-CALNAME:.*/g,
        `X-WR-CALNAME:${displayName}`
      );
    } else {
      icsContent = icsContent.replace(
        'BEGIN:VCALENDAR',
        `BEGIN:VCALENDAR\r\nX-WR-CALNAME:${displayName}`
      );
    }

    // Replace or add NAME header (some clients use it as canonical calendar name)
    if (icsContent.includes('\r\nNAME:') || icsContent.startsWith('NAME:')) {
      icsContent = icsContent.replace(
        /(^|\r\n)NAME:.*/g,
        `$1NAME:${displayName}`
      );
    } else {
      icsContent = icsContent.replace(
        /X-WR-CALNAME:.*\r\n/,
        (match) => `${match}NAME:${displayName}\r\n`
      );
    }

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

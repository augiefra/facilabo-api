import { MatchResult, MatchStatus, SportResultsResponse, normalizeTeamName } from './sport-results-types';

const FLASHSCORE_URL = 'https://www.flashscore.fr/football/france/ligue-1/resultats/';

/**
 * Parse Flashscore compressed data format
 * Format uses special delimiters: ÷ (field separator), ¬ (value separator), ~ (record separator)
 */
function parseFlashscoreData(data: string): MatchResult[] {
  const results: MatchResult[] = [];

  // Split by match delimiter (~AA÷)
  const matches = data.split('~AA÷');

  for (const matchData of matches) {
    if (!matchData || matchData.length < 10) continue;

    try {
      // Extract fields using regex patterns
      const fields: Record<string, string> = {};

      // Common field patterns in Flashscore format
      const fieldPatterns = [
        { key: 'matchId', pattern: /AA÷([^¬~]+)/ },
        { key: 'timestamp', pattern: /AD÷(\d+)/ },
        { key: 'homeTeam', pattern: /CX÷([^¬~]+)/ },
        { key: 'awayTeam', pattern: /AF÷([^¬~]+)/ },
        { key: 'homeScore', pattern: /AG÷(\d+)/ },
        { key: 'awayScore', pattern: /AH÷(\d+)/ },
        { key: 'status', pattern: /AB÷(\d+)/ },
        { key: 'round', pattern: /ER÷([^¬~]+)/ },
      ];

      for (const { key, pattern } of fieldPatterns) {
        const match = matchData.match(pattern);
        if (match) {
          fields[key] = match[1];
        }
      }

      // Also try alternate team name patterns
      if (!fields.homeTeam) {
        const homeMatch = matchData.match(/WM÷[^¬]*¬[^¬]*¬AF÷([^¬~]+)/);
        if (homeMatch) fields.homeTeam = homeMatch[1];
      }
      if (!fields.awayTeam) {
        const awayMatch = matchData.match(/WN÷[^¬]*¬[^¬]*¬AF÷([^¬~]+)/);
        if (awayMatch) fields.awayTeam = awayMatch[1];
      }

      // Skip if missing essential data
      if (!fields.homeScore || !fields.awayScore) continue;

      // Parse timestamp to date
      let date = new Date().toISOString().split('T')[0];
      let time = '';
      if (fields.timestamp) {
        const ts = parseInt(fields.timestamp) * 1000;
        const matchDate = new Date(ts);
        date = matchDate.toISOString().split('T')[0];
        time = matchDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      }

      // Determine match status
      let status: MatchStatus = 'finished';
      if (fields.status) {
        const statusCode = parseInt(fields.status);
        // Flashscore status codes: 3 = finished, 2 = live, etc.
        if (statusCode === 3 || statusCode === 100) status = 'finished';
        else if (statusCode === 2) status = 'live';
        else if (statusCode === 1) status = 'scheduled';
      }

      // Get team names (may need cleanup)
      let homeTeam = fields.homeTeam || '';
      let awayTeam = fields.awayTeam || '';

      // Clean up team names
      homeTeam = normalizeTeamName(homeTeam.trim());
      awayTeam = normalizeTeamName(awayTeam.trim());

      if (!homeTeam || !awayTeam) continue;

      // Extract matchday
      let matchday: string | undefined;
      if (fields.round) {
        const roundMatch = fields.round.match(/(\d+)/);
        if (roundMatch) {
          matchday = `Journée ${roundMatch[1]}`;
        }
      }

      results.push({
        id: fields.matchId || `flash_${Date.now()}_${results.length}`,
        homeTeam,
        awayTeam,
        homeScore: parseInt(fields.homeScore),
        awayScore: parseInt(fields.awayScore),
        date,
        time,
        status,
        competition: 'Ligue 1',
        matchday,
      });
    } catch (e) {
      // Skip malformed entries
      continue;
    }
  }

  return results;
}

/**
 * Extract embedded data from Flashscore HTML
 */
function extractFlashscoreData(html: string): string | null {
  // Look for the initialFeeds data
  const patterns = [
    /cjs\.initialFeeds\['results'\]\s*=\s*{[^}]*data:\s*`([^`]+)`/,
    /SA÷1¬~ZA÷[^`]*/,
    /~AA÷[^`]+/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }

  // Try to find any data block with match delimiters
  const dataBlockMatch = html.match(/[SA÷|~AA÷][^<]{100,}/);
  if (dataBlockMatch) {
    return dataBlockMatch[0];
  }

  return null;
}

/**
 * Scrape match results from Flashscore
 */
export async function scrapeSportResults(): Promise<SportResultsResponse> {
  try {
    const response = await fetch(FLASHSCORE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });

    if (!response.ok) {
      throw new Error(`Flashscore fetch failed: ${response.status}`);
    }

    const html = await response.text();

    // Extract the compressed data
    const data = extractFlashscoreData(html);

    if (!data) {
      console.log('No Flashscore data found, returning empty');
      return {
        competition: 'Ligue 1',
        results: [],
        lastUpdated: new Date().toISOString(),
        source: 'flashscore.fr',
      };
    }

    // Parse the results
    const results = parseFlashscoreData(data);

    // Sort by date descending
    results.sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return b.time.localeCompare(a.time);
    });

    // Limit to 30 most recent
    const recentResults = results.slice(0, 30);

    return {
      competition: 'Ligue 1',
      results: recentResults,
      lastUpdated: new Date().toISOString(),
      source: 'flashscore.fr',
    };
  } catch (error) {
    console.error('Flashscore scraping error:', error);
    return {
      competition: 'Ligue 1',
      results: [],
      lastUpdated: new Date().toISOString(),
      source: 'flashscore.fr',
    };
  }
}

/**
 * Filter results by team name
 */
export function filterResultsByTeam(response: SportResultsResponse, teamQuery: string): SportResultsResponse {
  const query = teamQuery.toLowerCase();

  const teamAliases: Record<string, string[]> = {
    'psg': ['paris saint-germain', 'paris', 'psg', 'paris sg'],
    'om': ['olympique de marseille', 'marseille', 'om', 'olympique marseille'],
    'ol': ['olympique lyonnais', 'lyon', 'ol', 'olympique lyon'],
    'monaco': ['as monaco', 'monaco', 'asm'],
    'lille': ['lille', 'losc', 'lille osc'],
    'lens': ['rc lens', 'lens', 'rcl', 'racing lens'],
    'rennes': ['stade rennais', 'rennes', 'srfc'],
    'nice': ['nice', 'ogc nice', 'ogcn'],
    'brest': ['stade brestois', 'brest', 'sb29'],
    'reims': ['stade de reims', 'reims'],
    'toulouse': ['toulouse', 'tfc'],
    'montpellier': ['montpellier', 'mhsc'],
    'strasbourg': ['rc strasbourg', 'strasbourg', 'rcs', 'racing strasbourg'],
    'nantes': ['fc nantes', 'nantes', 'fcn'],
    'auxerre': ['aj auxerre', 'auxerre', 'aja'],
    'le havre': ['le havre', 'hac'],
    'angers': ['angers', 'sco', 'angers sco'],
    'saint-etienne': ['as saint-etienne', 'saint-etienne', 'asse', 'st etienne'],
  };

  let searchTerms = [query];
  for (const [key, aliases] of Object.entries(teamAliases)) {
    if (key === query || aliases.some(a => a.includes(query) || query.includes(a))) {
      searchTerms = [...new Set([...searchTerms, key, ...aliases])];
      break;
    }
  }

  const filteredResults = response.results.filter(result => {
    const home = result.homeTeam.toLowerCase();
    const away = result.awayTeam.toLowerCase();

    return searchTerms.some(term =>
      home.includes(term) || away.includes(term) ||
      term.includes(home) || term.includes(away)
    );
  });

  return {
    ...response,
    results: filteredResults,
  };
}

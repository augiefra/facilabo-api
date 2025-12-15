import { MatchResult, MatchStatus, RugbyResultsResponse, normalizeRugbyTeamName } from './sport-results-types';

const FLASHSCORE_RUGBY_URL = 'https://www.flashscore.fr/rugby/france/top-14/resultats/';

/**
 * Parse Flashscore compressed data format for Rugby
 */
function parseFlashscoreRugbyData(data: string): MatchResult[] {
  const results: MatchResult[] = [];

  // Split by match delimiter (~AA÷)
  const matches = data.split('~AA÷');

  for (const matchData of matches) {
    if (!matchData || matchData.length < 10) continue;

    try {
      const fields: Record<string, string> = {};

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

      // Alternate team name patterns
      if (!fields.homeTeam) {
        const homeMatch = matchData.match(/WM÷[^¬]*¬[^¬]*¬AF÷([^¬~]+)/);
        if (homeMatch) fields.homeTeam = homeMatch[1];
      }
      if (!fields.awayTeam) {
        const awayMatch = matchData.match(/WN÷[^¬]*¬[^¬]*¬AF÷([^¬~]+)/);
        if (awayMatch) fields.awayTeam = awayMatch[1];
      }

      if (!fields.homeScore || !fields.awayScore) continue;

      let date = new Date().toISOString().split('T')[0];
      let time = '';
      if (fields.timestamp) {
        const ts = parseInt(fields.timestamp) * 1000;
        const matchDate = new Date(ts);
        date = matchDate.toISOString().split('T')[0];
        time = matchDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      }

      let status: MatchStatus = 'finished';
      if (fields.status) {
        const statusCode = parseInt(fields.status);
        if (statusCode === 3 || statusCode === 100) status = 'finished';
        else if (statusCode === 2) status = 'live';
        else if (statusCode === 1) status = 'scheduled';
      }

      let homeTeam = normalizeRugbyTeamName(fields.homeTeam || '');
      let awayTeam = normalizeRugbyTeamName(fields.awayTeam || '');

      if (!homeTeam || !awayTeam) continue;

      let matchday: string | undefined;
      if (fields.round) {
        const roundMatch = fields.round.match(/(\d+)/);
        if (roundMatch) {
          matchday = `Journée ${roundMatch[1]}`;
        }
      }

      results.push({
        id: fields.matchId || `rugby_${Date.now()}_${results.length}`,
        homeTeam,
        awayTeam,
        homeScore: parseInt(fields.homeScore),
        awayScore: parseInt(fields.awayScore),
        date,
        time,
        status,
        competition: 'Top 14',
        matchday,
      });
    } catch {
      continue;
    }
  }

  return results;
}

/**
 * Extract embedded data from Flashscore HTML
 */
function extractFlashscoreData(html: string): string | null {
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

  const dataBlockMatch = html.match(/[SA÷|~AA÷][^<]{100,}/);
  if (dataBlockMatch) {
    return dataBlockMatch[0];
  }

  return null;
}

/**
 * Scrape Rugby Top 14 results from Flashscore
 */
export async function scrapeRugbyResults(): Promise<RugbyResultsResponse> {
  try {
    const response = await fetch(FLASHSCORE_RUGBY_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });

    if (!response.ok) {
      throw new Error(`Flashscore Rugby fetch failed: ${response.status}`);
    }

    const html = await response.text();
    const data = extractFlashscoreData(html);

    if (!data) {
      console.log('No Rugby data found, returning empty');
      return {
        competition: 'Top 14',
        results: [],
        lastUpdated: new Date().toISOString(),
        source: 'flashscore.fr',
      };
    }

    const results = parseFlashscoreRugbyData(data);

    // Sort by date descending
    results.sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return b.time.localeCompare(a.time);
    });

    // Limit to 30 most recent
    const recentResults = results.slice(0, 30);

    return {
      competition: 'Top 14',
      results: recentResults,
      lastUpdated: new Date().toISOString(),
      source: 'flashscore.fr',
    };
  } catch (error) {
    console.error('Rugby scraping error:', error);
    return {
      competition: 'Top 14',
      results: [],
      lastUpdated: new Date().toISOString(),
      source: 'flashscore.fr',
    };
  }
}

/**
 * Filter results by team name
 */
export function filterRugbyResultsByTeam(response: RugbyResultsResponse, teamQuery: string): RugbyResultsResponse {
  const query = teamQuery.toLowerCase();

  const teamAliases: Record<string, string[]> = {
    'toulouse': ['stade toulousain', 'toulouse'],
    'ubb': ['union bordeaux-begles', 'bordeaux', 'ubb'],
    'montpellier': ['montpellier herault', 'montpellier', 'mhr'],
    'lyon': ['lou rugby', 'lyon', 'lou'],
    'castres': ['castres olympique', 'castres', 'co'],
    'pau': ['section paloise', 'pau'],
    'la rochelle': ['stade rochelais', 'la rochelle', 'sr'],
    'toulon': ['rc toulon', 'toulon', 'rct'],
    'racing 92': ['racing 92', 'racing', 'r92'],
    'clermont': ['asm clermont', 'clermont', 'asm'],
    'perpignan': ['usap', 'perpignan'],
    'bayonne': ['aviron bayonnais', 'bayonne', 'ab'],
    'stade francais': ['stade francais', 'stade francais paris', 'sfp'],
    'vannes': ['rc vannes', 'vannes', 'rcv'],
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

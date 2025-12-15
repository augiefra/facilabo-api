import { RaceResult, RaceResultsResponse, MOTOGP_RIDERS } from './sport-results-types';

const FLASHSCORE_MOTOGP_URL = 'https://www.flashscore.fr/motogp/';

// MotoGP points for top positions
const MOTOGP_POINTS: Record<number, number> = {
  1: 25, 2: 20, 3: 16, 4: 13, 5: 11, 6: 10, 7: 9, 8: 8, 9: 7, 10: 6,
  11: 5, 12: 4, 13: 3, 14: 2, 15: 1
};

/**
 * Normalize MotoGP rider name
 */
function normalizeRiderName(raw: string): { short: string; team: string } {
  const lower = raw.toLowerCase().trim();
  return MOTOGP_RIDERS[lower] || { short: raw.trim(), team: 'Unknown' };
}

/**
 * Parse Flashscore MotoGP race results
 */
function parseFlashscoreMotoGPData(data: string): { raceName: string; circuit: string; date: string; podium: RaceResult[] } {
  const podium: RaceResult[] = [];
  let raceName = 'Grand Prix';
  let circuit = '';
  let date = new Date().toISOString().split('T')[0];

  // Extract race info from data
  const raceNameMatch = data.match(/WN÷([^¬~]+)/);
  if (raceNameMatch) {
    raceName = raceNameMatch[1];
  }

  // Try to extract event name
  const eventMatch = data.match(/~ZA÷[^~]*÷([^¬~]+)/);
  if (eventMatch) {
    const eventName = eventMatch[1];
    if (eventName.includes('Grand Prix') || eventName.includes('GP')) {
      raceName = eventName;
    }
  }

  // Extract circuit/location
  const circuitMatch = data.match(/AE÷([^¬~]+)/);
  if (circuitMatch) {
    circuit = circuitMatch[1];
  }

  // Split by result delimiter and extract positions
  const results = data.split('~AA÷');

  for (const resultData of results) {
    if (!resultData || resultData.length < 10) continue;

    try {
      const fields: Record<string, string> = {};

      const fieldPatterns = [
        { key: 'position', pattern: /AB÷(\d+)/ },
        { key: 'rider', pattern: /AF÷([^¬~]+)/ },
        { key: 'team', pattern: /AK÷([^¬~]+)/ },
        { key: 'time', pattern: /AG÷([^¬~]+)/ },
        { key: 'timestamp', pattern: /AD÷(\d+)/ },
      ];

      for (const { key, pattern } of fieldPatterns) {
        const match = resultData.match(pattern);
        if (match) {
          fields[key] = match[1];
        }
      }

      // Try alternate rider name pattern
      if (!fields.rider) {
        const riderMatch = resultData.match(/WM÷[^¬]*¬[^¬]*¬AF÷([^¬~]+)/);
        if (riderMatch) fields.rider = riderMatch[1];
      }

      const position = parseInt(fields.position || '0');

      // Only collect top 3 for podium
      if (position < 1 || position > 3) continue;

      const riderInfo = normalizeRiderName(fields.rider || '');
      const time = fields.time || (position === 1 ? '' : '+?.???s');

      // Get date from timestamp
      if (fields.timestamp) {
        const ts = parseInt(fields.timestamp) * 1000;
        const raceDate = new Date(ts);
        date = raceDate.toISOString().split('T')[0];
      }

      podium.push({
        id: `motogp_${position}_${Date.now()}`,
        position,
        driver: riderInfo.short,
        team: fields.team || riderInfo.team,
        time,
        points: MOTOGP_POINTS[position] || 0,
      });
    } catch {
      continue;
    }
  }

  // Sort by position
  podium.sort((a, b) => a.position - b.position);

  return { raceName, circuit, date, podium: podium.slice(0, 3) };
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
 * Scrape MotoGP race results from Flashscore
 */
export async function scrapeMotoGPResults(): Promise<RaceResultsResponse> {
  try {
    const response = await fetch(FLASHSCORE_MOTOGP_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });

    if (!response.ok) {
      throw new Error(`Flashscore MotoGP fetch failed: ${response.status}`);
    }

    const html = await response.text();
    const data = extractFlashscoreData(html);

    if (!data) {
      console.log('No MotoGP data found, returning empty');
      return {
        competition: 'MotoGP',
        raceName: 'Grand Prix',
        circuit: '',
        date: new Date().toISOString().split('T')[0],
        podium: [],
        lastUpdated: new Date().toISOString(),
        source: 'flashscore.fr',
      };
    }

    const { raceName, circuit, date, podium } = parseFlashscoreMotoGPData(data);

    return {
      competition: 'MotoGP',
      raceName,
      circuit,
      date,
      podium,
      lastUpdated: new Date().toISOString(),
      source: 'flashscore.fr',
    };
  } catch (error) {
    console.error('MotoGP scraping error:', error);
    return {
      competition: 'MotoGP',
      raceName: 'Grand Prix',
      circuit: '',
      date: new Date().toISOString().split('T')[0],
      podium: [],
      lastUpdated: new Date().toISOString(),
      source: 'flashscore.fr',
    };
  }
}

import { RaceResult, RaceResultsResponse, F1_DRIVERS } from './sport-results-types';

const FLASHSCORE_F1_URL = 'https://www.flashscore.fr/formule-1/';

// F1 points for top positions
const F1_POINTS: Record<number, number> = {
  1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1
};

/**
 * Normalize F1 driver name
 */
function normalizeDriverName(raw: string): { short: string; team: string } {
  const lower = raw.toLowerCase().trim();
  return F1_DRIVERS[lower] || { short: raw.trim(), team: 'Unknown' };
}

/**
 * Parse Flashscore F1 race results
 */
function parseFlashscoreF1Data(data: string): { raceName: string; circuit: string; date: string; podium: RaceResult[] } {
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
        { key: 'driver', pattern: /AF÷([^¬~]+)/ },
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

      // Try alternate driver name pattern
      if (!fields.driver) {
        const driverMatch = resultData.match(/WM÷[^¬]*¬[^¬]*¬AF÷([^¬~]+)/);
        if (driverMatch) fields.driver = driverMatch[1];
      }

      const position = parseInt(fields.position || '0');

      // Only collect top 3 for podium
      if (position < 1 || position > 3) continue;

      const driverInfo = normalizeDriverName(fields.driver || '');
      const time = fields.time || (position === 1 ? '' : '+?.???s');

      // Get date from timestamp
      if (fields.timestamp) {
        const ts = parseInt(fields.timestamp) * 1000;
        const raceDate = new Date(ts);
        date = raceDate.toISOString().split('T')[0];
      }

      podium.push({
        id: `f1_${position}_${Date.now()}`,
        position,
        driver: driverInfo.short,
        team: fields.team || driverInfo.team,
        time,
        points: F1_POINTS[position] || 0,
        fastestLap: false,
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
 * Scrape F1 race results from Flashscore
 */
export async function scrapeF1Results(): Promise<RaceResultsResponse> {
  try {
    const response = await fetch(FLASHSCORE_F1_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });

    if (!response.ok) {
      throw new Error(`Flashscore F1 fetch failed: ${response.status}`);
    }

    const html = await response.text();
    const data = extractFlashscoreData(html);

    if (!data) {
      console.log('No F1 data found, returning empty');
      return {
        competition: 'Formula 1',
        raceName: 'Grand Prix',
        circuit: '',
        date: new Date().toISOString().split('T')[0],
        podium: [],
        lastUpdated: new Date().toISOString(),
        source: 'flashscore.fr',
      };
    }

    const { raceName, circuit, date, podium } = parseFlashscoreF1Data(data);

    return {
      competition: 'Formula 1',
      raceName,
      circuit,
      date,
      podium,
      lastUpdated: new Date().toISOString(),
      source: 'flashscore.fr',
    };
  } catch (error) {
    console.error('F1 scraping error:', error);
    return {
      competition: 'Formula 1',
      raceName: 'Grand Prix',
      circuit: '',
      date: new Date().toISOString().split('T')[0],
      podium: [],
      lastUpdated: new Date().toISOString(),
      source: 'flashscore.fr',
    };
  }
}

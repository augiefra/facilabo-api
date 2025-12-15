import type { VercelRequest, VercelResponse } from '@vercel/node';
import { scrapeF1Results } from '../lib/f1-scraper';
import { getRaceCached, setRaceCache } from '../lib/sport-results-types';

const CACHE_KEY = 'f1-results';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS headers for iOS app
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Only GET requests are supported',
    });
  }

  try {
    // Check cache first (30 minutes TTL for race results)
    let results = getRaceCached(CACHE_KEY);

    if (!results) {
      console.log('Cache miss, scraping flashscore.fr/formule-1...');
      results = await scrapeF1Results();
      setRaceCache(CACHE_KEY, results);
      console.log(`Scraped F1 race: ${results.raceName}, podium: ${results.podium.length} drivers`);
    } else {
      console.log('Cache hit');
    }

    return res.status(200).json(results);

  } catch (error) {
    console.error('F1 results scraping error:', error);

    // Try to return cached data even if expired
    const cachedData = getRaceCached(CACHE_KEY);
    if (cachedData) {
      console.log('Returning stale cache due to error');
      return res.status(200).json({
        ...cachedData,
        lastUpdated: cachedData.lastUpdated + ' (cached)',
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to fetch F1 results',
    });
  }
}

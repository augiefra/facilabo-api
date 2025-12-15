import type { VercelRequest, VercelResponse } from '@vercel/node';
import { scrapeMotoGPResults } from '../lib/motogp-scraper';
import { getRaceCached, setRaceCache } from '../lib/sport-results-types';

const CACHE_KEY = 'motogp-results';

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
      console.log('Cache miss, scraping flashscore.fr/motogp...');
      results = await scrapeMotoGPResults();
      setRaceCache(CACHE_KEY, results);
      console.log(`Scraped MotoGP race: ${results.raceName}, podium: ${results.podium.length} riders`);
    } else {
      console.log('Cache hit');
    }

    return res.status(200).json(results);

  } catch (error) {
    console.error('MotoGP results scraping error:', error);

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
      message: error instanceof Error ? error.message : 'Failed to fetch MotoGP results',
    });
  }
}

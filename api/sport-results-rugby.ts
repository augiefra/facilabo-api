import type { VercelRequest, VercelResponse } from '@vercel/node';
import { scrapeRugbyResults, filterRugbyResultsByTeam } from '../lib/rugby-scraper';
import { getRugbyCached, setRugbyCache } from '../lib/sport-results-types';

const CACHE_KEY = 'top14-results';

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
    // Check cache first
    let results = getRugbyCached(CACHE_KEY);

    if (!results) {
      console.log('Cache miss, scraping flashscore.fr/rugby/top-14...');
      results = await scrapeRugbyResults();
      setRugbyCache(CACHE_KEY, results);
      console.log(`Scraped ${results.results.length} rugby match results`);
    } else {
      console.log('Cache hit');
    }

    // Filter by team if query param provided
    const { team } = req.query;
    if (team && typeof team === 'string') {
      results = filterRugbyResultsByTeam(results, team);
    }

    return res.status(200).json(results);

  } catch (error) {
    console.error('Rugby results scraping error:', error);

    // Try to return cached data even if expired
    const cachedData = getRugbyCached(CACHE_KEY);
    if (cachedData) {
      console.log('Returning stale cache due to error');
      return res.status(200).json({
        ...cachedData,
        lastUpdated: cachedData.lastUpdated + ' (cached)',
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to fetch rugby results',
    });
  }
}

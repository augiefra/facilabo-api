/**
 * FacilAbo API v1 - Sport Results
 *
 * Unified endpoint for sport results across multiple sports.
 * Replaces: sport-results.ts, sport-results-rugby.ts, sport-results-f1.ts, sport-results-motogp.ts
 *
 * @endpoint GET /api/v1/sports/results/[sport]
 * @param sport - "football", "rugby", "f1", "motogp"
 * @query team - Optional team filter (football/rugby only)
 *
 * @fragility HIGH - Web scraping, formats can change
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { scrapeSportResults, filterResultsByTeam } from '../../../../lib/sport-results-scraper';
import { scrapeRugbyResults, filterRugbyResultsByTeam } from '../../../../lib/rugby-scraper';
import { scrapeF1Results } from '../../../../lib/f1-scraper';
import { scrapeMotoGPResults } from '../../../../lib/motogp-scraper';
import { getResultsCached, setResultsCache } from '../../../../lib/sport-results-types';

type SportType = 'football' | 'rugby' | 'f1' | 'motogp';

interface SportConfig {
  cacheKey: string;
  scraper: () => Promise<any>;
  filter?: (results: any, team: string) => any;
  source: string;
}

const SPORT_CONFIG: Record<SportType, SportConfig> = {
  football: {
    cacheKey: 'v1:results:football',
    scraper: scrapeSportResults,
    filter: filterResultsByTeam,
    source: 'footmercato.net',
  },
  rugby: {
    cacheKey: 'v1:results:rugby',
    scraper: scrapeRugbyResults,
    filter: filterRugbyResultsByTeam,
    source: 'flashscore.fr',
  },
  f1: {
    cacheKey: 'v1:results:f1',
    scraper: scrapeF1Results,
    source: 'flashscore.fr',
  },
  motogp: {
    cacheKey: 'v1:results:motogp',
    scraper: scrapeMotoGPResults,
    source: 'flashscore.fr',
  },
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS headers
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

  const { sport, team } = req.query;

  if (!sport || typeof sport !== 'string') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Missing sport parameter',
      availableSports: ['football', 'rugby', 'f1', 'motogp'],
    });
  }

  const sportLower = sport.toLowerCase() as SportType;

  if (!SPORT_CONFIG[sportLower]) {
    return res.status(404).json({
      error: 'Not Found',
      message: `Unknown sport: ${sport}`,
      availableSports: ['football', 'rugby', 'f1', 'motogp'],
    });
  }

  const config = SPORT_CONFIG[sportLower];

  try {
    // Check cache first
    let results = getResultsCached(config.cacheKey);

    if (!results) {
      console.log(`Cache miss, scraping ${sportLower} results...`);
      results = await config.scraper();
      setResultsCache(config.cacheKey, results);
      console.log(`Scraped ${sportLower} results`);
    } else {
      console.log(`Cache hit for ${sportLower}`);
    }

    // Filter by team if applicable
    if (team && typeof team === 'string' && config.filter) {
      results = config.filter(results, team);
    }

    // Return iOS-compatible format
    return res.status(200).json(results);

  } catch (error) {
    console.error(`${sportLower} results scraping error:`, error);

    // Try to return cached data even if expired
    const cachedData = getResultsCached(config.cacheKey);
    if (cachedData) {
      console.log('Returning stale cache due to error');
      return res.status(200).json({
        ...cachedData,
        lastUpdated: cachedData.lastUpdated + ' (cached)',
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : `Failed to fetch ${sportLower} results`,
    });
  }
}

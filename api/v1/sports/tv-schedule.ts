/**
 * FacilAbo API v1 - TV Schedule
 *
 * Scrapes Ligue 1 TV schedule from footmercato.net
 * with caching and fallback support.
 *
 * @endpoint GET /api/v1/sports/tv-schedule
 * @query team - Optional team filter (e.g., "psg", "om")
 *
 * @source footmercato.net
 * @fragility HIGH - Web scraping, format can change
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { scrapeTVSchedule, filterByTeam } from '../../../lib/scraper';
import { getCached, setCache } from '../../../lib/types';

const CACHE_KEY = 'v1:tv-schedule:ligue1';

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

  try {
    // Check cache first
    let schedule = getCached(CACHE_KEY);

    if (!schedule) {
      console.log('Cache miss, scraping footmercato.net...');
      schedule = await scrapeTVSchedule();
      setCache(CACHE_KEY, schedule);
      console.log(`Scraped ${schedule.matches.length} matches`);
    } else {
      console.log('Cache hit');
    }

    // Filter by team if query param provided
    const { team } = req.query;
    if (team && typeof team === 'string') {
      schedule = filterByTeam(schedule, team);
    }

    // Return iOS-compatible format
    return res.status(200).json(schedule);

  } catch (error) {
    console.error('Scraping error:', error);

    // Try to return cached data even if expired
    const cachedData = getCached(CACHE_KEY);
    if (cachedData) {
      console.log('Returning stale cache due to error');
      return res.status(200).json({
        ...cachedData,
        lastUpdated: cachedData.lastUpdated + ' (cached)',
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to fetch TV schedule',
    });
  }
}

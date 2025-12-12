import type { VercelRequest, VercelResponse } from '@vercel/node';
import { scrapeTVSchedule, filterByTeam } from '../lib/scraper';
import { getCached, setCache, TVScheduleResponse, ErrorResponse } from '../lib/types';

const CACHE_KEY = 'ligue1-schedule';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse<TVScheduleResponse | ErrorResponse>
) {
  // Only allow GET requests
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
      // Scrape fresh data
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

    // Return response
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

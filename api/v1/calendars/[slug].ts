/**
 * FacilAbo API v1 - Calendar Proxy
 *
 * Fetches ICS calendar from source, renames X-WR-CALNAME to French,
 * and returns the modified calendar.
 *
 * @endpoint GET /api/v1/calendars/[slug]
 * @example GET /api/v1/calendars/f1
 * @example GET /api/v1/calendars/psg
 *
 * @source calendar-mappings.ts
 * @returns ICS file with French calendar name
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getMapping, getAllMappings } from '../../../lib/calendar-mappings';
import { fetchWithRetry, createRetryLogger, RETRY_CONFIGS } from '../../../lib/retry-utils';

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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug } = req.query;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Missing calendar slug' });
  }

  // Handle "list" endpoint
  if (slug === 'list') {
    return res.status(200).json({
      calendars: Object.entries(getAllMappings()).map(([key, mapping]) => ({
        slug: key,
        name: mapping.frenchName,
        description: mapping.description,
      })),
    });
  }

  const mapping = getMapping(slug);

  if (!mapping) {
    return res.status(404).json({
      error: 'Calendar not found',
      availableSlugs: 'Use /api/v1/calendars/list for full list'
    });
  }

  const retryLogger = createRetryLogger(`calendar:${slug}`);

  try {
    const response = await fetchWithRetry(
      mapping.sourceUrl,
      {
        headers: {
          'User-Agent': 'FacilAbo/1.0 (iOS Calendar App)',
          'Accept': 'text/calendar, text/plain, */*',
        },
      },
      {
        ...RETRY_CONFIGS.calendar,
        onRetry: retryLogger,
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch calendar: ${response.status}`);
      return res.status(502).json({
        error: 'Failed to fetch calendar from source',
        status: response.status
      });
    }

    let icsContent = await response.text();

    // Replace or add X-WR-CALNAME with French name
    if (icsContent.includes('X-WR-CALNAME:')) {
      icsContent = icsContent.replace(
        /X-WR-CALNAME:.*/g,
        `X-WR-CALNAME:${mapping.frenchName}`
      );
    } else {
      icsContent = icsContent.replace(
        'BEGIN:VCALENDAR',
        `BEGIN:VCALENDAR\r\nX-WR-CALNAME:${mapping.frenchName}`
      );
    }

    // Update PRODID
    if (icsContent.includes('PRODID:')) {
      icsContent = icsContent.replace(
        /PRODID:.*/g,
        'PRODID:-//FacilAbo//Calendar Proxy v1//FR'
      );
    }

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.ics"`);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');

    return res.status(200).send(icsContent);

  } catch (error) {
    console.error('Calendar proxy error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

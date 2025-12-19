import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getMapping } from '../../lib/calendar-mappings';

/**
 * Calendar Proxy API
 *
 * Fetches ICS calendar from source, renames X-WR-CALNAME to French,
 * and returns the modified calendar.
 *
 * Usage: GET /api/calendar/[slug]
 * Example: GET /api/calendar/f1-complet
 *
 * Returns: ICS file with French calendar name
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug } = req.query;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Missing calendar slug' });
  }

  // Get the mapping for this slug
  const mapping = getMapping(slug);

  if (!mapping) {
    return res.status(404).json({
      error: 'Calendar not found',
      availableSlugs: 'Use /api/calendar/list to see available calendars'
    });
  }

  try {
    // Fetch the original ICS file
    const response = await fetch(mapping.sourceUrl, {
      headers: {
        'User-Agent': 'FacilAbo/1.0 (iOS Calendar App)',
        'Accept': 'text/calendar, text/plain, */*'
      }
    });

    if (!response.ok) {
      console.error(`Failed to fetch calendar: ${response.status} ${response.statusText}`);
      return res.status(502).json({
        error: 'Failed to fetch calendar from source',
        status: response.status
      });
    }

    let icsContent = await response.text();

    // Replace or add X-WR-CALNAME with French name
    if (icsContent.includes('X-WR-CALNAME:')) {
      // Replace existing calendar name
      icsContent = icsContent.replace(
        /X-WR-CALNAME:.*/g,
        `X-WR-CALNAME:${mapping.frenchName}`
      );
    } else {
      // Add calendar name after VCALENDAR begin
      icsContent = icsContent.replace(
        'BEGIN:VCALENDAR',
        `BEGIN:VCALENDAR\r\nX-WR-CALNAME:${mapping.frenchName}`
      );
    }

    // Also update PRODID to indicate FacilAbo
    if (icsContent.includes('PRODID:')) {
      icsContent = icsContent.replace(
        /PRODID:.*/g,
        'PRODID:-//FacilAbo//Calendar Proxy//FR'
      );
    }

    // Set appropriate headers for ICS file
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.ics"`);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

    return res.status(200).send(icsContent);

  } catch (error) {
    console.error('Calendar proxy error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

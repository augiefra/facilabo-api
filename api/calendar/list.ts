import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAllMappings, CalendarMapping, FOOTBALL_TEAMS, RUGBY_TEAMS, F1_CALENDARS, MOTOGP_CALENDARS, NASCAR_CALENDARS, NBA_CALENDARS } from '../../lib/calendar-mappings';

/**
 * List all available calendars
 *
 * Usage: GET /api/calendar/list
 *
 * Returns: JSON list of all available calendar slugs and their French names
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const mappings = getAllMappings();

  const calendars = Object.entries(mappings).map(([slug, mapping]: [string, CalendarMapping]) => ({
    slug,
    name: mapping.frenchName,
    description: mapping.description || null,
    url: `https://facilabo-api.vercel.app/api/calendar/${slug}`
  }));

  // Group by category using the imported constants
  const footballSlugs = Object.keys(FOOTBALL_TEAMS);
  const rugbySlugs = Object.keys(RUGBY_TEAMS);
  const f1Slugs = Object.keys(F1_CALENDARS);
  const motogpSlugs = Object.keys(MOTOGP_CALENDARS);
  const nascarSlugs = Object.keys(NASCAR_CALENDARS);
  const nbaSlugs = Object.keys(NBA_CALENDARS);

  const grouped = {
    motorsport: calendars.filter(c => [...f1Slugs, ...motogpSlugs, ...nascarSlugs].includes(c.slug)),
    basketball: calendars.filter(c => nbaSlugs.includes(c.slug)),
    football: calendars.filter(c => footballSlugs.includes(c.slug)),
    rugby: calendars.filter(c => rugbySlugs.includes(c.slug))
  };

  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');

  return res.status(200).json({
    count: calendars.length,
    calendars: grouped,
    usage: {
      webcal: 'webcal://facilabo-api.vercel.app/api/calendar/{slug}',
      https: 'https://facilabo-api.vercel.app/api/calendar/{slug}'
    }
  });
}

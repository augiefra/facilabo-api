import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  generateLunarCalendar,
  PLANT_TYPE_INFO,
  ZODIAC_FRENCH,
  type LunarDay,
} from '../../../lib/lunar-data';

/**
 * Lunar Gardening Calendar API
 *
 * Generates an ICS calendar with daily gardening recommendations based on:
 * - Moon zodiac position (determines plant type: racine/feuille/fleur/fruit)
 * - Moon direction (montante/descendante)
 * - Special days to avoid gardening (apogee, perigee, lunar nodes)
 * - Moon phases (nouvelle lune, pleine lune, etc.)
 *
 * Usage: GET /api/calendar/jardin/lunaire
 * Query params:
 *   - year: Year to generate (default: current year)
 *
 * Returns: ICS file with daily gardening events
 */

const MOON_PHASE_EMOJI: Record<string, string> = {
  'nouvelle_lune': '🌑',
  'premier_quartier': '🌓',
  'pleine_lune': '🌕',
  'dernier_quartier': '🌗',
};

const MOON_PHASE_FRENCH: Record<string, string> = {
  'nouvelle_lune': 'Nouvelle Lune',
  'premier_quartier': 'Premier Quartier',
  'pleine_lune': 'Pleine Lune',
  'dernier_quartier': 'Dernier Quartier',
};

const SPECIAL_DAY_INFO: Record<string, { emoji: string; name: string; description: string }> = {
  'apogee': {
    emoji: '⚠️',
    name: 'Apogée lunaire',
    description: 'La Lune est au plus loin de la Terre. Évitez de jardiner aujourd\'hui.'
  },
  'perigee': {
    emoji: '⚠️',
    name: 'Périgée lunaire',
    description: 'La Lune est au plus près de la Terre. Évitez de jardiner aujourd\'hui.'
  },
  'noeud_ascendant': {
    emoji: '⚠️',
    name: 'Nœud lunaire ascendant',
    description: 'Perturbation énergétique. Évitez les travaux de jardinage.'
  },
  'noeud_descendant': {
    emoji: '⚠️',
    name: 'Nœud lunaire descendant',
    description: 'Perturbation énergétique. Évitez les travaux de jardinage.'
  },
};

function formatDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

function generateUID(dateStr: string): string {
  return `lunaire-${dateStr}@facilabo.app`;
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function buildEventSummary(day: LunarDay): string {
  // If it's a special day, show warning first
  if (day.specialDay) {
    const special = SPECIAL_DAY_INFO[day.specialDay];
    return `${special.emoji} ${special.name} - Ne jardinez pas`;
  }

  const plantInfo = PLANT_TYPE_INFO[day.plantType];
  const directionEmoji = day.moonDirection === 'montante' ? '↗️' : '↘️';
  const phaseEmoji = day.moonPhase ? ` ${MOON_PHASE_EMOJI[day.moonPhase]}` : '';

  return `${plantInfo.emoji} ${plantInfo.name}${phaseEmoji} ${directionEmoji}`;
}

function buildEventDescription(day: LunarDay): string {
  const parts: string[] = [];

  // Special day warning
  if (day.specialDay) {
    const special = SPECIAL_DAY_INFO[day.specialDay];
    parts.push(special.description);
    parts.push('');
  }

  // Plant type recommendation
  const plantInfo = PLANT_TYPE_INFO[day.plantType];
  parts.push(plantInfo.description);
  parts.push('');

  // Moon direction
  const directionText = day.moonDirection === 'montante'
    ? 'Lune montante : la sève monte vers les parties aériennes. Bon pour semer, greffer, récolter fruits et feuilles.'
    : 'Lune descendante : la sève descend vers les racines. Bon pour planter, repiquer, tailler, travailler le sol.';
  parts.push(directionText);
  parts.push('');

  // Zodiac sign
  const zodiacFrench = ZODIAC_FRENCH[day.zodiacSign] || day.zodiacSign;
  parts.push(`Lune en ${zodiacFrench}`);

  // Moon phase if present
  if (day.moonPhase) {
    parts.push(`${MOON_PHASE_EMOJI[day.moonPhase]} ${MOON_PHASE_FRENCH[day.moonPhase]}`);
  }

  parts.push('');
  parts.push('Source: FacilAbo - Calendrier Lunaire Jardin');

  return parts.join('\\n');
}

function generateICS(days: LunarDay[]): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FacilAbo//Calendrier Lunaire Jardin//FR',
    'METHOD:PUBLISH',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Calendrier Lunaire Jardin',
    'X-WR-CALDESC:Jardinez avec la lune - Conseils quotidiens basés sur les cycles lunaires',
    'X-WR-TIMEZONE:Europe/Paris',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Paris',
    'X-LIC-LOCATION:Europe/Paris',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];

  for (const day of days) {
    const dateFormatted = formatDate(day.date);
    const summary = buildEventSummary(day);
    const description = buildEventDescription(day);

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${generateUID(day.date)}`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;VALUE=DATE:${dateFormatted}`);
    lines.push(`DTEND;VALUE=DATE:${dateFormatted}`);
    lines.push(`SUMMARY:${escapeICS(summary)}`);
    lines.push(`DESCRIPTION:${escapeICS(description)}`);
    lines.push('CATEGORIES:Jardin,Lune,Permaculture');
    lines.push('STATUS:CONFIRMED');
    lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Handle HEAD requests (iOS Calendar checks URL before subscribing)
  if (req.method === 'HEAD') {
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get year from query params, default to current year
    const yearParam = req.query.year;
    const year = yearParam && typeof yearParam === 'string'
      ? parseInt(yearParam, 10)
      : new Date().getFullYear();

    // Validate year (only 2025 supported for now)
    if (year !== 2025) {
      return res.status(400).json({
        error: 'Only 2025 calendar is currently available',
        availableYears: [2025]
      });
    }

    // Generate calendar for the full year
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    const days = generateLunarCalendar(startDate, endDate);

    // Generate ICS content
    const icsContent = generateICS(days);

    // Set appropriate headers for ICS file
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="calendrier-lunaire-jardin.ics"');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');

    return res.status(200).send(icsContent);

  } catch (error) {
    console.error('Lunar calendar error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

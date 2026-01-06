/**
 * FacilAbo API - Calendar Metadata Endpoint
 *
 * Returns metadata about a calendar feed:
 * - Next upcoming event with countdown
 * - Last updated timestamp
 * - Total event count
 * - Date range coverage
 *
 * @route GET /api/v1/calendars/metadata/:slug
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  F1_CALENDARS,
  MOTOGP_CALENDARS,
  NASCAR_CALENDARS,
  NBA_CALENDARS,
  FOOTBALL_TEAMS,
  RUGBY_TEAMS,
  CalendarMapping
} from '../../../../lib/calendar-mappings';
import { fetchWithRetry, RETRY_CONFIGS, createRetryLogger } from '../../../../lib/retry-utils';

interface NextEvent {
  summary: string;
  start: string;  // ISO timestamp
  daysUntil: number;
}

interface FeedMetadata {
  slug: string;
  name: string;
  nextEvent?: NextEvent;
  lastUpdated: string;  // ISO timestamp
  eventCount: number;
  dateRange?: {
    start: string;
    end: string;
  };
}

interface ApiResponse {
  success: boolean;
  data?: FeedMetadata;
  error?: string;
  meta: {
    version: string;
    timestamp: string;
  };
}

// All calendar mappings
const ALL_CALENDARS: Record<string, CalendarMapping> = {
  ...F1_CALENDARS,
  ...MOTOGP_CALENDARS,
  ...NASCAR_CALENDARS,
  ...NBA_CALENDARS,
  ...FOOTBALL_TEAMS,
  ...RUGBY_TEAMS,
};

/**
 * Parse ICS content and extract events
 */
function parseIcsEvents(icsContent: string): Array<{ summary: string; start: Date; end?: Date }> {
  const events: Array<{ summary: string; start: Date; end?: Date }> = [];

  // Split into VEVENT blocks
  const eventBlocks = icsContent.split('BEGIN:VEVENT');

  for (let i = 1; i < eventBlocks.length; i++) {
    const block = eventBlocks[i];
    const endIndex = block.indexOf('END:VEVENT');
    if (endIndex === -1) continue;

    const eventContent = block.substring(0, endIndex);

    // Extract SUMMARY
    const summaryMatch = eventContent.match(/SUMMARY[^:]*:(.+?)(?:\r?\n(?! )|\r?\n$)/s);
    const summary = summaryMatch ? summaryMatch[1].replace(/\r?\n\s*/g, '').trim() : '';

    // Extract DTSTART
    const dtstartMatch = eventContent.match(/DTSTART[^:]*:(\d{8}(?:T\d{6}Z?)?)/);
    if (!dtstartMatch) continue;

    const dtstart = dtstartMatch[1];
    let startDate: Date;

    if (dtstart.length === 8) {
      // All-day event: YYYYMMDD
      startDate = new Date(
        parseInt(dtstart.substring(0, 4)),
        parseInt(dtstart.substring(4, 6)) - 1,
        parseInt(dtstart.substring(6, 8))
      );
    } else {
      // Timed event: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
      const year = parseInt(dtstart.substring(0, 4));
      const month = parseInt(dtstart.substring(4, 6)) - 1;
      const day = parseInt(dtstart.substring(6, 8));
      const hour = parseInt(dtstart.substring(9, 11));
      const minute = parseInt(dtstart.substring(11, 13));
      const second = parseInt(dtstart.substring(13, 15));

      if (dtstart.endsWith('Z')) {
        startDate = new Date(Date.UTC(year, month, day, hour, minute, second));
      } else {
        startDate = new Date(year, month, day, hour, minute, second);
      }
    }

    // Extract DTEND (optional)
    const dtendMatch = eventContent.match(/DTEND[^:]*:(\d{8}(?:T\d{6}Z?)?)/);
    let endDate: Date | undefined;

    if (dtendMatch) {
      const dtend = dtendMatch[1];
      if (dtend.length === 8) {
        endDate = new Date(
          parseInt(dtend.substring(0, 4)),
          parseInt(dtend.substring(4, 6)) - 1,
          parseInt(dtend.substring(6, 8))
        );
      } else {
        const year = parseInt(dtend.substring(0, 4));
        const month = parseInt(dtend.substring(4, 6)) - 1;
        const day = parseInt(dtend.substring(6, 8));
        const hour = parseInt(dtend.substring(9, 11));
        const minute = parseInt(dtend.substring(11, 13));
        const second = parseInt(dtend.substring(13, 15));

        if (dtend.endsWith('Z')) {
          endDate = new Date(Date.UTC(year, month, day, hour, minute, second));
        } else {
          endDate = new Date(year, month, day, hour, minute, second);
        }
      }
    }

    if (summary && !isNaN(startDate.getTime())) {
      events.push({ summary, start: startDate, end: endDate });
    }
  }

  return events;
}

/**
 * Calculate days until a date
 */
function daysUntil(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      meta: { version: '1.0', timestamp: new Date().toISOString() }
    } as ApiResponse);
  }

  const { slug } = req.query;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Missing slug parameter',
      meta: { version: '1.0', timestamp: new Date().toISOString() }
    } as ApiResponse);
  }

  // Find the calendar mapping
  const mapping = ALL_CALENDARS[slug];

  if (!mapping) {
    return res.status(404).json({
      success: false,
      error: `Unknown calendar: ${slug}`,
      meta: { version: '1.0', timestamp: new Date().toISOString() }
    } as ApiResponse);
  }

  try {
    const retryLogger = createRetryLogger('metadata');

    // Fetch the ICS content
    const response = await fetchWithRetry(
      mapping.sourceUrl,
      {
        headers: {
          'Accept': 'text/calendar, text/plain, */*',
          'User-Agent': 'FacilAbo/1.0 (Calendar Metadata Service)'
        }
      },
      {
        ...RETRY_CONFIGS.calendar,
        onRetry: retryLogger
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch calendar: ${response.status}`);
    }

    const icsContent = await response.text();

    // Parse events
    const events = parseIcsEvents(icsContent);

    // Find next upcoming event
    const now = new Date();
    const upcomingEvents = events
      .filter(e => e.start > now)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    const nextEvent = upcomingEvents[0];

    // Calculate date range
    const allDates = events.map(e => e.start).sort((a, b) => a.getTime() - b.getTime());
    const dateRange = allDates.length > 0 ? {
      start: allDates[0].toISOString().split('T')[0],
      end: allDates[allDates.length - 1].toISOString().split('T')[0]
    } : undefined;

    // Build response
    const metadata: FeedMetadata = {
      slug,
      name: mapping.frenchName,
      nextEvent: nextEvent ? {
        summary: nextEvent.summary,
        start: nextEvent.start.toISOString(),
        daysUntil: daysUntil(nextEvent.start)
      } : undefined,
      lastUpdated: new Date().toISOString(),
      eventCount: events.length,
      dateRange
    };

    // Set cache headers (5 minutes for metadata)
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.setHeader('Content-Type', 'application/json');

    return res.status(200).json({
      success: true,
      data: metadata,
      meta: { version: '1.0', timestamp: new Date().toISOString() }
    } as ApiResponse);

  } catch (error) {
    console.error(`[metadata] Error fetching ${slug}:`, error);

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch calendar metadata',
      meta: { version: '1.0', timestamp: new Date().toISOString() }
    } as ApiResponse);
  }
}

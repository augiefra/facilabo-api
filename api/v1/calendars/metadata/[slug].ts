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
  getMapping,
  CalendarMapping
} from '../../../../lib/calendar-mappings';
import { fetchWithRetry, RETRY_CONFIGS, createRetryLogger } from '../../../../lib/retry-utils';
import { getCache, getStaleCache, setCache } from '../../../../lib/v1-utils';
import { trackAbuseRequest } from '../../../../lib/abuse-monitor';
import { applyCalendarTransform } from '../../../../lib/ics-transforms';

interface NextEvent {
  summary: string;
  start: string;  // ISO timestamp
  daysUntil: number;
  timePrecision?: TimePrecision;
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

type TimePrecision = 'time' | 'day';

interface ParsedDateToken {
  raw: string;
  value: string;
  hasValueDateParam: boolean;
  isDateOnly: boolean;
  isMidnightValue: boolean;
  parsedDate?: Date;
}

interface ParsedIcsEvent {
  summary: string;
  start: Date;
  end?: Date;
  dtstart: ParsedDateToken;
  dtend?: ParsedDateToken;
  hasMicrosoftAllDay: boolean;
}

/**
 * Parse ICS content and extract events
 */
function parseIcsEvents(icsContent: string): ParsedIcsEvent[] {
  const events: ParsedIcsEvent[] = [];

  // Split into VEVENT blocks
  const eventBlocks = icsContent.split('BEGIN:VEVENT');

  for (let i = 1; i < eventBlocks.length; i++) {
    const block = eventBlocks[i];
    const endIndex = block.indexOf('END:VEVENT');
    if (endIndex === -1) continue;

    // Unfold ICS line continuations: CRLF + space/tab.
    const eventContent = block
      .substring(0, endIndex)
      .replace(/\r?\n[ \t]/g, '');

    // Extract SUMMARY
    const summaryMatch = eventContent.match(/SUMMARY[^:]*:(.+?)(?:\r?\n(?! )|\r?\n$)/s);
    const summary = summaryMatch ? summaryMatch[1].replace(/\r?\n\s*/g, '').trim() : '';

    const dtstart = parseIcsDateToken(eventContent, 'DTSTART');
    if (!dtstart?.parsedDate) continue;

    const dtend = parseIcsDateToken(eventContent, 'DTEND');
    const hasMicrosoftAllDay = /X-MICROSOFT-CDO-ALLDAYEVENT:TRUE/i.test(eventContent);

    if (summary && !isNaN(dtstart.parsedDate.getTime())) {
      events.push({
        summary,
        start: dtstart.parsedDate,
        end: dtend?.parsedDate,
        dtstart,
        dtend,
        hasMicrosoftAllDay
      });
    }
  }

  return events;
}

function parseIcsDateToken(eventContent: string, propertyName: 'DTSTART' | 'DTEND'): ParsedDateToken | undefined {
  const match = eventContent.match(new RegExp(`${propertyName}([^:]*):([^\\r\\n]+)`));
  if (!match) return undefined;

  const raw = match[0];
  const params = (match[1] ?? '').toUpperCase();
  const value = (match[2] ?? '').trim();
  const hasValueDateParam = /;VALUE=DATE(?:;|$)/.test(params);
  const isDateOnly = /^\d{8}$/.test(value);
  const timePart = value.match(/^\d{8}T(\d{6})Z?$/)?.[1];
  const isMidnightValue = isDateOnly || timePart === '000000';
  const parsedDate = parseIcsDateValueToDate(value);

  return {
    raw,
    value,
    hasValueDateParam,
    isDateOnly,
    isMidnightValue,
    parsedDate
  };
}

function parseIcsDateValueToDate(value: string): Date | undefined {
  if (/^\d{8}$/.test(value)) {
    return new Date(
      parseInt(value.substring(0, 4), 10),
      parseInt(value.substring(4, 6), 10) - 1,
      parseInt(value.substring(6, 8), 10)
    );
  }

  if (/^\d{8}T\d{6}Z?$/.test(value)) {
    const year = parseInt(value.substring(0, 4), 10);
    const month = parseInt(value.substring(4, 6), 10) - 1;
    const day = parseInt(value.substring(6, 8), 10);
    const hour = parseInt(value.substring(9, 11), 10);
    const minute = parseInt(value.substring(11, 13), 10);
    const second = parseInt(value.substring(13, 15), 10);

    if (value.endsWith('Z')) {
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    }

    return new Date(year, month, day, hour, minute, second);
  }

  return undefined;
}

function detectTimePrecision(event: ParsedIcsEvent): { precision: TimePrecision; rule: string } {
  // Rule 1: DTSTART;VALUE=DATE
  if (event.dtstart.hasValueDateParam) {
    return { precision: 'day', rule: 'rule-1-value-date-param' };
  }

  // Rule 2: DTSTART value is YYYYMMDD
  if (event.dtstart.isDateOnly) {
    return { precision: 'day', rule: 'rule-2-date-only' };
  }

  // Rule 3: Microsoft explicit all-day marker
  if (event.hasMicrosoftAllDay) {
    return { precision: 'day', rule: 'rule-3-microsoft-flag' };
  }

  // Rule 4: fallback heuristic for full-day midnight spans
  if (event.end && event.dtend?.isMidnightValue && event.dtstart.isMidnightValue) {
    const durationMs = event.end.getTime() - event.start.getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    if (durationMs >= dayMs && durationMs % dayMs === 0) {
      return { precision: 'day', rule: 'rule-4-midnight-span' };
    }
  }

  // Rule 5: default safety fallback
  return { precision: 'time', rule: 'rule-5-default-time' };
}

function maybeLogTimePrecision(slug: string, event: ParsedIcsEvent, decision: { precision: TimePrecision; rule: string }): void {
  if (process.env.METADATA_TIME_PRECISION_DEBUG !== '1') {
    return;
  }

  console.info(
    `[metadata][timePrecision] slug=${slug} precision=${decision.precision} rule=${decision.rule} ` +
    `dtstart=${event.dtstart.value} dtend=${event.dtend?.value ?? 'none'}`
  );
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

  const abuseDecision = await trackAbuseRequest(req, { endpoint: 'metadata', slug });
  Object.entries(abuseDecision.headers).forEach(([key, value]) => res.setHeader(key, value));
  if (abuseDecision.blocked) {
    return res.status(429).json({
      success: false,
      error: 'Too many requests',
      meta: { version: '1.0', timestamp: new Date().toISOString() }
    } as ApiResponse);
  }

  // Find the calendar mapping
  const mapping: CalendarMapping | undefined = getMapping(slug);

  if (!mapping) {
    return res.status(404).json({
      success: false,
      error: `Unknown calendar: ${slug}`,
      meta: { version: '1.0', timestamp: new Date().toISOString() }
    } as ApiResponse);
  }

  const cacheKey = `v1:metadata:${slug}`;
  const cached = getCache<FeedMetadata>(cacheKey);
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({
      success: true,
      data: cached,
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

    let icsContent = await response.text();
    icsContent = applyCalendarTransform(slug, icsContent);

    // Parse events
    const events = parseIcsEvents(icsContent);

    // Find next upcoming event
    const now = new Date();
    const upcomingEvents = events
      .filter(e => e.start > now)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    const nextEvent = upcomingEvents[0];
    const nextEventTimePrecision = nextEvent ? detectTimePrecision(nextEvent) : undefined;
    if (nextEvent && nextEventTimePrecision) {
      maybeLogTimePrecision(slug, nextEvent, nextEventTimePrecision);
    }

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
        daysUntil: daysUntil(nextEvent.start),
        timePrecision: nextEventTimePrecision?.precision
      } : undefined,
      lastUpdated: new Date().toISOString(),
      eventCount: events.length,
      dateRange
    };

    // Set cache headers (5 minutes for metadata)
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.setHeader('Content-Type', 'application/json');
    setCache(cacheKey, metadata, 300);

    return res.status(200).json({
      success: true,
      data: metadata,
      meta: { version: '1.0', timestamp: new Date().toISOString() }
    } as ApiResponse);

  } catch (error) {
    console.error(`[metadata] Error fetching ${slug}:`, error);

    const stale = getStaleCache<FeedMetadata>(cacheKey);
    if (stale) {
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json({
        success: true,
        data: stale,
        meta: { version: '1.0', timestamp: new Date().toISOString() }
      } as ApiResponse);
    }

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch calendar metadata',
      meta: { version: '1.0', timestamp: new Date().toISOString() }
    } as ApiResponse);
  }
}

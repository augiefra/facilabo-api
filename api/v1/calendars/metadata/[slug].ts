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
import {
  buildRuntimeState,
  getCache,
  getStaleCache,
  isEnvFlagEnabled,
  RuntimeState,
  setCache,
} from '../../../../lib/v1-utils';
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
  runtime?: RuntimeState;
  meta: {
    version: string;
    timestamp: string;
    killSwitchActive?: boolean;
  };
}

type TimePrecision = 'time' | 'day';

interface ParsedDateToken {
  raw: string;
  value: string;
  hasValueDateParam: boolean;
  isDateOnly: boolean;
  isMidnightValue: boolean;
  timeZoneId?: string;
  parsedDate?: Date;
}

interface DateTimeComponents {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  isDateOnly: boolean;
  isUtc: boolean;
}

interface ParsedRRuleByDay {
  ordinal?: number;
  weekday: number; // 0=SU, 1=MO, ... 6=SA
}

interface ParsedRRule {
  raw: string;
  freq: 'YEARLY' | 'MONTHLY';
  interval: number;
  byMonth: number[];
  byDay: ParsedRRuleByDay[];
  until?: Date;
}

interface ParsedIcsEvent {
  summary: string;
  start: Date;
  end?: Date;
  logicalEnd?: Date;
  dtstart: ParsedDateToken;
  dtend?: ParsedDateToken;
  hasMicrosoftAllDay: boolean;
  hasAmbiguousValueDateSpan: boolean;
  rrule?: ParsedRRule;
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
    const hasAmbiguousValueDateSpan = hasSameStartEndValueDate(dtstart, dtend);
    const logicalEnd = resolveLogicalEventEnd(dtstart, dtend);
    const rrule = parseRRule(eventContent, dtstart.timeZoneId);

    if (summary && !isNaN(dtstart.parsedDate.getTime())) {
      events.push({
        summary,
        start: dtstart.parsedDate,
        end: dtend?.parsedDate,
        logicalEnd,
        dtstart,
        dtend,
        hasMicrosoftAllDay,
        hasAmbiguousValueDateSpan,
        rrule
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
  const rawParams = match[1] ?? '';
  const value = (match[2] ?? '').trim();
  const hasValueDateParam = /;VALUE=DATE(?:;|$)/.test(params);
  const isDateOnly = /^\d{8}$/.test(value);
  const timePart = value.match(/^\d{8}T(\d{6})Z?$/)?.[1];
  const isMidnightValue = isDateOnly || timePart === '000000';
  const timeZoneId = extractTimeZoneId(rawParams);
  const parsedDate = parseIcsDateValueToDate(value, timeZoneId);

  return {
    raw,
    value,
    hasValueDateParam,
    isDateOnly,
    isMidnightValue,
    timeZoneId,
    parsedDate
  };
}

function parseIcsDateValueToDate(value: string, timeZoneId?: string): Date | undefined {
  const components = extractDateTimeComponents(value);
  if (!components) {
    return undefined;
  }

  if (components.isDateOnly) {
    return new Date(components.year, components.month - 1, components.day);
  }

  if (components.isUtc) {
    return new Date(
      Date.UTC(
        components.year,
        components.month - 1,
        components.day,
        components.hour,
        components.minute,
        components.second
      )
    );
  }

  if (timeZoneId) {
    return createDateInTimeZone(
      {
        year: components.year,
        month: components.month - 1,
        day: components.day,
        hour: components.hour,
        minute: components.minute,
        second: components.second
      },
      timeZoneId
    );
  }

  return new Date(
    components.year,
    components.month - 1,
    components.day,
    components.hour,
    components.minute,
    components.second
  );
}

function extractTimeZoneId(rawParams: string): string | undefined {
  const match = rawParams.match(/;TZID=([^;:]+)/i);
  return match?.[1]?.trim() || undefined;
}

function extractDateTimeComponents(value: string): DateTimeComponents | undefined {
  if (/^\d{8}$/.test(value)) {
    return {
      year: parseInt(value.substring(0, 4), 10),
      month: parseInt(value.substring(4, 6), 10),
      day: parseInt(value.substring(6, 8), 10),
      hour: 0,
      minute: 0,
      second: 0,
      isDateOnly: true,
      isUtc: false
    };
  }

  if (/^\d{8}T\d{6}Z?$/.test(value)) {
    return {
      year: parseInt(value.substring(0, 4), 10),
      month: parseInt(value.substring(4, 6), 10),
      day: parseInt(value.substring(6, 8), 10),
      hour: parseInt(value.substring(9, 11), 10),
      minute: parseInt(value.substring(11, 13), 10),
      second: parseInt(value.substring(13, 15), 10),
      isDateOnly: false,
      isUtc: value.endsWith('Z')
    };
  }

  return undefined;
}

function hasSameStartEndValueDate(dtstart: ParsedDateToken, dtend?: ParsedDateToken): boolean {
  return dtstart.hasValueDateParam && !!dtend?.hasValueDateParam && dtstart.value === dtend.value;
}

function resolveLogicalEventEnd(dtstart: ParsedDateToken, dtend?: ParsedDateToken): Date | undefined {
  if (dtend?.parsedDate) {
    if (hasSameStartEndValueDate(dtstart, dtend)) {
      return addDays(dtstart.parsedDate ?? dtend.parsedDate, 1);
    }
    return dtend.parsedDate;
  }

  if (dtstart.hasValueDateParam && dtstart.parsedDate) {
    return addDays(dtstart.parsedDate, 1);
  }

  return undefined;
}

function addDays(date: Date, dayCount: number): Date {
  return new Date(date.getTime() + dayCount * 24 * 60 * 60 * 1000);
}

function parseRRule(eventContent: string, timeZoneId?: string): ParsedRRule | undefined {
  const match = eventContent.match(/(?:^|\r?\n)RRULE:(.+?)(?:\r?\n|$)/i);
  if (!match) {
    return undefined;
  }

  const raw = match[1].trim();
  const params = new Map<string, string>();
  raw.split(';').forEach((entry) => {
    const [rawKey, rawValue] = entry.split('=');
    if (!rawKey || !rawValue) {
      return;
    }
    params.set(rawKey.toUpperCase(), rawValue.trim());
  });

  const freqValue = params.get('FREQ');
  if (freqValue !== 'YEARLY' && freqValue !== 'MONTHLY') {
    return undefined;
  }

  const interval = Math.max(1, parseInt(params.get('INTERVAL') ?? '1', 10) || 1);
  const byMonth = (params.get('BYMONTH') ?? '')
    .split(',')
    .map((value) => parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 12);
  const byDay = (params.get('BYDAY') ?? '')
    .split(',')
    .map(parseRRuleByDay)
    .filter((value): value is ParsedRRuleByDay => value != null);
  const until = parseRRuleUntil(params.get('UNTIL'), timeZoneId);

  return {
    raw,
    freq: freqValue,
    interval,
    byMonth,
    byDay,
    until
  };
}

function parseRRuleByDay(value: string): ParsedRRuleByDay | undefined {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) {
    return undefined;
  }

  const match = trimmed.match(/^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/);
  if (!match) {
    return undefined;
  }

  const weekdayMap: Record<string, number> = {
    SU: 0,
    MO: 1,
    TU: 2,
    WE: 3,
    TH: 4,
    FR: 5,
    SA: 6
  };

  const ordinal = match[1] ? parseInt(match[1], 10) : undefined;
  return {
    ordinal: Number.isNaN(ordinal ?? NaN) ? undefined : ordinal,
    weekday: weekdayMap[match[2]]
  };
}

function parseRRuleUntil(value: string | undefined, timeZoneId?: string): Date | undefined {
  if (!value) {
    return undefined;
  }
  return parseIcsDateValueToDate(value.trim(), timeZoneId);
}

function createDateInTimeZone(
  components: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  timeZoneId: string
): Date {
  let timestamp = Date.UTC(
    components.year,
    components.month,
    components.day,
    components.hour,
    components.minute,
    components.second
  );

  for (let attempt = 0; attempt < 2; attempt++) {
    const offset = timeZoneOffsetMillis(new Date(timestamp), timeZoneId);
    timestamp = Date.UTC(
      components.year,
      components.month,
      components.day,
      components.hour,
      components.minute,
      components.second
    ) - offset;
  }

  return new Date(timestamp);
}

function timeZoneOffsetMillis(date: Date, timeZoneId: string): number {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZoneId,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number.parseInt(byType.year, 10),
    Number.parseInt(byType.month, 10) - 1,
    Number.parseInt(byType.day, 10),
    Number.parseInt(byType.hour, 10),
    Number.parseInt(byType.minute, 10),
    Number.parseInt(byType.second, 10)
  );

  return asUtc - date.getTime();
}

function detectTimePrecision(event: ParsedIcsEvent): { precision: TimePrecision; rule: string } {
  // Rule 1: DTSTART;VALUE=DATE
  if (event.dtstart.hasValueDateParam) {
    if (event.hasAmbiguousValueDateSpan) {
      return { precision: 'day', rule: 'rule-1b-value-date-same-start-end-normalized' };
    }
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

function supportsTargetedRecurringExpansion(event: ParsedIcsEvent): boolean {
  if (!event.rrule) {
    return false;
  }

  if (event.rrule.byDay.length > 1 || event.rrule.byMonth.length > 1) {
    return false;
  }

  if (event.rrule.freq === 'YEARLY') {
    return event.rrule.interval >= 1;
  }

  return event.rrule.freq === 'MONTHLY' && event.rrule.interval === 12;
}

function expandEventCandidatesForNextEvent(
  event: ParsedIcsEvent,
  windowStart: Date,
  windowEnd: Date
): ParsedIcsEvent[] {
  if (!supportsTargetedRecurringExpansion(event)) {
    return [event];
  }

  const startComponents = extractDateTimeComponents(event.dtstart.value);
  if (!startComponents || startComponents.isDateOnly) {
    return [event];
  }

  const eventDurationMs = Math.max(
    0,
    (event.logicalEnd?.getTime() ?? event.end?.getTime() ?? event.start.getTime()) - event.start.getTime()
  );
  const years = enumerateCandidateYears(event, windowStart, windowEnd);
  const months = event.rrule!.byMonth.length > 0 ? event.rrule!.byMonth : [startComponents.month];
  const byDay = event.rrule!.byDay[0];
  const occurrences: ParsedIcsEvent[] = [];

  for (const year of years) {
    for (const month of months) {
      const day = byDay
        ? resolveDayOfMonthForOrdinalWeekday(year, month, byDay)
        : startComponents.day;
      if (!day) {
        continue;
      }

      const occurrenceStart = buildOccurrenceDate(
        {
          year,
          month,
          day,
          hour: startComponents.hour,
          minute: startComponents.minute,
          second: startComponents.second,
          isDateOnly: false,
          isUtc: startComponents.isUtc
        },
        event.dtstart.timeZoneId
      );

      if (!occurrenceStart) {
        continue;
      }
      if (occurrenceStart.getTime() < event.start.getTime()) {
        continue;
      }
      if (event.rrule?.until && occurrenceStart.getTime() > event.rrule.until.getTime()) {
        continue;
      }
      if (occurrenceStart.getTime() < windowStart.getTime() || occurrenceStart.getTime() > windowEnd.getTime()) {
        continue;
      }

      occurrences.push({
        ...event,
        start: occurrenceStart,
        end: new Date(occurrenceStart.getTime() + eventDurationMs),
        logicalEnd: new Date(occurrenceStart.getTime() + eventDurationMs),
      });
    }
  }

  return occurrences;
}

function enumerateCandidateYears(event: ParsedIcsEvent, windowStart: Date, windowEnd: Date): number[] {
  const firstYear = Math.min(event.start.getUTCFullYear(), windowStart.getUTCFullYear());
  const lastYear = Math.max(event.start.getUTCFullYear(), windowEnd.getUTCFullYear()) + 1;
  const years: number[] = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    years.push(year);
  }
  return years;
}

function resolveDayOfMonthForOrdinalWeekday(
  year: number,
  month: number,
  byDay: ParsedRRuleByDay
): number | undefined {
  const ordinal = byDay.ordinal ?? 1;
  const firstDay = new Date(Date.UTC(year, month - 1, 1));

  if (ordinal > 0) {
    const firstWeekday = firstDay.getUTCDay();
    const delta = (byDay.weekday - firstWeekday + 7) % 7;
    const day = 1 + delta + (ordinal - 1) * 7;
    const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return day <= lastDayOfMonth ? day : undefined;
  }

  const lastDayOfMonth = new Date(Date.UTC(year, month, 0));
  const lastWeekday = lastDayOfMonth.getUTCDay();
  const delta = (lastWeekday - byDay.weekday + 7) % 7;
  const day = lastDayOfMonth.getUTCDate() - delta + (ordinal + 1) * 7;
  return day >= 1 ? day : undefined;
}

function buildOccurrenceDate(
  components: DateTimeComponents,
  timeZoneId?: string
): Date | undefined {
  const value = `${String(components.year).padStart(4, '0')}${String(components.month).padStart(2, '0')}${String(components.day).padStart(2, '0')}T${String(components.hour).padStart(2, '0')}${String(components.minute).padStart(2, '0')}${String(components.second).padStart(2, '0')}${components.isUtc ? 'Z' : ''}`;
  return parseIcsDateValueToDate(value, timeZoneId);
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

  if (isEnvFlagEnabled('METADATA_KILL_SWITCH')) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    return res.status(503).json({
      success: false,
      error: 'Metadata temporarily disabled by kill switch',
      runtime: buildRuntimeState({
        freshness: 'unavailable',
        fallbackUsed: false,
      }),
      meta: {
        version: '1.0',
        timestamp: new Date().toISOString(),
        killSwitchActive: true,
      }
    } as ApiResponse);
  }

  const cached = getCache<FeedMetadata>(cacheKey);
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({
      success: true,
      data: cached,
      runtime: buildRuntimeState({
        freshness: 'fresh',
        fallbackUsed: false,
        lastUpdated: cached.lastUpdated,
      }),
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

    // Parse source events.
    const events = parseIcsEvents(icsContent);

    // Expand only the recurring cases we explicitly support, and only for nextEvent.
    // Why: this keeps the public payload stable while making recurring critical feeds
    // like changement-heure exploitable without pretending to solve generic RRULE.
    const now = new Date();
    const nextEventHorizon = addDays(now, 370 * 2);
    const upcomingEvents = events
      .flatMap((event) => expandEventCandidatesForNextEvent(event, now, nextEventHorizon))
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
      runtime: buildRuntimeState({
        freshness: 'fresh',
        fallbackUsed: false,
        lastUpdated: metadata.lastUpdated,
      }),
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
        runtime: buildRuntimeState({
          freshness: 'stale',
          fallbackUsed: true,
          lastUpdated: stale.lastUpdated,
        }),
        meta: { version: '1.0', timestamp: new Date().toISOString() }
      } as ApiResponse);
    }

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch calendar metadata',
      runtime: buildRuntimeState({
        freshness: 'unavailable',
        fallbackUsed: false,
      }),
      meta: { version: '1.0', timestamp: new Date().toISOString() }
    } as ApiResponse);
  }
}

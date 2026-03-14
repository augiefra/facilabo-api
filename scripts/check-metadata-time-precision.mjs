#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../tests/fixtures/metadata-time-precision');
const metadataApiBase = process.env.METADATA_TIME_PRECISION_API_BASE ?? 'https://facilabo-api.vercel.app';
const enableLiveChecks = process.env.METADATA_TIME_PRECISION_ENABLE_LIVE === '1';

const precisionCases = [
  {
    file: '01-value-date-all-day.ics',
    expectedPrecision: 'day',
    expectedStartRaw: '20270310',
    expectedEndRaw: '20270311'
  },
  {
    file: '02-timed-event.ics',
    expectedPrecision: 'time',
    expectedStartRaw: '20270310T153000',
    expectedEndRaw: '20270310T173000'
  },
  {
    file: '03-midnight-multi-day.ics',
    expectedPrecision: 'day',
    expectedStartRaw: '20270310T000000',
    expectedEndRaw: '20270311T000000'
  },
  {
    file: '04-midnight-short-time.ics',
    expectedPrecision: 'time',
    expectedStartRaw: '20270310T000000',
    expectedEndRaw: '20270310T010000'
  },
  {
    file: '05-utc-z-timed.ics',
    expectedPrecision: 'time',
    expectedStartIso: '2027-03-10T18:45:00.000Z',
    expectedEndIso: '2027-03-10T19:45:00.000Z'
  },
  {
    file: '06-microsoft-all-day-flag.ics',
    expectedPrecision: 'day',
    expectedStartRaw: '20270310T000000',
    expectedEndRaw: '20270311T000000'
  },
  {
    file: '07-tzid-europe-paris-timed.ics',
    expectedPrecision: 'time',
    expectedStartIso: '2027-03-10T20:10:00.000Z',
    expectedEndIso: '2027-03-10T22:10:00.000Z'
  },
  {
    file: '08-value-date-multi-day-inclusive.ics',
    expectedPrecision: 'day',
    expectedStartRaw: '20270410',
    expectedEndRaw: '20270426'
  },
  {
    file: '09-half-day-morning-tzid-europe-paris.ics',
    expectedPrecision: 'time',
    expectedStartIso: '2027-03-10T07:00:00.000Z',
    expectedEndIso: '2027-03-10T11:00:00.000Z'
  },
  {
    file: '10-half-day-afternoon-tzid-europe-paris.ics',
    expectedPrecision: 'time',
    expectedStartIso: '2027-03-10T13:00:00.000Z',
    expectedEndIso: '2027-03-10T17:00:00.000Z'
  },
  {
    file: '11-tzid-europe-paris-dst-spring.ics',
    expectedPrecision: 'time',
    expectedStartIso: '2027-03-28T01:30:00.000Z',
    expectedEndIso: '2027-03-28T03:30:00.000Z'
  },
  {
    file: '12-tzid-europe-paris-dst-fall.ics',
    expectedPrecision: 'time',
    expectedStartIso: '2027-10-31T02:30:00.000Z',
    expectedEndIso: '2027-10-31T04:30:00.000Z'
  }
];

const calendarCases = [
  {
    file: '13-rrule-changement-heure-france.ics',
    referenceNowIso: '2026-03-14T12:00:00.000Z',
    expectedSummary: "Passage à l'heure d'été : +1h",
    expectedPrecision: 'time',
    expectedStartIso: '2026-03-29T01:00:00.000Z'
  },
  {
    file: '14-value-date-same-start-end.ics',
    referenceNowIso: '2027-05-01T12:00:00.000Z',
    expectedSummary: "Pont de l'Ascension",
    expectedPrecision: 'day',
    expectedStartRaw: '20270507',
    expectedLogicalDurationDays: 1
  }
];

const liveCases = [
  {
    slug: 'vacances-zone-a',
    expectedPrecision: 'day',
    requireNextEvent: true,
    requireFutureStart: true
  },
  {
    slug: 'changement-heure-france',
    expectedPrecision: 'time',
    requireNextEvent: true,
    requireFutureStart: true
  }
];

function parseFixture(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const events = parseIcsEvents(content);
  if (events.length === 0) {
    throw new Error(`BEGIN:VEVENT/END:VEVENT introuvable dans ${path.basename(filePath)}`);
  }
  return events[0];
}

function parseIcsEvents(icsContent) {
  const events = [];
  const eventBlocks = icsContent.split('BEGIN:VEVENT');

  for (let index = 1; index < eventBlocks.length; index += 1) {
    const block = eventBlocks[index];
    const endIndex = block.indexOf('END:VEVENT');
    if (endIndex === -1) continue;

    const eventContent = block.substring(0, endIndex).replace(/\r?\n[ \t]/g, '');
    const summary = extractSummary(eventContent);
    const dtstart = parseDateToken(eventContent, 'DTSTART');
    if (!dtstart?.parsedDate) continue;

    const dtend = parseDateToken(eventContent, 'DTEND');
    const hasMicrosoftAllDay = /X-MICROSOFT-CDO-ALLDAYEVENT:TRUE/i.test(eventContent);
    const hasAmbiguousValueDateSpan = hasSameStartEndValueDate(dtstart, dtend);
    const logicalEnd = resolveLogicalEventEnd(dtstart, dtend);
    const rrule = parseRRule(eventContent, dtstart.timeZoneId);

    if (summary && !Number.isNaN(dtstart.parsedDate.getTime())) {
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

function extractSummary(eventContent) {
  const match = eventContent.match(/SUMMARY[^:]*:(.+?)(?:\r?\n|$)/);
  return match ? match[1].trim() : '';
}

function parseDateToken(eventContent, propertyName) {
  const match = eventContent.match(new RegExp(`${propertyName}([^:]*):([^\\r\\n]+)`));
  if (!match) return undefined;

  const params = (match[1] ?? '').toUpperCase();
  const rawParams = match[1] ?? '';
  const value = (match[2] ?? '').trim();
  const hasValueDateParam = /;VALUE=DATE(?:;|$)/.test(params);
  const isDateOnly = /^\d{8}$/.test(value);
  const timePart = value.match(/^\d{8}T(\d{6})Z?$/)?.[1];
  const isMidnightValue = isDateOnly || timePart === '000000';
  const timeZoneId = extractTimeZoneId(rawParams);
  const parsedDate = parseDateValue(value, timeZoneId);

  return {
    value,
    hasValueDateParam,
    isDateOnly,
    isMidnightValue,
    timeZoneId,
    parsedDate
  };
}

function parseDateValue(value, timeZoneId) {
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

function extractDateTimeComponents(value) {
  if (/^\d{8}$/.test(value)) {
    return {
      year: Number.parseInt(value.slice(0, 4), 10),
      month: Number.parseInt(value.slice(4, 6), 10),
      day: Number.parseInt(value.slice(6, 8), 10),
      hour: 0,
      minute: 0,
      second: 0,
      isDateOnly: true,
      isUtc: false
    };
  }

  if (/^\d{8}T\d{6}Z?$/.test(value)) {
    return {
      year: Number.parseInt(value.slice(0, 4), 10),
      month: Number.parseInt(value.slice(4, 6), 10),
      day: Number.parseInt(value.slice(6, 8), 10),
      hour: Number.parseInt(value.slice(9, 11), 10),
      minute: Number.parseInt(value.slice(11, 13), 10),
      second: Number.parseInt(value.slice(13, 15), 10),
      isDateOnly: false,
      isUtc: value.endsWith('Z')
    };
  }

  return undefined;
}

function extractTimeZoneId(rawParams) {
  const match = rawParams.match(/;TZID=([^;:]+)/i);
  return match?.[1]?.trim();
}

function hasSameStartEndValueDate(dtstart, dtend) {
  return dtstart.hasValueDateParam && !!dtend?.hasValueDateParam && dtstart.value === dtend.value;
}

function resolveLogicalEventEnd(dtstart, dtend) {
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

function parseRRule(eventContent, timeZoneId) {
  const match = eventContent.match(/(?:^|\r?\n)RRULE:(.+?)(?:\r?\n|$)/i);
  if (!match) {
    return undefined;
  }

  const raw = match[1].trim();
  const params = new Map();
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

  const interval = Math.max(1, Number.parseInt(params.get('INTERVAL') ?? '1', 10) || 1);
  const byMonth = (params.get('BYMONTH') ?? '')
    .split(',')
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 12);
  const byDay = (params.get('BYDAY') ?? '')
    .split(',')
    .map(parseRRuleByDay)
    .filter(Boolean);
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

function parseRRuleByDay(value) {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) {
    return undefined;
  }

  const match = trimmed.match(/^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/);
  if (!match) {
    return undefined;
  }

  const weekdayMap = {
    SU: 0,
    MO: 1,
    TU: 2,
    WE: 3,
    TH: 4,
    FR: 5,
    SA: 6
  };

  const ordinal = match[1] ? Number.parseInt(match[1], 10) : undefined;
  return {
    ordinal: Number.isNaN(ordinal ?? Number.NaN) ? undefined : ordinal,
    weekday: weekdayMap[match[2]]
  };
}

function parseRRuleUntil(value, timeZoneId) {
  if (!value) {
    return undefined;
  }
  return parseDateValue(value.trim(), timeZoneId);
}

function createDateInTimeZone(components, timeZoneId) {
  let timestamp = Date.UTC(
    components.year,
    components.month,
    components.day,
    components.hour,
    components.minute,
    components.second
  );

  for (let attempt = 0; attempt < 2; attempt += 1) {
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

function timeZoneOffsetMillis(date, timeZoneId) {
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

function detectTimePrecision(event) {
  if (event.dtstart.hasValueDateParam) {
    if (event.hasAmbiguousValueDateSpan) {
      return { precision: 'day', rule: 'rule-1b-value-date-same-start-end-normalized' };
    }
    return { precision: 'day', rule: 'rule-1-value-date-param' };
  }

  if (event.dtstart.isDateOnly) {
    return { precision: 'day', rule: 'rule-2-date-only' };
  }

  if (event.hasMicrosoftAllDay) {
    return { precision: 'day', rule: 'rule-3-microsoft-flag' };
  }

  if (event.end && event.dtstart.isMidnightValue && event.dtend?.isMidnightValue) {
    const durationMs = event.end.getTime() - event.start.getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    if (durationMs >= dayMs && durationMs % dayMs === 0) {
      return { precision: 'day', rule: 'rule-4-midnight-span' };
    }
  }

  return { precision: 'time', rule: 'rule-5-default-time' };
}

function addDays(date, dayCount) {
  return new Date(date.getTime() + dayCount * 24 * 60 * 60 * 1000);
}

function supportsTargetedRecurringExpansion(event) {
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

function expandEventCandidatesForNextEvent(event, windowStart, windowEnd) {
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
  const months = event.rrule.byMonth.length > 0 ? event.rrule.byMonth : [startComponents.month];
  const byDay = event.rrule.byDay[0];
  const occurrences = [];

  for (const year of years) {
    for (const month of months) {
      const day = byDay ? resolveDayOfMonthForOrdinalWeekday(year, month, byDay) : startComponents.day;
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
      if (event.rrule.until && occurrenceStart.getTime() > event.rrule.until.getTime()) {
        continue;
      }
      if (occurrenceStart.getTime() < windowStart.getTime() || occurrenceStart.getTime() > windowEnd.getTime()) {
        continue;
      }

      occurrences.push({
        ...event,
        start: occurrenceStart,
        end: new Date(occurrenceStart.getTime() + eventDurationMs),
        logicalEnd: new Date(occurrenceStart.getTime() + eventDurationMs)
      });
    }
  }

  return occurrences;
}

function enumerateCandidateYears(event, windowStart, windowEnd) {
  const firstYear = Math.min(event.start.getUTCFullYear(), windowStart.getUTCFullYear());
  const lastYear = Math.max(event.start.getUTCFullYear(), windowEnd.getUTCFullYear()) + 1;
  const years = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    years.push(year);
  }
  return years;
}

function resolveDayOfMonthForOrdinalWeekday(year, month, byDay) {
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

function buildOccurrenceDate(components, timeZoneId) {
  const rawValue =
    `${String(components.year).padStart(4, '0')}` +
    `${String(components.month).padStart(2, '0')}` +
    `${String(components.day).padStart(2, '0')}T` +
    `${String(components.hour).padStart(2, '0')}` +
    `${String(components.minute).padStart(2, '0')}` +
    `${String(components.second).padStart(2, '0')}` +
    `${components.isUtc ? 'Z' : ''}`;
  return parseDateValue(rawValue, timeZoneId);
}

function findNextEvent(events, referenceNow) {
  const nextEventHorizon = addDays(referenceNow, 370 * 2);
  return events
    .flatMap((event) => expandEventCandidatesForNextEvent(event, referenceNow, nextEventHorizon))
    .filter((event) => event.start > referenceNow)
    .sort((left, right) => left.start.getTime() - right.start.getTime())[0];
}

function runPrecisionCases() {
  const failures = [];

  for (const testCase of precisionCases) {
    const filePath = path.join(fixturesDir, testCase.file);
    const event = parseFixture(filePath);
    const decision = detectTimePrecision(event);
    const precisionPassed = decision.precision === testCase.expectedPrecision;
    const startIsoPassed = !testCase.expectedStartIso || event.start.toISOString() === testCase.expectedStartIso;
    const endIsoPassed = !testCase.expectedEndIso || event.end?.toISOString() === testCase.expectedEndIso;
    const startRawPassed = !testCase.expectedStartRaw || event.dtstart.value === testCase.expectedStartRaw;
    const endRawPassed = !testCase.expectedEndRaw || event.dtend?.value === testCase.expectedEndRaw;
    const passed =
      precisionPassed &&
      startIsoPassed &&
      endIsoPassed &&
      startRawPassed &&
      endRawPassed;

    const badge = passed ? 'PASS' : 'FAIL';
    console.log(
      `[${badge}] ${testCase.file} expected=${testCase.expectedPrecision} got=${decision.precision}` +
      `${testCase.expectedStartRaw ? ` expectedStartRaw=${testCase.expectedStartRaw} gotStartRaw=${event.dtstart.value}` : ''}` +
      `${testCase.expectedEndRaw ? ` expectedEndRaw=${testCase.expectedEndRaw} gotEndRaw=${event.dtend?.value ?? 'undefined'}` : ''}` +
      `${testCase.expectedStartIso ? ` expectedStartIso=${testCase.expectedStartIso} gotStartIso=${event.start.toISOString()}` : ''}` +
      `${testCase.expectedEndIso ? ` expectedEndIso=${testCase.expectedEndIso} gotEndIso=${event.end?.toISOString() ?? 'undefined'}` : ''}` +
      ` rule=${decision.rule} summary="${event.summary}"`
    );

    if (!passed) {
      failures.push(testCase.file);
    }
  }

  return failures;
}

function runCalendarCases() {
  const failures = [];

  for (const testCase of calendarCases) {
    const filePath = path.join(fixturesDir, testCase.file);
    const events = parseIcsEvents(fs.readFileSync(filePath, 'utf8'));
    const referenceNow = new Date(testCase.referenceNowIso);
    const nextEvent = findNextEvent(events, referenceNow);
    const decision = nextEvent ? detectTimePrecision(nextEvent) : undefined;
    const logicalDurationDays = nextEvent?.logicalEnd
      ? Math.round((nextEvent.logicalEnd.getTime() - nextEvent.start.getTime()) / (24 * 60 * 60 * 1000))
      : undefined;
    const passed =
      !!nextEvent &&
      nextEvent.summary === testCase.expectedSummary &&
      decision?.precision === testCase.expectedPrecision &&
      (!testCase.expectedStartIso || nextEvent.start.toISOString() === testCase.expectedStartIso) &&
      (!testCase.expectedStartRaw || nextEvent.dtstart.value === testCase.expectedStartRaw) &&
      (!testCase.expectedLogicalDurationDays || logicalDurationDays === testCase.expectedLogicalDurationDays);

    const badge = passed ? 'PASS' : 'FAIL';
    console.log(
      `[${badge}] ${testCase.file} referenceNow=${testCase.referenceNowIso}` +
      ` expectedSummary="${testCase.expectedSummary}" gotSummary="${nextEvent?.summary ?? 'none'}"` +
      ` expectedPrecision=${testCase.expectedPrecision} gotPrecision=${decision?.precision ?? 'none'}` +
      `${testCase.expectedStartIso ? ` expectedStartIso=${testCase.expectedStartIso} gotStartIso=${nextEvent?.start.toISOString() ?? 'none'}` : ''}` +
      `${testCase.expectedStartRaw ? ` expectedStartRaw=${testCase.expectedStartRaw} gotStartRaw=${nextEvent?.dtstart.value ?? 'none'}` : ''}` +
      `${testCase.expectedLogicalDurationDays ? ` expectedLogicalDurationDays=${testCase.expectedLogicalDurationDays} gotLogicalDurationDays=${logicalDurationDays ?? 'none'}` : ''}`
    );

    if (!passed) {
      failures.push(testCase.file);
    }
  }

  return failures;
}

async function runLiveMetadataChecks() {
  if (!enableLiveChecks) {
    console.log('[SKIP] live metadata checks disabled (set METADATA_TIME_PRECISION_ENABLE_LIVE=1 for Guardian mode)');
    return [];
  }

  const failures = [];

  for (const liveCase of liveCases) {
    const response = await fetch(`${metadataApiBase}/api/v1/calendars/metadata/${liveCase.slug}`);
    let payload;

    try {
      payload = await response.json();
    } catch (error) {
      failures.push(liveCase.slug);
      console.log(
        `[FAIL] live:${liveCase.slug} invalid-json status=${response.status} error=${error instanceof Error ? error.message : String(error)}`
      );
      continue;
    }

    const nextEvent = payload?.data?.nextEvent;
    const start = typeof nextEvent?.start === 'string' ? new Date(nextEvent.start) : undefined;
    const isFutureStart = start instanceof Date && !Number.isNaN(start.getTime()) && start.getTime() > Date.now();
    const passed =
      response.ok &&
      payload?.success === true &&
      payload?.data?.slug === liveCase.slug &&
      (!liveCase.requireNextEvent || typeof nextEvent === 'object') &&
      (!liveCase.expectedPrecision || nextEvent?.timePrecision === liveCase.expectedPrecision) &&
      (!liveCase.requireFutureStart || isFutureStart);

    const badge = passed ? 'PASS' : 'FAIL';
    console.log(
      `[${badge}] live:${liveCase.slug} status=${response.status}` +
      ` expectedPrecision=${liveCase.expectedPrecision ?? 'n/a'} gotPrecision=${nextEvent?.timePrecision ?? 'none'}` +
      ` nextEventStart=${nextEvent?.start ?? 'none'}`
    );

    if (!passed) {
      failures.push(liveCase.slug);
    }
  }

  return failures;
}

async function run() {
  const precisionFailures = runPrecisionCases();
  const calendarFailures = runCalendarCases();
  const liveFailures = await runLiveMetadataChecks();
  const failures = [...precisionFailures, ...calendarFailures, ...liveFailures];

  if (failures.length > 0) {
    console.error(`\n${failures.length} echec(s): ${failures.join(', ')}`);
    process.exit(1);
  }

  const totalCaseCount =
    precisionCases.length +
    calendarCases.length +
    (enableLiveChecks ? liveCases.length : 0);
  console.log(`\nTous les cas timePrecision sont valides (${totalCaseCount}/${totalCaseCount}).`);
}

run();

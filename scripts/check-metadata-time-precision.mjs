#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../tests/fixtures/metadata-time-precision');

const cases = [
  { file: '01-value-date-all-day.ics', expected: 'day' },
  { file: '02-timed-event.ics', expected: 'time' },
  { file: '03-midnight-multi-day.ics', expected: 'day' },
  { file: '04-midnight-short-time.ics', expected: 'time' },
  { file: '05-utc-z-timed.ics', expected: 'time' },
  { file: '06-microsoft-all-day-flag.ics', expected: 'day' },
  { file: '07-tzid-europe-paris-timed.ics', expected: 'time', expectedIso: '2027-03-10T20:10:00.000Z' }
];

function parseFixture(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const block = extractEventBlock(content);
  if (!block) {
    throw new Error(`BEGIN:VEVENT/END:VEVENT introuvable dans ${path.basename(filePath)}`);
  }

  const unfolded = block.replace(/\r?\n[ \t]/g, '');
  const summary = extractSummary(unfolded);
  const dtstart = parseDateToken(unfolded, 'DTSTART');
  const dtend = parseDateToken(unfolded, 'DTEND');
  const hasMicrosoftAllDay = /X-MICROSOFT-CDO-ALLDAYEVENT:TRUE/i.test(unfolded);

  if (!dtstart?.parsedDate) {
    throw new Error(`DTSTART invalide ou absent dans ${path.basename(filePath)}`);
  }

  return {
    summary,
    start: dtstart.parsedDate,
    end: dtend?.parsedDate,
    dtstart,
    dtend,
    hasMicrosoftAllDay
  };
}

function extractEventBlock(content) {
  const start = content.indexOf('BEGIN:VEVENT');
  const end = content.indexOf('END:VEVENT');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return content.slice(start, end);
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
  if (/^\d{8}$/.test(value)) {
    return new Date(
      Number.parseInt(value.slice(0, 4), 10),
      Number.parseInt(value.slice(4, 6), 10) - 1,
      Number.parseInt(value.slice(6, 8), 10)
    );
  }

  if (/^\d{8}T\d{6}Z?$/.test(value)) {
    const year = Number.parseInt(value.slice(0, 4), 10);
    const month = Number.parseInt(value.slice(4, 6), 10) - 1;
    const day = Number.parseInt(value.slice(6, 8), 10);
    const hour = Number.parseInt(value.slice(9, 11), 10);
    const minute = Number.parseInt(value.slice(11, 13), 10);
    const second = Number.parseInt(value.slice(13, 15), 10);

    if (value.endsWith('Z')) {
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    }

    if (timeZoneId) {
      return createDateInTimeZone({ year, month, day, hour, minute, second }, timeZoneId);
    }

    return new Date(year, month, day, hour, minute, second);
  }

  return undefined;
}

function extractTimeZoneId(rawParams) {
  const match = rawParams.match(/;TZID=([^;:]+)/i);
  return match?.[1]?.trim();
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

function run() {
  const failures = [];

  for (const testCase of cases) {
    const filePath = path.join(fixturesDir, testCase.file);
    const event = parseFixture(filePath);
    const decision = detectTimePrecision(event);
    const precisionPassed = decision.precision === testCase.expected;
    const isoPassed = !testCase.expectedIso || event.start.toISOString() === testCase.expectedIso;
    const passed = precisionPassed && isoPassed;

    const badge = passed ? 'PASS' : 'FAIL';
    console.log(
      `[${badge}] ${testCase.file} expected=${testCase.expected} got=${decision.precision}` +
      `${testCase.expectedIso ? ` expectedIso=${testCase.expectedIso} gotIso=${event.start.toISOString()}` : ''}` +
      ` rule=${decision.rule} summary="${event.summary}"`
    );

    if (!passed) {
      failures.push(testCase.file);
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} echec(s): ${failures.join(', ')}`);
    process.exit(1);
  }

  console.log(`\nTous les cas timePrecision sont valides (${cases.length}/${cases.length}).`);
}

run();

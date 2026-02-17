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
  { file: '06-microsoft-all-day-flag.ics', expected: 'day' }
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
  const value = (match[2] ?? '').trim();
  const hasValueDateParam = /;VALUE=DATE(?:;|$)/.test(params);
  const isDateOnly = /^\d{8}$/.test(value);
  const timePart = value.match(/^\d{8}T(\d{6})Z?$/)?.[1];
  const isMidnightValue = isDateOnly || timePart === '000000';
  const parsedDate = parseDateValue(value);

  return {
    value,
    hasValueDateParam,
    isDateOnly,
    isMidnightValue,
    parsedDate
  };
}

function parseDateValue(value) {
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

    return new Date(year, month, day, hour, minute, second);
  }

  return undefined;
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
    const passed = decision.precision === testCase.expected;

    const badge = passed ? 'PASS' : 'FAIL';
    console.log(
      `[${badge}] ${testCase.file} expected=${testCase.expected} got=${decision.precision} rule=${decision.rule} summary="${event.summary}"`
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

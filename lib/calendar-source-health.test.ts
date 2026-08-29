import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  getCalendarCacheControlHeader,
  getCalendarCachePolicy,
  getMapping,
} from './calendar-mappings.ts';
import {
  NASCAR_CUP_2027_DATES,
  validateNascarCalendar,
  validateNbaCalendar,
} from './calendar-source-health.ts';

function nbaCalendar(count = 1200): string {
  const events = Array.from({ length: count }, (_, index) => {
    const date = index === 0 ? '20261020' : index === count - 1 ? '20270411' : '20270115';
    return [
      'BEGIN:VEVENT',
      `UID:nba-2026-${index}@fixture-download`,
      `DTSTART:${date}T000000Z`,
      'SUMMARY:NBA 2026/27',
      'END:VEVENT',
    ].join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR', ''].join('\r\n');
}

function nextDateOnlyValue(rawDate: string): string {
  const next = new Date(Date.UTC(
    Number(rawDate.slice(0, 4)),
    Number(rawDate.slice(4, 6)) - 1,
    Number(rawDate.slice(6, 8)) + 1,
  ));
  return `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, '0')}${String(next.getUTCDate()).padStart(2, '0')}`;
}

function nascarCalendar(): string {
  const events = NASCAR_CUP_2027_DATES.map((date, index) => [
    'BEGIN:VEVENT',
    `UID:nascar-cup-event-${index + 1}-2027@facilabo.app`,
    `DTSTART;VALUE=DATE:${date}`,
    `DTEND;VALUE=DATE:${nextDateOnlyValue(date)}`,
    `SUMMARY:NASCAR Cup event ${index + 1}`,
    'END:VEVENT',
  ].join('\r\n'));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR', ''].join('\r\n');
}

test('accepts a complete NBA 2026-27 source with unique stable UIDs', () => {
  assert.equal(validateNbaCalendar(nbaCalendar()), undefined);
});

test('rejects stale, short or duplicate NBA source data', () => {
  assert.match(validateNbaCalendar(nbaCalendar(2)) ?? '', /only 2 events/);
  assert.match(
    validateNbaCalendar(nbaCalendar().replace('DTSTART:20261020', 'DTSTART:20241022')) ?? '',
    /starts on 20241022/
  );
  assert.match(
    validateNbaCalendar(nbaCalendar().replace('nba-2026-1@fixture-download', 'nba-2026-0@fixture-download')) ?? '',
    /duplicate UIDs/
  );
});

test('accepts the exact date-only NASCAR Cup 2027 schedule with unique deterministic UIDs', () => {
  assert.equal(validateNascarCalendar(nascarCalendar()), undefined);
});

test('rejects incomplete, timed, shifted or duplicate NASCAR Cup 2027 data', () => {
  assert.match(
    validateNascarCalendar(nascarCalendar().replace(/BEGIN:VEVENT[\s\S]*?END:VEVENT\r\n/, '')) ?? '',
    /has 38 events/,
  );
  assert.match(
    validateNascarCalendar(nascarCalendar().replace('DTSTART;VALUE=DATE:20270213', 'DTSTART:20270213T120000Z')) ?? '',
    /without UID, date-only DTSTART\/DTEND or SUMMARY/,
  );
  assert.match(
    validateNascarCalendar(nascarCalendar().replace('DTSTART;VALUE=DATE:20270218', 'DTSTART;VALUE=DATE:20270219')) ?? '',
    /ends on 20270219, expected exclusive 20270220/,
  );
  assert.match(
    validateNascarCalendar(nascarCalendar().replace('nascar-cup-event-2-2027', 'nascar-cup-event-1-2027')) ?? '',
    /duplicate UIDs/,
  );
});

test('self-hosted ICS proxy headers bound CDN and stale cache between publications', () => {
  assert.equal(
    getCalendarCacheControlHeader('tennis-atp-majeurs'),
    's-maxage=60, stale-while-revalidate=300',
  );
  assert.equal(getCalendarCachePolicy('tennis-atp-majeurs').inMemoryTtl, 60);
  assert.equal(
    getCalendarCacheControlHeader('f1'),
    's-maxage=3600, stale-while-revalidate=7200',
    'dynamic upstream calendars keep the existing performance policy',
  );

  const vercelConfig = JSON.parse(
    readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
  ) as { headers?: Array<{ source?: string; headers?: Array<{ key?: string; value?: string }> }> };
  const proxyRule = vercelConfig.headers?.find((rule) => rule.source === '/api/v1/calendars/:slug');
  assert.deepEqual(proxyRule?.headers, [
    { key: 'Cache-Control', value: 's-maxage=60, stale-while-revalidate=300' },
  ]);
});

test('Montauban uses its self-hosted PRO D2 calendar without changing other legacy rugby routes', () => {
  assert.deepEqual(getMapping('montauban'), {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/sport/rugby-montauban-2026-27.ics',
    frenchName: 'US Montauban',
    description: 'Les 30 journées de l’US Montauban en PRO D2, saison 2026-2027',
  });
  assert.equal(
    getMapping('toulouse')?.sourceUrl,
    'https://facilabo-api.vercel.app/api/calendar/rugby/toulouse',
  );
  assert.equal(
    getMapping('vannes')?.sourceUrl,
    'https://facilabo-api.vercel.app/api/calendar/rugby/vannes',
  );
});

test('NASCAR uses the self-hosted official 2027 Cup schedule', () => {
  assert.deepEqual(getMapping('nascar'), {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/sport/nascar-cup-2027.ics',
    frenchName: 'NASCAR Cup Series',
    description: 'Les 39 dates officielles de la NASCAR Cup Series 2027, sans horaires ni diffuseurs inventés',
  });

  const healthSource = readFileSync(
    new URL('../api/v1/health/status.ts', import.meta.url),
    'utf8',
  );
  assert.match(healthSource, /url: NASCAR_CALENDARS\.nascar\.sourceUrl/);
  assert.match(healthSource, /validateBody: validateNascarCalendar/);
  assert.doesNotMatch(healthSource, /db8c47ne2bt9qbld2mhdabm0u8/);
});

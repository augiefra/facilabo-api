import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getCalendarCacheControlHeader, getCalendarCachePolicy } from './calendar-mappings.ts';
import { validateNbaCalendar } from './calendar-source-health.ts';

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

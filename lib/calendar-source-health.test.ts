import assert from 'node:assert/strict';
import test from 'node:test';
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

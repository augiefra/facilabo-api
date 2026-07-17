import assert from 'node:assert/strict';
import test from 'node:test';
import { filterVisibleUpdateNotices, type TimedUpdateNotice } from './update-notice-visibility.ts';

const now = new Date('2026-07-17T10:00:00Z');

function notice(
  id: string,
  startsAt: string,
  endsAt: string,
  supersedesIds?: string[]
): TimedUpdateNotice {
  return { id, startsAt, endsAt, supersedesIds };
}

test('keeps only notices inside their validity window', () => {
  const visible = filterVisibleUpdateNotices([
    notice('active', '2026-07-17T09:00:00Z', '2026-07-17T11:00:00Z'),
    notice('future', '2026-07-17T11:00:00Z', '2026-07-17T12:00:00Z'),
    notice('expired', '2026-07-17T08:00:00Z', '2026-07-17T10:00:00Z'),
    notice('invalid', 'invalid', '2026-07-17T12:00:00Z'),
  ], now);

  assert.deepEqual(visible.map((item) => item.id), ['active']);
});

test('an expired replacement still prevents an older notice from returning', () => {
  const visible = filterVisibleUpdateNotices([
    notice('older', '2026-07-17T06:00:00Z', '2026-07-18T10:00:00Z'),
    notice('replacement', '2026-07-17T07:00:00Z', '2026-07-17T08:00:00Z', ['older']),
  ], now);

  assert.deepEqual(visible, []);
});

test('a future replacement does not hide the current notice early', () => {
  const visible = filterVisibleUpdateNotices([
    notice('current', '2026-07-17T06:00:00Z', '2026-07-18T10:00:00Z'),
    notice('future', '2026-07-17T11:00:00Z', '2026-07-18T10:00:00Z', ['current']),
  ], now);

  assert.deepEqual(visible.map((item) => item.id), ['current']);
});

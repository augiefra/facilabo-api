import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOperatorArguments } from './local-events-snapshot-operator';

test('operator defaults to a dry-run and parses bounded GC options', () => {
  assert.deepEqual(parseOperatorArguments(['gc', '--retention-days', '30', '--max-scan', '500', '--max-delete', '20']), {
    command: 'gc',
    dryRun: true,
    retentionMs: 30 * 86_400_000,
    maxScan: 500,
    maxDelete: 20,
  });
  assert.equal(parseOperatorArguments(['gc', '--apply']).dryRun, false);
});

test('operator restore requires target, snapshot and expected ETag', () => {
  assert.deepEqual(parseOperatorArguments([
    'restore-current',
    '--target', 'toulouse',
    '--snapshot-id', 'a'.repeat(64),
    '--expected-etag', 'etag-1',
  ]), {
    command: 'restore-current',
    dryRun: true,
    target: 'toulouse',
    snapshotId: 'a'.repeat(64),
    expectedVersion: 'etag-1',
  });
  assert.throws(() => parseOperatorArguments(['restore-current', '--target', 'toulouse']), /Missing required option: --snapshot-id/);
});

test('operator rejects ambiguous mutation flags and unsafe limits', () => {
  assert.throws(() => parseOperatorArguments(['gc', '--apply', '--dry-run']), /only one/);
  assert.throws(() => parseOperatorArguments(['gc', '--max-scan', '0']), /Invalid value/);
  assert.throws(() => parseOperatorArguments(['gc', '--unexpected', '1']), /Invalid operator option/);
});

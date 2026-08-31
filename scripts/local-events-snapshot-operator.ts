import {
  restoreLocalEventsCurrentPointer,
  runLocalEventsGarbageCollection,
  VercelBlobLocalEventsSnapshotStore,
} from '../lib/local-events-snapshot';

export type LocalEventsSnapshotOperatorArguments =
  | {
    command: 'gc';
    dryRun: boolean;
    retentionMs?: number;
    maxScan?: number;
    maxDelete?: number;
  }
  | {
    command: 'restore-current';
    dryRun: boolean;
    target: string;
    snapshotId: string;
    expectedVersion: string;
  };

export function parseOperatorArguments(argv: string[]): LocalEventsSnapshotOperatorArguments {
  const [command, ...flags] = argv;
  if (command !== 'gc' && command !== 'restore-current') throw new Error('Usage: gc | restore-current');
  let dryRun = true;
  let applySeen = false;
  let dryRunSeen = false;
  const values = new Map<string, string>();
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (flag === '--apply') {
      applySeen = true;
      dryRun = false;
      continue;
    }
    if (flag === '--dry-run') {
      dryRunSeen = true;
      dryRun = true;
      continue;
    }
    const match = flag.match(/^(--[a-z-]+)=(.*)$/);
    if (match) {
      values.set(match[1], match[2]);
      continue;
    }
    if (!/^--[a-z-]+$/.test(flag) || index + 1 >= flags.length || flags[index + 1].startsWith('--')) {
      throw new Error(`Invalid operator option: ${flag}`);
    }
    values.set(flag, flags[index + 1]);
    index += 1;
  }
  if (applySeen && dryRunSeen) throw new Error('Use only one of --apply or --dry-run');

  if (command === 'gc') {
    rejectUnknown(values, new Set(['--retention-days', '--max-scan', '--max-delete']));
    return {
      command,
      dryRun,
      retentionMs: values.has('--retention-days') ? parseRetentionMs(values.get('--retention-days')!) : undefined,
      maxScan: values.has('--max-scan') ? parsePositiveInteger(values.get('--max-scan')!, '--max-scan') : undefined,
      maxDelete: values.has('--max-delete') ? parsePositiveInteger(values.get('--max-delete')!, '--max-delete') : undefined,
    };
  }

  rejectUnknown(values, new Set(['--target', '--snapshot-id', '--expected-etag']));
  const target = requiredValue(values, '--target');
  const snapshotId = requiredValue(values, '--snapshot-id');
  const expectedVersion = requiredValue(values, '--expected-etag');
  return { command, dryRun, target, snapshotId, expectedVersion };
}

function rejectUnknown(values: Map<string, string>, allowed: Set<string>): void {
  for (const key of values.keys()) if (!allowed.has(key)) throw new Error(`Invalid operator option: ${key}`);
}

function requiredValue(values: Map<string, string>, key: string): string {
  const value = values.get(key)?.trim();
  if (!value) throw new Error(`Missing required option: ${key}`);
  return value;
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`Invalid value for ${flag}`);
  return parsed;
}

function parseRetentionMs(value: string): number {
  const days = Number(value);
  if (!Number.isSafeInteger(days) || days < 0 || days > Math.floor(Number.MAX_SAFE_INTEGER / 86_400_000)) {
    throw new Error('Invalid value for --retention-days');
  }
  return days * 86_400_000;
}

async function main(): Promise<void> {
  const parsed = parseOperatorArguments(process.argv.slice(2));
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN is required');
  const store = new VercelBlobLocalEventsSnapshotStore(token);
  if (parsed.command === 'gc') {
    const result = await runLocalEventsGarbageCollection(store, {
      dryRun: parsed.dryRun,
      retentionMs: parsed.retentionMs,
      maxScan: parsed.maxScan,
      maxDelete: parsed.maxDelete,
    });
    console.log(JSON.stringify(result));
    return;
  }
  const result = await restoreLocalEventsCurrentPointer(store, {
    target: parsed.target,
    snapshotId: parsed.snapshotId,
    expectedVersion: parsed.expectedVersion,
    dryRun: parsed.dryRun,
  });
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  main().catch(() => {
    // Keep Blob tokens and provider URLs out of operator output. The JSON result
    // is the machine-readable handoff on success; failures are intentionally
    // represented by a stable, non-sensitive status line.
    console.error('LOCAL_EVENTS_OPERATOR_FAILED');
    process.exitCode = 1;
  });
}

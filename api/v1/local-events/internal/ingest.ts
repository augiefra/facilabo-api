import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '../../../../lib/vercel-http';
import {
  LOCAL_EVENTS_SNAPSHOT_TARGETS,
  localEventsSnapshotStore,
  stepLocalEventsIngestion,
} from '../../../../lib/local-events-snapshot';

const TARGETS_PER_INVOCATION = 2;
const MAX_PAGES_PER_TARGET = 8;
const TARGET_BUDGET_MS = 20_000;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function authorized(req: VercelRequest, secret: string): boolean {
  const supplied = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  const left = Buffer.from(supplied);
  const right = Buffer.from(secret);
  return left.length === right.length && timingSafeEqual(left, right);
}

function scheduledTargets(now: Date): string[] {
  const shard = Math.floor(now.getTime() / 60_000) % LOCAL_EVENTS_SNAPSHOT_TARGETS.length;
  return Array.from({ length: TARGETS_PER_INVOCATION }, (_, offset) =>
    LOCAL_EVENTS_SNAPSHOT_TARGETS[(shard + offset) % LOCAL_EVENTS_SNAPSHOT_TARGETS.length]);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return res.status(503).json({
      error: 'Local-events ingestion is not configured',
      qualification: 'fail-closed',
      blocker: 'CRON_SECRET_UNAVAILABLE',
    });
  }
  if (!authorized(req, secret)) return res.status(401).json({ error: 'Unauthorized' });

  const requestedTarget = first(req.query.target)?.trim();
  if (requestedTarget && !LOCAL_EVENTS_SNAPSHOT_TARGETS.includes(requestedTarget as typeof LOCAL_EVENTS_SNAPSHOT_TARGETS[number])) {
    return res.status(400).json({ error: 'Unsupported local-events target' });
  }
  const now = new Date();
  const targets = requestedTarget ? [requestedTarget] : scheduledTargets(now);
  const store = localEventsSnapshotStore();
  const results = await Promise.all(targets.map((target) => stepLocalEventsIngestion({
    target,
    store,
    maxPages: MAX_PAGES_PER_TARGET,
    budgetMs: TARGET_BUDGET_MS,
    now,
  }).catch((error) => {
    const blocker = error instanceof Error ? error.message : 'INGESTION_FAILED';
    console.error(JSON.stringify({
      event: 'local-events-ingestion-failed',
      target,
      blocker,
    }));
    return {
      target,
      phase: 'blocked' as const,
      pagesProcessed: 0,
      promoted: false,
      storage: store.storage,
      blockers: [blocker],
      restarted: false,
    };
  })));

  const normalProgress = results.some((result) => result.promoted
    || result.pagesProcessed > 0
    || ['discovery', 'events', 'finalizing'].includes(result.phase));
  const globallyUnavailable = results.every((result) => ['store-unavailable', 'source-unavailable'].includes(result.phase));
  const status = normalProgress ? 200 : globallyUnavailable ? 503 : 422;
  if (status >= 400) {
    console.warn(JSON.stringify({
      event: 'local-events-ingestion-no-progress',
      status,
      targets,
      results,
    }));
  }
  return res.status(status).json({
    contractVersion: '2026-08-31.local-events-ingest-v1',
    generatedAt: now.toISOString(),
    outcome: results.every((result) => result.promoted) ? 'accepted' : normalProgress ? 'partial' : 'failed',
    bounds: {
      targetsPerInvocation: TARGETS_PER_INVOCATION,
      concurrency: TARGETS_PER_INVOCATION,
      maxPagesPerTarget: MAX_PAGES_PER_TARGET,
      targetBudgetMs: TARGET_BUDGET_MS,
    },
    storage: store.storage,
    results,
  });
}

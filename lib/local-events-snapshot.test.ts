import assert from 'node:assert/strict';
import test from 'node:test';
import calendarProxyHandler from '../api/v1/calendars/[slug]';
import calendarMetadataHandler from '../api/v1/calendars/metadata/[slug]';
import ingestHandler from '../api/v1/local-events/internal/ingest';
import localEventsHandler from '../api/v1/local-events';
import localEventsIcsHandler from '../api/v1/local-events/ics/[target]';
import {
  createOpenAgendaPageFetcher,
  getAcceptedLocalEventsSnapshot,
  localEventsTargetFromSourceUrl,
  MemoryLocalEventsSnapshotStore,
  planLocalEventsGarbageCollection,
  projectAcceptedLocalEventsResponse,
  restoreLocalEventsCurrentPointer,
  runLocalEventsGarbageCollection,
  VercelBlobLocalEventsSnapshotStore,
  resetLocalEventsSnapshotStoreForTests,
  setLocalEventsSnapshotStoreForTests,
  stepLocalEventsIngestion,
  type OpenAgendaPageFetcher,
  type LocalEventsSnapshotMaintenanceStore,
  type LocalEventsSnapshotStore,
} from './local-events-snapshot';
import type { VercelRequest, VercelResponse } from './vercel-http';
import { getLocalEventTarget, localEventSourceAgendaUids, localEventsEventDigest } from './local-events';
import type { LocalEventsStorageState } from './local-events';

const referenceDate = new Date('2030-01-01T00:00:00.000Z');

class TestDurableStore implements LocalEventsSnapshotMaintenanceStore {
  readonly storage: LocalEventsStorageState = { adapter: 'vercel-blob-private', configured: true, durable: true };
  private readonly objects = new Map<string, { raw: string; version: number }>();
  private readonly uploadedAt = new Map<string, string>();
  pageReadCount = 0;
  failNextSnapshotWrite = false;
  failNextSnapshotRead = false;
  failNextCurrentWrite = false;
  failNextCurrentReadBack = false;
  private currentReadBackArmed = false;

  async readJson<T>(key: string): Promise<T | undefined> {
    if (this.failNextSnapshotRead && key.includes('/snapshots/')) {
      this.failNextSnapshotRead = false;
      throw new Error('Injected snapshot read-back failure');
    }
    return (await this.readJsonVersioned<T>(key))?.value;
  }

  async readJsonVersioned<T>(key: string): Promise<{ value: T; version: string } | undefined> {
    if (this.currentReadBackArmed && key.includes('/current/')) {
      this.currentReadBackArmed = false;
      this.failNextCurrentReadBack = false;
      throw new Error('Injected current read-back failure');
    }
    if (key.includes('/pages/')) this.pageReadCount += 1;
    const item = this.objects.get(key);
    return item ? { value: JSON.parse(item.raw) as T, version: String(item.version) } : undefined;
  }

  async writeJson(key: string, value: unknown, options: { overwrite?: boolean } = {}): Promise<string> {
    if (this.failNextSnapshotWrite && key.includes('/snapshots/')) {
      this.failNextSnapshotWrite = false;
      throw new Error('Injected snapshot write failure');
    }
    const existing = this.objects.get(key);
    const raw = JSON.stringify(value);
    if (options.overwrite === false && existing) {
      if (existing.raw !== raw) throw new Error(`IMMUTABLE_BLOB_CONFLICT:${key}`);
      return String(existing.version);
    }
    const version = (existing?.version ?? 0) + 1;
    this.objects.set(key, { raw, version });
    if (!this.uploadedAt.has(key)) this.uploadedAt.set(key, new Date().toISOString());
    return String(version);
  }

  async compareAndSwapJson(key: string, value: unknown, expectedVersion?: string): Promise<string> {
    if (this.failNextCurrentWrite && key.includes('/current/')) {
      this.failNextCurrentWrite = false;
      throw new Error('Injected current pointer failure');
    }
    const existing = this.objects.get(key);
    if ((existing ? String(existing.version) : undefined) !== expectedVersion) throw new Error('SNAPSHOT_CAS_CONFLICT');
    const version = await this.writeJson(key, value, { overwrite: true });
    if (this.failNextCurrentReadBack && key.includes('/current/')) this.currentReadBackArmed = true;
    return version;
  }

  async deleteJson(key: string, expectedVersion: string): Promise<void> {
    const existing = this.objects.get(key);
    if (!existing || String(existing.version) !== expectedVersion) throw new Error('SNAPSHOT_CAS_CONFLICT');
    this.objects.delete(key);
    this.uploadedAt.delete(key);
  }

  async listBlobs(prefix: string, cursor?: string, limit = 1_000) {
    const paths = [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
    const start = cursor === undefined ? 0 : Number(cursor);
    assert.ok(Number.isSafeInteger(start) && start >= 0);
    const page = paths.slice(start, start + limit);
    const next = start + page.length;
    return {
      blobs: page.map((pathname) => ({
        pathname,
        etag: String(this.objects.get(pathname)!.version),
        size: Buffer.byteLength(this.objects.get(pathname)!.raw),
        uploadedAt: this.uploadedAt.get(pathname) ?? referenceDate.toISOString(),
      })),
      cursor: next < paths.length ? String(next) : undefined,
      hasMore: next < paths.length,
    };
  }

  setUploadedAt(key: string, uploadedAt: Date): void {
    assert.ok(this.objects.has(key), `Missing object ${key}`);
    this.uploadedAt.set(key, uploadedAt.toISOString());
  }

  async versionOf(key: string): Promise<string | undefined> {
    return (await this.readJsonVersioned<unknown>(key))?.version;
  }

  mutateCurrent(target: string, snapshotId: string): void {
    const key = `local-events/v3/current/${target}.json`;
    const existing = this.objects.get(key);
    assert.ok(existing, `Missing current pointer for ${target}`);
    const value = JSON.parse(existing.raw) as Record<string, unknown>;
    value.snapshotId = snapshotId;
    existing.raw = JSON.stringify(value);
    existing.version += 1;
  }

  tamper(keyPart: string, mutate: (value: Record<string, unknown>) => void): void {
    const entry = Array.from(this.objects.entries()).find(([key]) => key.includes(keyPart));
    assert.ok(entry, `Missing object matching ${keyPart}`);
    const value = JSON.parse(entry[1].raw) as Record<string, unknown>;
    mutate(value);
    entry[1].raw = JSON.stringify(value);
  }
}

function event(uid: string, day: number) {
  return {
    uid,
    title: `Event ${uid}`,
    timings: [{
      begin: new Date(Date.UTC(2030, 0, day, 10)).toISOString(),
      end: new Date(Date.UTC(2030, 0, day, 12)).toISOString(),
    }],
    location: { name: 'Lieu test', city: 'Toulouse' },
  };
}

function completeFetcher(eventDays = [2, 4, 8, 16, 24, 32]): OpenAgendaPageFetcher {
  return {
    async fetchAgendaPage(_target, _term, cursor) {
      assert.equal(cursor, null);
      return { payload: { agendas: [{ uid: 42, title: { fr: 'Agenda test' } }], after: null }, items: [{ uid: 42, title: { fr: 'Agenda test' } }], nextCursor: null, total: 1 };
    },
    async fetchEventPage(_target, _agenda, cursor) {
      const second = cursor?.[0] === 'event-page-2';
      const days = second ? eventDays.slice(3) : eventDays.slice(0, 3);
      const items = days.map((day, index) => event(`${second ? 'b' : 'a'}-${index}`, day));
      const nextCursor = second ? null : ['event-page-2'];
      return { payload: { events: items, after: nextCursor, total: eventDays.length }, items, nextCursor, total: eventDays.length };
    },
  };
}

function manyEventsFetcher(count = 45): OpenAgendaPageFetcher {
  const items = Array.from({ length: count }, (_, index) => event(`many-${index}`, index + 2));
  return {
    async fetchAgendaPage(_target, _term, cursor) {
      assert.equal(cursor, null);
      return { payload: { agendas: [{ uid: 42, title: { fr: 'Agenda test' } }], after: null }, items: [{ uid: 42, title: { fr: 'Agenda test' } }], nextCursor: null, total: 1 };
    },
    async fetchEventPage(_target, _agenda, cursor) {
      assert.equal(cursor, null);
      return { payload: { events: items, after: null, total: count }, items, nextCursor: null, total: count };
    },
  };
}

async function finish(target: string, store: LocalEventsSnapshotStore, fetcher: OpenAgendaPageFetcher, now = referenceDate) {
  let result = await stepLocalEventsIngestion({ target, store, fetcher, maxPages: 1, now });
  for (let index = 0; index < 30 && !['accepted', 'blocked'].includes(result.phase); index += 1) {
    result = await stepLocalEventsIngestion({ target, store, fetcher, maxPages: 1, now });
  }
  return result;
}

async function makeSupersededSnapshot() {
  const store = new TestDurableStore();
  await finish('toulouse', store, completeFetcher(), referenceDate);
  const first = await getAcceptedLocalEventsSnapshot('toulouse', store, referenceDate);
  if (!first) throw new Error('first snapshot was not accepted');
  const oldUploadedAt = new Date('2029-01-01T00:00:00.000Z');
  store.setUploadedAt(`local-events/v3/snapshots/toulouse/${first.snapshot.snapshotId}.json`, oldUploadedAt);
  for (const hash of first.snapshot.pageHashes) store.setUploadedAt(`local-events/v3/pages/${hash}.json`, oldUploadedAt);

  const later = new Date('2030-01-01T01:00:00.000Z');
  await finish('toulouse', store, completeFetcher(), later);
  const second = await getAcceptedLocalEventsSnapshot('toulouse', store, later);
  if (!second) throw new Error('second snapshot was not accepted');
  return { store, first, second, later };
}

function fakeHttp(query: Record<string, string>, headers: Record<string, string> = {}) {
  const state: { status?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const req = { method: 'GET', query, headers, cookies: {}, body: undefined, socket: {} } as unknown as VercelRequest;
  const res = {
    status(code: number) { state.status = code; return this; },
    json(body: unknown) { state.body = body; return this; },
    send(body: unknown) { state.body = body; return this; },
    end() { return this; },
    setHeader(name: string, value: string | number | readonly string[]) { state.headers[name.toLowerCase()] = String(value); return this; },
  } as unknown as VercelResponse;
  return { req, res, state };
}

test('multi-page run resumes by cursor and promotes one convergent accepted snapshot', async () => {
  const store = new TestDurableStore();
  const result = await finish('toulouse', store, completeFetcher());
  assert.equal(result.phase, 'accepted');
  assert.equal(result.promoted, true);
  const accepted = await getAcceptedLocalEventsSnapshot('toulouse', store, referenceDate);
  assert.ok(accepted);
  assert.equal(accepted.response.events.length, 6);
  assert.equal(accepted.response.contractVersion, '2026-08-31.local-events-v3');
  assert.equal(accepted.response.coverage.agendaDiscoveryPagesFetched, 4);
  assert.equal(accepted.response.coverage.eventPagesFetched, 2);
  assert.equal(accepted.response.coverage.beforeFiltering, 6);
  assert.equal(accepted.response.coverage.afterFiltering, 6);
  assert.equal(accepted.response.coverage.cursorsExhausted, true);
  assert.equal(accepted.response.qualification.qualified, true);
  assert.equal(accepted.response.convergence.converged, true);
  assert.equal(accepted.response.convergence.jsonSnapshotId, accepted.response.snapshotId);
  assert.equal((accepted.ics.match(/BEGIN:VEVENT/g) ?? []).length, accepted.response.total);
  assert.match(accepted.ics, new RegExp(`X-FACILABO-SNAPSHOT-ID:${accepted.response.snapshotId}`));
});

test('promotion performs strong page read-back while public reads validate only the snapshot root', async () => {
  const store = new TestDurableStore();
  await finish('toulouse', store, completeFetcher());
  assert.ok(store.pageReadCount > 0);
  store.pageReadCount = 0;
  const accepted = await getAcceptedLocalEventsSnapshot('toulouse', store, referenceDate);
  assert.ok(accepted);
  assert.equal(store.pageReadCount, 0);
});

test('memory fallback is intrinsically non-durable and can never accept a snapshot', async () => {
  const store = new MemoryLocalEventsSnapshotStore();
  assert.deepEqual(store.storage, { adapter: 'memory', configured: false, durable: false });
  const result = await stepLocalEventsIngestion({ target: 'toulouse', store, fetcher: completeFetcher(), now: referenceDate });
  assert.equal(result.phase, 'store-unavailable');
  assert.equal(result.promoted, false);
  assert.equal(await getAcceptedLocalEventsSnapshot('toulouse', store, referenceDate), undefined);
});

test('public calendar mapping resolves to the exact snapshot target without changing routes', () => {
  assert.equal(
    localEventsTargetFromSourceUrl('https://facilabo-api.vercel.app/api/v1/local-events/ics/toulouse-metropole'),
    'toulouse-metropole',
  );
  assert.equal(localEventsTargetFromSourceUrl('https://example.com/agenda.ics'), undefined);
  assert.equal(localEventsTargetFromSourceUrl('https://facilabo-api.vercel.app/api/v1/local-events/ics/allauch'), undefined);
});

test('Arles uses its pinned OpenAgenda source without broad agenda discovery', async () => {
  const store = new TestDurableStore();
  const envName = 'OPENAGENDA_TARGET_RENCONTRES_ARLES_UIDS';
  const previousEnv = process.env[envName];
  process.env[envName] = '   ';
  let eventCalls = 0;
  const fetcher: OpenAgendaPageFetcher = {
    async fetchAgendaPage() {
      throw new Error('pinned Arles source must bypass agenda discovery');
    },
    async fetchEventPage(target, agenda, cursor) {
      eventCalls += 1;
      assert.equal(target.slug, 'rencontres-arles');
      assert.equal(String(agenda.uid), '99501607');
      assert.equal(cursor, null);
      const items = [2, 4, 8, 16, 24, 32].map((day, index) => event(`arles-${index}`, day));
      return { payload: { events: items, after: null, total: items.length }, items, nextCursor: null, total: items.length };
    },
  };

  try {
    const result = await finish('rencontres-arles', store, fetcher);
    assert.equal(result.phase, 'accepted');
    assert.equal(eventCalls, 1);
    const accepted = await getAcceptedLocalEventsSnapshot('rencontres-arles', store, referenceDate);
    assert.equal(accepted?.response.coverage.agendasDiscovered, 1);
    assert.equal(accepted?.response.coverage.agendaDiscoveryPagesFetched, 0);
    assert.equal(accepted?.response.coverage.eventPagesFetched, 1);
    assert.equal(accepted?.response.qualification.qualified, true);
  } finally {
    if (previousEnv === undefined) delete process.env[envName];
    else process.env[envName] = previousEnv;
  }
});

test('source UID changes restart an active run and invalid overrides fail closed', async () => {
  const target = getLocalEventTarget('rencontres-arles');
  assert.ok(target);
  const envName = 'OPENAGENDA_TARGET_RENCONTRES_ARLES_UIDS';
  const previousEnv = process.env[envName];
  const store = new TestDurableStore();
  try {
    process.env[envName] = '111';
    const first = await stepLocalEventsIngestion({
      target: 'rencontres-arles',
      store,
      maxPages: 1,
      now: referenceDate,
      fetcher: {
        async fetchAgendaPage() { throw new Error('pinned source must bypass discovery'); },
        async fetchEventPage(_target, agenda) {
          assert.equal(String(agenda.uid), '111');
          const items = [2, 4, 8].map((day, index) => event(`old-${index}`, day));
          return { payload: { events: items, after: ['next'], total: 6 }, items, nextCursor: ['next'], total: 6 };
        },
      },
    });
    assert.equal(first.phase, 'events');

    process.env[envName] = '222';
    const second = await stepLocalEventsIngestion({
      target: 'rencontres-arles',
      store,
      maxPages: 1,
      now: referenceDate,
      fetcher: {
        async fetchAgendaPage() { throw new Error('pinned source must bypass discovery'); },
        async fetchEventPage(_target, agenda, cursor) {
          assert.equal(String(agenda.uid), '222');
          assert.equal(cursor, null);
          const items = [2, 4, 8, 16, 24, 32].map((day, index) => event(`new-${index}`, day));
          return { payload: { events: items, after: null, total: items.length }, items, nextCursor: null, total: items.length };
        },
      },
    });
    assert.equal(second.restarted, true);

    process.env[envName] = 'not-a-uid';
    assert.throws(() => localEventSourceAgendaUids(target), /INVALID_OPENAGENDA_SOURCE_UIDS:rencontres-arles/);
  } finally {
    if (previousEnv === undefined) delete process.env[envName];
    else process.env[envName] = previousEnv;
  }
});

test('proxy and metadata consume the same accepted snapshot without a distinct upstream collection', async () => {
  const store = new TestDurableStore();
  await finish('toulouse', store, completeFetcher());
  setLocalEventsSnapshotStoreForTests(store);
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    throw new Error('unexpected distinct collection');
  };
  try {
    const proxy = fakeHttp({ slug: 'sorties-ville-toulouse' });
    await calendarProxyHandler(proxy.req, proxy.res);
    const metadata = fakeHttp({ slug: 'sorties-ville-toulouse' });
    await calendarMetadataHandler(metadata.req, metadata.res);
    assert.equal(proxy.state.status, 200);
    assert.equal(metadata.state.status, 200);
    assert.equal(upstreamCalls, 0);
    assert.equal(proxy.state.headers['cache-control'], 'no-store');
    assert.equal(metadata.state.headers['cache-control'], 'no-store');
    assert.equal(proxy.state.headers['x-facilabo-snapshot-id'], metadata.state.headers['x-facilabo-snapshot-id']);
    assert.equal(proxy.state.headers.etag, undefined);
    assert.equal(metadata.state.headers.etag, undefined);
    assert.equal(proxy.state.headers['x-facilabo-event-digest'], metadata.state.headers['x-facilabo-event-digest']);
    // The fixture is dated in 2030 while the route uses the real clock: negative
    // age must be surfaced fail-closed instead of being clamped to fresh.
    assert.equal(proxy.state.headers['x-facilabo-local-events-state'], 'stale');
    assert.equal(metadata.state.headers['x-facilabo-local-events-state'], 'stale');
    const metadataBody = metadata.state.body as { data: { type: string; snapshotId: string; eventDigest: string; eventCount: number; dateRange: { start: string; end: string }; convergence: { metadataSnapshotId: string } } };
    assert.equal(metadataBody.data.type, 'calendar');
    assert.equal(metadataBody.data.snapshotId, proxy.state.headers['x-facilabo-snapshot-id']);
    assert.equal(metadataBody.data.eventDigest, proxy.state.headers['x-facilabo-event-digest']);
    assert.equal(metadataBody.data.convergence.metadataSnapshotId, metadataBody.data.snapshotId);
    assert.equal(metadataBody.data.eventCount, 6);
    assert.deepEqual(metadataBody.data.dateRange, { start: '2030-01-02', end: '2030-02-01' });
  } finally {
    globalThis.fetch = originalFetch;
    resetLocalEventsSnapshotStoreForTests();
  }
});

test('all four accepted local-event surfaces expose one snapshot identity and digest', async () => {
  const store = new TestDurableStore();
  await finish('toulouse', store, completeFetcher());
  setLocalEventsSnapshotStoreForTests(store);
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    throw new Error('unexpected upstream read');
  };
  try {
    const json = fakeHttp({ target: 'toulouse' });
    await localEventsHandler(json.req, json.res);
    const ics = fakeHttp({ target: 'toulouse' });
    await localEventsIcsHandler(ics.req, ics.res);
    const proxy = fakeHttp({ slug: 'sorties-ville-toulouse' });
    await calendarProxyHandler(proxy.req, proxy.res);
    const metadata = fakeHttp({ slug: 'sorties-ville-toulouse' });
    await calendarMetadataHandler(metadata.req, metadata.res);

    assert.equal(json.state.status, 200);
    assert.equal(ics.state.status, 200);
    assert.equal(proxy.state.status, 200);
    assert.equal(metadata.state.status, 200);
    assert.equal(upstreamCalls, 0);
    const snapshotIds = [
      json.state.headers['x-facilabo-snapshot-id'],
      ics.state.headers['x-facilabo-snapshot-id'],
      proxy.state.headers['x-facilabo-snapshot-id'],
      metadata.state.headers['x-facilabo-snapshot-id'],
    ];
    assert.ok(snapshotIds[0]);
    assert.ok(snapshotIds.every((value) => value === snapshotIds[0]));
    const snapshotDigests = [
      json.state.headers['x-facilabo-snapshot-event-digest'],
      ics.state.headers['x-facilabo-snapshot-event-digest'],
      proxy.state.headers['x-facilabo-snapshot-event-digest'],
      metadata.state.headers['x-facilabo-snapshot-event-digest'],
    ];
    assert.ok(snapshotDigests[0]);
    assert.ok(snapshotDigests.every((value) => value === snapshotDigests[0]));
    const eventDigests = [
      json.state.headers['x-facilabo-event-digest'],
      ics.state.headers['x-facilabo-event-digest'],
      proxy.state.headers['x-facilabo-event-digest'],
      metadata.state.headers['x-facilabo-event-digest'],
    ];
    assert.ok(eventDigests[0]);
    assert.ok(eventDigests.every((value) => value === eventDigests[0]));
    for (const surface of [json, ics, proxy, metadata]) assert.equal(surface.state.headers['cache-control'], 'no-store');
  } finally {
    globalThis.fetch = originalFetch;
    resetLocalEventsSnapshotStoreForTests();
  }
});

test('proxy and metadata fallback never report fresh or qualified without snapshot identity', async () => {
  const store = new MemoryLocalEventsSnapshotStore();
  setLocalEventsSnapshotStoreForTests(store);
  const originalFetch = globalThis.fetch;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'X-FACILABO-QUALIFIED:FALSE',
    'BEGIN:VEVENT', 'UID:fallback', 'DTSTART:20300115T100000Z', 'DTEND:20300115T110000Z',
    'SUMMARY:Fallback', 'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
  globalThis.fetch = async () => new Response(ics, {
    status: 200,
    headers: {
      'content-type': 'text/calendar',
      'x-facilabo-local-events-qualified': 'false',
      'x-facilabo-local-events-state': 'unavailable',
    },
  });
  try {
    const proxy = fakeHttp({ slug: 'sorties-ville-toulouse' });
    await calendarProxyHandler(proxy.req, proxy.res);
    const metadata = fakeHttp({ slug: 'sorties-ville-toulouse' });
    await calendarMetadataHandler(metadata.req, metadata.res);
    assert.equal(proxy.state.headers['cache-control'], 'no-store');
    assert.equal(proxy.state.headers['x-facilabo-local-events-qualified'], 'false');
    assert.equal(proxy.state.headers['x-facilabo-local-events-state'], 'unavailable');
    assert.match(String(proxy.state.body), /X-FACILABO-QUALIFIED:FALSE/);
    assert.equal(proxy.state.headers['x-facilabo-snapshot-id'], undefined);
    assert.equal(metadata.state.headers['cache-control'], 'no-store');
    assert.equal(metadata.state.headers['x-facilabo-local-events-qualified'], 'false');
    assert.equal(metadata.state.headers['x-facilabo-snapshot-id'], undefined);
    const metadataBody = metadata.state.body as { runtime: { freshness: string; fallbackUsed: boolean } };
    assert.equal(metadataBody.runtime.freshness, 'unavailable');
    assert.equal(metadataBody.runtime.fallbackUsed, true);
  } finally {
    globalThis.fetch = originalFetch;
    resetLocalEventsSnapshotStoreForTests();
  }
});

test('replaying identical pages is content-idempotent without reusing volatile bytes under one key', async () => {
  const store = new TestDurableStore();
  await finish('toulouse', store, completeFetcher());
  const first = await getAcceptedLocalEventsSnapshot('toulouse', store, referenceDate);
  const replay = await finish('toulouse', store, completeFetcher());
  const second = await getAcceptedLocalEventsSnapshot('toulouse', store, referenceDate);
  assert.equal(second?.snapshot.snapshotId, first?.snapshot.snapshotId);
  assert.equal(replay.promoted, false);
  assert.equal(second?.response.contentDigest, first?.response.contentDigest);
  assert.equal(second?.response.eventDigest, first?.response.eventDigest);
});

test('identical upstream bytes fetched at different clocks never collide under one immutable key', async () => {
  const store = new TestDurableStore();
  await finish('toulouse', store, completeFetcher(), referenceDate);
  const first = await getAcceptedLocalEventsSnapshot('toulouse', store, referenceDate);
  const later = new Date('2030-01-01T01:00:00.000Z');
  const replay = await finish('toulouse', store, completeFetcher(), later);
  assert.equal(replay.phase, 'accepted');
  const second = await getAcceptedLocalEventsSnapshot('toulouse', store, later);
  assert.notEqual(second?.snapshot.snapshotId, first?.snapshot.snapshotId);
  assert.equal(second?.response.eventDigest, first?.response.eventDigest);
});

test('immutable fake store rejects different bytes for an existing key', async () => {
  const store = new TestDurableStore();
  await store.writeJson('immutable/test.json', { value: 1 }, { overwrite: false });
  await store.writeJson('immutable/test.json', { value: 1 }, { overwrite: false });
  await assert.rejects(
    store.writeJson('immutable/test.json', { value: 2 }, { overwrite: false }),
    /IMMUTABLE_BLOB_CONFLICT/,
  );
});

test('upstream total remains authoritative even when after is null', async () => {
  const store = new TestDurableStore();
  const fetcher: OpenAgendaPageFetcher = {
    async fetchAgendaPage() {
      const items = [{ uid: 42, title: { fr: 'Agenda incomplet' } }];
      return { payload: { agendas: items, after: null, total: 1 }, items, nextCursor: null, total: 1 };
    },
    async fetchEventPage() {
      const items = [2, 4, 8, 16, 24].map((day, index) => event(`short-${index}`, day));
      return { payload: { events: items, after: null, total: 999 }, items, nextCursor: null, total: 999 };
    },
  };
  const result = await finish('toulouse', store, fetcher);
  assert.equal(result.phase, 'blocked');
  assert.ok(result.blockers.includes('UPSTREAM_TOTAL_INCOMPLETE:42:5/999'));
  assert.equal(await getAcceptedLocalEventsSnapshot('toulouse', store, referenceDate), undefined);
});

test('discovery fails closed when a terminal agenda page under-reports its upstream total', async () => {
  const store = new TestDurableStore();
  const fetcher: OpenAgendaPageFetcher = {
    async fetchAgendaPage() {
      const items = [{ uid: 42, title: { fr: 'Agenda incomplet' } }];
      return { payload: { agendas: items, after: null, total: 2 }, items, nextCursor: null, total: 2 };
    },
    async fetchEventPage() { throw new Error('event phase must not start'); },
  };
  const result = await finish('toulouse', store, fetcher);
  assert.equal(result.phase, 'blocked');
  assert.ok(result.blockers.some((blocker) => blocker.startsWith('UPSTREAM_AGENDA_TOTAL_INCOMPLETE:')));
  assert.equal(await getAcceptedLocalEventsSnapshot('toulouse', store, referenceDate), undefined);
});

test('discovery fails closed when an agenda page omits its upstream total', async () => {
  const store = new TestDurableStore();
  const fetcher: OpenAgendaPageFetcher = {
    async fetchAgendaPage() {
      const items = [{ uid: 42, title: { fr: 'Agenda sans total' } }];
      return { payload: { agendas: items, after: null }, items, nextCursor: null };
    },
    async fetchEventPage() { throw new Error('event phase must not start'); },
  };
  const result = await finish('toulouse', store, fetcher);
  assert.equal(result.phase, 'blocked');
  assert.ok(result.blockers.some((blocker) => blocker.startsWith('UPSTREAM_AGENDA_TOTAL_UNAVAILABLE:')));
});

test('discovery fails closed when successive pages disagree on the upstream total', async () => {
  const store = new TestDurableStore();
  const fetcher: OpenAgendaPageFetcher = {
    async fetchAgendaPage(_target, _term, cursor) {
      if (!cursor) {
        const items = [{ uid: 42, title: { fr: 'Agenda page 1' } }];
        return { payload: { agendas: items, after: ['agenda-page-2'], total: 2 }, items, nextCursor: ['agenda-page-2'], total: 2 };
      }
      const items = [{ uid: 43, title: { fr: 'Agenda page 2' } }];
      return { payload: { agendas: items, after: null, total: 3 }, items, nextCursor: null, total: 3 };
    },
    async fetchEventPage() { throw new Error('event phase must not start'); },
  };
  const result = await finish('toulouse', store, fetcher);
  assert.equal(result.phase, 'blocked');
  assert.ok(result.blockers.some((blocker) => blocker.startsWith('UPSTREAM_AGENDA_TOTAL_INCONSISTENT:')));
});

test('expired runs restart from zero and freshness derives from the oldest retained page', async () => {
  const store = new TestDurableStore();
  const fetcher = completeFetcher();
  const first = await stepLocalEventsIngestion({ target: 'toulouse', store, fetcher, maxPages: 1, now: referenceDate });
  const twoDaysLater = new Date('2030-01-03T00:00:00.000Z');
  const restarted = await stepLocalEventsIngestion({ target: 'toulouse', store, fetcher, maxPages: 1, now: twoDaysLater });
  assert.equal(restarted.restarted, true);
  assert.notEqual(restarted.runId, first.runId);
  const manifest = await store.readJson<{ pages: Array<{ fetchedAt: string }> }>('local-events/v3/runs/toulouse/active.json');
  assert.deepEqual(manifest?.pages.map((page) => page.fetchedAt), [twoDaysLater.toISOString()]);

  const freshStore = new TestDurableStore();
  await stepLocalEventsIngestion({ target: 'toulouse', store: freshStore, fetcher, maxPages: 1, now: referenceDate });
  const twentyThreeHoursLater = new Date('2030-01-01T23:00:00.000Z');
  await finish('toulouse', freshStore, fetcher, twentyThreeHoursLater);
  const accepted = await getAcceptedLocalEventsSnapshot('toulouse', freshStore, twentyThreeHoursLater);
  assert.equal(accepted?.response.coverage.snapshotAgeHours, 23);
});

test('accepted snapshot projection honors smaller limits while radius variants stay fail-closed', async () => {
  const store = new TestDurableStore();
  await finish('toulouse', store, completeFetcher());
  setLocalEventsSnapshotStoreForTests(store);
  const originalKey = process.env.OPENAGENDA_PUBLIC_KEY;
  delete process.env.OPENAGENDA_PUBLIC_KEY;
  try {
    const limitRequest = fakeHttp({ target: 'toulouse', limit: '1' });
    await localEventsHandler(limitRequest.req, limitRequest.res);
    const limited = limitRequest.state.body as {
      events: unknown[];
      limit: number;
      requestedLimit?: number;
      snapshotId?: string;
      snapshotEventCount?: number;
      qualification: { qualified: boolean };
    };
    assert.equal(limitRequest.state.status, 200);
    assert.equal(limited.limit, 1);
    assert.equal(limited.requestedLimit, 1);
    assert.equal(limited.events.length, 1);
    assert.equal(limited.snapshotEventCount, 6);
    assert.ok(limited.snapshotId);
    assert.equal(limitRequest.state.headers['x-facilabo-snapshot-id'], limited.snapshotId);
    assert.equal(limitRequest.state.headers['x-facilabo-local-events-qualified'], 'false');

    const radiusRequest = fakeHttp({ target: 'toulouse', radius: '1' });
    await localEventsHandler(radiusRequest.req, radiusRequest.res);
    const fallback = radiusRequest.state.body as { events: unknown[]; snapshotId?: string; qualification: { qualified: boolean } };
    assert.equal(radiusRequest.state.status, 200);
    assert.equal(fallback.snapshotId, undefined);
    assert.equal(fallback.qualification.qualified, false);
    assert.equal(radiusRequest.state.headers['x-facilabo-snapshot-id'], undefined);
    assert.equal(radiusRequest.state.headers['x-facilabo-local-events-state'], 'unavailable');
  } finally {
    if (originalKey === undefined) delete process.env.OPENAGENDA_PUBLIC_KEY;
    else process.env.OPENAGENDA_PUBLIC_KEY = originalKey;
    resetLocalEventsSnapshotStoreForTests();
  }
});

test('limit=40 preserves snapshot identity for snapshots smaller and larger than the request', async () => {
  const originalKey = process.env.OPENAGENDA_PUBLIC_KEY;
  delete process.env.OPENAGENDA_PUBLIC_KEY;
  try {
    const smallStore = new TestDurableStore();
    await finish('toulouse', smallStore, completeFetcher());
    const smallAccepted = await getAcceptedLocalEventsSnapshot('toulouse', smallStore, referenceDate);
    assert.ok(smallAccepted);
    setLocalEventsSnapshotStoreForTests(smallStore);
    const smallRequest = fakeHttp({ target: 'toulouse', limit: '40' });
    await localEventsHandler(smallRequest.req, smallRequest.res);
    const smallBody = smallRequest.state.body as {
      events: Array<Record<string, unknown>>;
      total: number;
      limit: number;
      requestedLimit?: number;
      snapshotId?: string;
      snapshotEventCount?: number;
      snapshotEventDigest?: string;
      eventDigest?: string;
    };
    assert.equal(smallRequest.state.status, 200);
    assert.equal(smallBody.events.length, 6);
    assert.equal(smallBody.total, 6);
    assert.equal(smallBody.limit, 40);
    assert.equal(smallBody.requestedLimit, 40);
    assert.equal(smallBody.snapshotEventCount, 6);
    assert.equal(smallBody.snapshotId, smallAccepted.snapshot.snapshotId);
    assert.equal(smallBody.snapshotEventDigest, smallAccepted.snapshot.eventDigest);
    assert.equal(smallBody.eventDigest, smallAccepted.snapshot.eventDigest);
    const smallCoverage = (smallRequest.state.body as { coverage: { returned: number; limit: number; afterFiltering: number } }).coverage;
    assert.equal(smallCoverage.returned, 6);
    assert.equal(smallCoverage.limit, 6);
    assert.equal(smallCoverage.afterFiltering, 6);
    assert.deepEqual((smallRequest.state.body as { convergence: unknown }).convergence, smallAccepted.response.convergence);
    assert.equal(smallRequest.state.headers['x-facilabo-snapshot-event-digest'], smallAccepted.snapshot.eventDigest);
    const smallProjection = projectAcceptedLocalEventsResponse(smallAccepted.response, 40);
    assert.equal(smallProjection.events.length, 6);
    assert.equal(smallProjection.requestedLimit, 40);
    assert.equal(smallProjection.snapshotEventCount, 6);
    assert.equal(smallProjection.qualification.qualified, true);
    assert.deepEqual(smallProjection.coverage, smallAccepted.response.coverage);
    assert.deepEqual(smallProjection.convergence, smallAccepted.response.convergence);

    const largeStore = new TestDurableStore();
    await finish('toulouse', largeStore, manyEventsFetcher(45));
    const largeAccepted = await getAcceptedLocalEventsSnapshot('toulouse', largeStore, referenceDate);
    assert.ok(largeAccepted);
    setLocalEventsSnapshotStoreForTests(largeStore);
    const largeRequest = fakeHttp({ target: 'toulouse', limit: '40' });
    await localEventsHandler(largeRequest.req, largeRequest.res);
    const largeBody = largeRequest.state.body as {
      events: Array<Record<string, unknown>>;
      total: number;
      limit: number;
      requestedLimit?: number;
      snapshotId?: string;
      snapshotEventCount?: number;
      snapshotEventDigest?: string;
      eventDigest?: string;
      coverage: { returned: number; limit: number; afterFiltering: number };
      convergence: { converged: boolean; jsonEventCount: number; jsonEventDigest?: string };
      qualification: { qualified: boolean };
    };
    assert.equal(largeRequest.state.status, 200);
    assert.equal(largeBody.events.length, 40);
    assert.equal(largeBody.total, 40);
    assert.equal(largeBody.limit, 40);
    assert.equal(largeBody.requestedLimit, 40);
    assert.equal(largeBody.snapshotEventCount, 45);
    assert.equal(largeBody.snapshotId, largeAccepted.snapshot.snapshotId);
    assert.equal(largeBody.snapshotEventDigest, largeAccepted.snapshot.eventDigest);
    assert.equal(largeBody.eventDigest, localEventsEventDigest(largeBody.events as never));
    assert.equal(largeBody.coverage.returned, 45);
    assert.equal(largeBody.coverage.limit, 45);
    assert.equal(largeBody.coverage.afterFiltering, 45);
    assert.equal(largeBody.convergence.converged, true);
    assert.equal(largeBody.convergence.jsonEventCount, 45);
    assert.equal(largeBody.convergence.jsonEventDigest, largeAccepted.snapshot.eventDigest);
    // The fixture is dated in 2030 while the route runs against the real clock;
    // the pure projection itself must nevertheless preserve canonical quality.
    assert.equal(projectAcceptedLocalEventsResponse(largeAccepted.response, 40).qualification.qualified, true);
    assert.equal(projectAcceptedLocalEventsResponse(largeAccepted.response, 40).coverage.returned, 45);
    assert.equal(projectAcceptedLocalEventsResponse(largeAccepted.response, 40).convergence.jsonEventCount, 45);
    assert.equal(largeRequest.state.headers['x-facilabo-snapshot-event-digest'], largeAccepted.snapshot.eventDigest);
    assert.notEqual(largeBody.eventDigest, largeBody.snapshotEventDigest);
  } finally {
    if (originalKey === undefined) delete process.env.OPENAGENDA_PUBLIC_KEY;
    else process.env.OPENAGENDA_PUBLIC_KEY = originalKey;
    resetLocalEventsSnapshotStoreForTests();
  }
});

test('Blob store uses supported cache options and rejects empty versions before unsafe writes', async () => {
  const puts: Array<Record<string, unknown>> = [];
  const loader = async () => ({
    get: async () => null,
    put: async (_key: string, _body: string, options: Record<string, unknown>) => {
      puts.push(options);
      return { etag: 'etag-1' };
    },
    del: async () => undefined,
  }) as never;
  const store = new VercelBlobLocalEventsSnapshotStore('token', loader);
  await store.compareAndSwapJson('local-events/v3/current/test.json', { value: 1 });
  assert.equal(puts.length, 1);
  assert.equal(puts[0].allowOverwrite, false);
  assert.ok(Number(puts[0].cacheControlMaxAge) >= 60);

  await assert.rejects(
    store.compareAndSwapJson('local-events/v3/current/test.json', { value: 2 }, ''),
    /empty version\/ETag/,
  );
  assert.equal(puts.length, 1);

  const emptyEtagStore = new VercelBlobLocalEventsSnapshotStore('token', async () => ({
    get: async () => null,
    put: async () => ({ etag: '' }),
    del: async () => undefined,
  }) as never);
  await assert.rejects(emptyEtagStore.writeJson('test.json', { value: 1 }), /empty version\/ETag/);
});

test('Blob CAS uses the origin metadata ETag while binding it to the downloaded object', async () => {
  const uploadedAt = new Date('2030-01-01T00:00:00.000Z');
  const body = JSON.stringify({ value: 1 });
  const puts: Array<Record<string, unknown>> = [];
  class TestBlobNotFoundError extends Error {}
  const loader = async () => ({
    get: async () => ({
      statusCode: 200,
      stream: new Response(body).body,
      headers: new Headers(),
      blob: {
        url: 'https://example.private.blob.vercel-storage.com/test.json',
        downloadUrl: 'https://example.private.blob.vercel-storage.com/test.json?download=1',
        pathname: 'test.json',
        contentType: 'application/json',
        contentDisposition: 'inline',
        cacheControl: 'public, max-age=60',
        etag: '"delivery-etag"',
        size: body.length + 128,
        uploadedAt,
      },
    }),
    head: async () => ({
      size: body.length,
      uploadedAt,
      pathname: 'test.json',
      contentType: 'application/json',
      contentDisposition: 'inline',
      url: 'https://example.private.blob.vercel-storage.com/test.json',
      downloadUrl: 'https://example.private.blob.vercel-storage.com/test.json?download=1',
      cacheControl: 'public, max-age=60',
      etag: '"origin-etag"',
    }),
    BlobNotFoundError: TestBlobNotFoundError,
    put: async (_key: string, _body: string, options: Record<string, unknown>) => {
      puts.push(options);
      return { etag: '"next-origin-etag"' };
    },
    del: async () => undefined,
  }) as never;
  const store = new VercelBlobLocalEventsSnapshotStore('token', loader);

  const versioned = await store.readJsonVersioned<{ value: number }>('test.json');
  assert.deepEqual(versioned, { value: { value: 1 }, version: '"origin-etag"' });
  await store.compareAndSwapJson('test.json', { value: 2 }, versioned?.version);
  assert.equal(puts[0].ifMatch, '"origin-etag"');
});

test('Blob read fails closed when origin metadata changes around the downloaded bytes', async () => {
  const uploadedAt = new Date('2030-01-01T00:00:00.000Z');
  const body = JSON.stringify({ value: 1 });
  let heads = 0;
  class TestBlobNotFoundError extends Error {}
  const store = new VercelBlobLocalEventsSnapshotStore('token', async () => ({
    get: async () => ({
      statusCode: 200,
      stream: new Response(body).body,
      headers: new Headers(),
      blob: {
        url: 'https://example.private.blob.vercel-storage.com/test.json',
        downloadUrl: 'https://example.private.blob.vercel-storage.com/test.json?download=1',
        pathname: 'test.json', contentType: 'application/json', contentDisposition: 'inline',
        cacheControl: 'public, max-age=60', etag: '"delivery-etag"', size: body.length, uploadedAt,
      },
    }),
    head: async () => ({
      size: body.length, uploadedAt, pathname: 'test.json', contentType: 'application/json',
      contentDisposition: 'inline', url: 'https://example.private.blob.vercel-storage.com/test.json',
      downloadUrl: 'https://example.private.blob.vercel-storage.com/test.json?download=1',
      cacheControl: 'public, max-age=60', etag: heads++ === 0 ? '"etag-1"' : '"etag-2"',
    }),
    BlobNotFoundError: TestBlobNotFoundError,
    put: async () => ({ etag: '"unexpected"' }),
    del: async () => undefined,
  }) as never);

  await assert.rejects(store.readJsonVersioned('test.json'), /BLOB_READ_IDENTITY_MISMATCH/);
});

test('accepted read-back rejects tampered root, counts or content digest', async () => {
  for (const mutate of [
    (value: Record<string, unknown>) => { value.snapshotId = 'tampered'; },
    (value: Record<string, unknown>) => { (value.response as Record<string, unknown>).total = 999; },
    (value: Record<string, unknown>) => { value.contentDigest = 'tampered'; },
  ]) {
    const store = new TestDurableStore();
    await finish('toulouse', store, completeFetcher());
    store.tamper('/snapshots/', mutate);
    assert.equal(await getAcceptedLocalEventsSnapshot('toulouse', store, referenceDate), undefined);
  }
});

test('cron ingest fails closed when auth configuration is missing or bearer is invalid', async () => {
  const originalSecret = process.env.CRON_SECRET;
  try {
    delete process.env.CRON_SECRET;
    const unconfigured = fakeHttp({});
    await ingestHandler(unconfigured.req, unconfigured.res);
    assert.equal(unconfigured.state.status, 503);
    assert.equal(unconfigured.state.headers['cache-control'], 'no-store');
    process.env.CRON_SECRET = 'expected-secret';
    const unauthorized = fakeHttp({}, { authorization: 'Bearer wrong-secret' });
    await ingestHandler(unauthorized.req, unauthorized.res);
    assert.equal(unauthorized.state.status, 401);
    assert.equal(unauthorized.state.headers['cache-control'], 'no-store');

    setLocalEventsSnapshotStoreForTests(new MemoryLocalEventsSnapshotStore());
    const globallyUnavailable = fakeHttp({}, { authorization: 'Bearer expected-secret' });
    await ingestHandler(globallyUnavailable.req, globallyUnavailable.res);
    assert.equal(globallyUnavailable.state.status, 503);
    assert.equal((globallyUnavailable.state.body as { outcome: string }).outcome, 'failed');
  } finally {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
    resetLocalEventsSnapshotStoreForTests();
  }
});

test('sparse or short-horizon candidate never replaces the previous accepted pointer', async () => {
  const store = new TestDurableStore();
  await finish('toulouse', store, completeFetcher());
  const before = await getAcceptedLocalEventsSnapshot('toulouse', store, referenceDate);
  const rejected = await finish('toulouse', store, completeFetcher([2, 3, 4, 5]), new Date('2030-01-01T01:00:00.000Z'));
  assert.equal(rejected.phase, 'blocked');
  assert.ok(rejected.blockers.includes('SPARSE_FUTURE_EVENTS'));
  assert.ok(rejected.blockers.includes('HORIZON_INSUFFICIENT'));
  const after = await getAcceptedLocalEventsSnapshot('toulouse', store, referenceDate);
  assert.equal(after?.snapshot.snapshotId, before?.snapshot.snapshotId);
});

test('horizon gate rejects 13 days and accepts the exact 14-day boundary', async () => {
  const thirteenDayStore = new TestDurableStore();
  const rejected = await finish('toulouse', thirteenDayStore, completeFetcher([2, 4, 6, 8, 14]));
  assert.equal(rejected.phase, 'blocked');
  assert.ok(rejected.blockers.includes('HORIZON_INSUFFICIENT'));

  const fourteenDayStore = new TestDurableStore();
  const accepted = await finish('toulouse', fourteenDayStore, completeFetcher([2, 4, 6, 8, 15]));
  assert.equal(accepted.phase, 'accepted');
  const snapshot = await getAcceptedLocalEventsSnapshot('toulouse', fourteenDayStore, referenceDate);
  assert.equal(snapshot?.response.coverage.horizonDays, 14);
  assert.equal(snapshot?.response.qualification.qualified, true);
});

test('current pointer is written last and a failed promotion preserves the previous snapshot', async () => {
  const store = new TestDurableStore();
  await finish('toulouse', store, completeFetcher());
  const before = await getAcceptedLocalEventsSnapshot('toulouse', store, referenceDate);
  store.failNextCurrentWrite = true;
  await assert.rejects(
    finish('toulouse', store, completeFetcher([3, 7, 11, 17, 25, 35]), new Date('2030-01-02T00:00:00.000Z')),
    /current pointer failure/,
  );
  const after = await getAcceptedLocalEventsSnapshot('toulouse', store, referenceDate);
  assert.equal(after?.snapshot.snapshotId, before?.snapshot.snapshotId);
});

test('snapshot and pointer write/read-back failures all preserve the previous current', async () => {
  const scenarios: Array<[string, (store: TestDurableStore) => void]> = [
    ['snapshot write', (store) => { store.failNextSnapshotWrite = true; }],
    ['snapshot read-back', (store) => { store.failNextSnapshotRead = true; }],
    ['pointer write', (store) => { store.failNextCurrentWrite = true; }],
    ['pointer read-back', (store) => { store.failNextCurrentReadBack = true; }],
  ];
  for (const [name, inject] of scenarios) {
    const store = new TestDurableStore();
    await finish('toulouse', store, completeFetcher(), referenceDate);
    const before = await getAcceptedLocalEventsSnapshot('toulouse', store, referenceDate);
    inject(store);
    await assert.rejects(
      finish('toulouse', store, completeFetcher([3, 7, 11, 17, 25, 35]), new Date('2030-01-02T00:00:00.000Z')),
    );
    const after = await getAcceptedLocalEventsSnapshot('toulouse', store, referenceDate);
    assert.equal(after?.snapshot.snapshotId, before?.snapshot.snapshotId, name);
  }
});

test('GC defaults to dry-run and never selects pages referenced by current or active state', async () => {
  const { store, first, second, later } = await makeSupersededSnapshot();
  const oldSnapshotKey = `local-events/v3/snapshots/toulouse/${first.snapshot.snapshotId}.json`;
  const currentPageKey = `local-events/v3/pages/${second.snapshot.pageHashes[0]}.json`;
  const dryRun = await runLocalEventsGarbageCollection(store, {
    now: new Date('2030-03-01T00:00:00.000Z'),
    retentionMs: 30 * 86_400_000,
  });
  assert.equal(dryRun.plan.dryRun, true);
  assert.equal(dryRun.applied, false);
  assert.equal(dryRun.deleted.length, 0);
  assert.ok(dryRun.plan.candidateSnapshots.some((candidate) => candidate.key === oldSnapshotKey));
  assert.ok(dryRun.plan.candidatePages.every((candidate) => !second.snapshot.pageHashes.some((hash) => candidate.key.endsWith(`/${hash}.json`))));
  assert.ok(await store.versionOf(oldSnapshotKey));
  assert.ok(await store.versionOf(currentPageKey));

  const applied = await runLocalEventsGarbageCollection(store, {
    now: new Date('2030-03-01T00:00:00.000Z'),
    retentionMs: 30 * 86_400_000,
    dryRun: false,
  });
  assert.equal(applied.plan.blockers.length, 0);
  assert.equal(applied.applied, true);
  assert.ok(applied.deleted.includes(oldSnapshotKey));
  assert.equal(await store.versionOf(oldSnapshotKey), undefined);
  assert.ok(await store.versionOf(currentPageKey));
  const current = await getAcceptedLocalEventsSnapshot('toulouse', store, later);
  assert.equal(current?.snapshot.snapshotId, second.snapshot.snapshotId);
});

test('GC stops before deletion when scan or delete limits are exceeded', async () => {
  const scanStore = new TestDurableStore();
  await finish('toulouse', scanStore, completeFetcher());
  const scanPlan = await planLocalEventsGarbageCollection(scanStore, {
    now: new Date('2030-03-01T00:00:00.000Z'),
    maxScan: 1,
  });
  assert.ok(scanPlan.blockers.includes('GC_SCAN_LIMIT_EXCEEDED'));
  assert.equal(scanPlan.scannedBlobs, 1);

  const { store, first } = await makeSupersededSnapshot();
  const oldSnapshotKey = `local-events/v3/snapshots/toulouse/${first.snapshot.snapshotId}.json`;
  const before = await store.versionOf(oldSnapshotKey);
  const limited = await runLocalEventsGarbageCollection(store, {
    now: new Date('2030-03-01T00:00:00.000Z'),
    maxDelete: 1,
    dryRun: false,
  });
  assert.ok(limited.plan.blockers.includes('GC_DELETE_LIMIT_EXCEEDED'));
  assert.equal(limited.applied, false);
  assert.deepEqual(limited.deleted, []);
  assert.equal(await store.versionOf(oldSnapshotKey), before);
});

test('GC blocks conservatively when a referenced page is invalid', async () => {
  const { store, second } = await makeSupersededSnapshot();
  store.tamper(`/pages/${second.snapshot.pageHashes[0]}.json`, (value) => { value.payload = { events: [] }; });
  const plan = await planLocalEventsGarbageCollection(store, {
    now: new Date('2030-03-01T00:00:00.000Z'),
  });
  assert.ok(plan.blockers.some((blocker) => blocker.startsWith('GC_REFERENCED_PAGE_INVALID:')));
  const current = await getAcceptedLocalEventsSnapshot('toulouse', store, new Date('2030-01-01T01:00:00.000Z'));
  assert.equal(current?.snapshot.snapshotId, second.snapshot.snapshotId);
});

test('restore-current is dry-run by default, requires the current ETag and rolls back a failed read-back', async () => {
  const { store, first, second, later } = await makeSupersededSnapshot();
  const pointerKey = 'local-events/v3/current/toulouse.json';
  const initialVersion = await store.versionOf(pointerKey);
  assert.ok(initialVersion);
  const dryRun = await restoreLocalEventsCurrentPointer(store, {
    target: 'toulouse',
    snapshotId: first.snapshot.snapshotId,
    expectedVersion: initialVersion,
  });
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.applied, false);
  assert.equal(dryRun.reason, 'DRY_RUN');
  assert.equal(await store.versionOf(pointerKey), initialVersion);
  assert.equal((await getAcceptedLocalEventsSnapshot('toulouse', store, later))?.snapshot.snapshotId, second.snapshot.snapshotId);

  const applied = await restoreLocalEventsCurrentPointer(store, {
    target: 'toulouse',
    snapshotId: first.snapshot.snapshotId,
    expectedVersion: initialVersion,
    dryRun: false,
  });
  assert.equal(applied.applied, true);
  assert.equal((await getAcceptedLocalEventsSnapshot('toulouse', store, later))?.snapshot.snapshotId, first.snapshot.snapshotId);
  const restoredVersion = await store.versionOf(pointerKey);
  assert.ok(restoredVersion);
  await assert.rejects(
    restoreLocalEventsCurrentPointer(store, {
      target: 'toulouse',
      snapshotId: second.snapshot.snapshotId,
      expectedVersion: initialVersion,
      dryRun: false,
    }),
    /CURRENT_POINTER_ETAG_MISMATCH/,
  );

  store.failNextCurrentReadBack = true;
  await assert.rejects(
    restoreLocalEventsCurrentPointer(store, {
      target: 'toulouse',
      snapshotId: second.snapshot.snapshotId,
      expectedVersion: restoredVersion,
      dryRun: false,
    }),
    /Injected current read-back failure/,
  );
  assert.equal((await getAcceptedLocalEventsSnapshot('toulouse', store, later))?.snapshot.snapshotId, first.snapshot.snapshotId);
});

test('interleaved ingestions cannot mix pages from two run owners', async () => {
  const store = new TestDurableStore();
  let releaseFirst: (() => void) | undefined;
  let markFirstEntered: (() => void) | undefined;
  const firstEntered = new Promise<void>((resolve) => { markFirstEntered = resolve; });
  const firstRelease = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const firstFetcher: OpenAgendaPageFetcher = {
    async fetchAgendaPage() {
      markFirstEntered?.();
      await firstRelease;
      const items = [{ uid: 1, title: 'first' }];
      return { payload: { agendas: items, after: null }, items, nextCursor: null, total: 1 };
    },
    async fetchEventPage() { throw new Error('not reached'); },
  };
  const secondFetcher: OpenAgendaPageFetcher = {
    async fetchAgendaPage() {
      const items = [{ uid: 2, title: 'second' }];
      return { payload: { agendas: items, after: null }, items, nextCursor: null, total: 1 };
    },
    async fetchEventPage() { throw new Error('not reached'); },
  };
  const first = stepLocalEventsIngestion({ target: 'marseille', store, fetcher: firstFetcher, maxPages: 1, now: referenceDate });
  await firstEntered;
  const second = await stepLocalEventsIngestion({ target: 'marseille', store, fetcher: secondFetcher, maxPages: 1, now: referenceDate });
  releaseFirst?.();
  await assert.rejects(first, /SNAPSHOT_CAS_CONFLICT/);
  assert.equal(second.pagesProcessed, 1);
  const manifest = await store.readJson<{ discovery: { agendas: Array<{ uid: number }> }; pages: unknown[] }>('local-events/v3/runs/marseille/active.json');
  assert.deepEqual(manifest?.discovery.agendas.map((agenda) => agenda.uid), [2]);
  assert.equal(manifest?.pages.length, 1);
});

test('an older generation cannot regress the current pointer', async () => {
  const store = new TestDurableStore();
  const newerDate = new Date('2030-01-02T00:00:00.000Z');
  await finish('toulouse', store, completeFetcher([3, 7, 11, 17, 25, 35]), newerDate);
  const newer = await getAcceptedLocalEventsSnapshot('toulouse', store, newerDate);
  const regression = await finish('toulouse', store, completeFetcher(), referenceDate);
  assert.equal(regression.phase, 'blocked');
  assert.ok(regression.blockers.includes('MONOTONIC_PROMOTION_REJECTED'));
  const current = await getAcceptedLocalEventsSnapshot('toulouse', store, newerDate);
  assert.equal(current?.snapshot.snapshotId, newer?.snapshot.snapshotId);
});

test('repeated cursor blocks a run without promotion', async () => {
  const store = new TestDurableStore();
  const fetcher: OpenAgendaPageFetcher = {
    async fetchAgendaPage() {
      return { payload: { agendas: [{ uid: 1 }], after: ['same'] }, items: [{ uid: 1 }], nextCursor: ['same'], total: 2 };
    },
    async fetchEventPage() {
      throw new Error('event phase must not start');
    },
  };
  const result = await finish('marseille', store, fetcher);
  assert.equal(result.phase, 'blocked');
  assert.ok(result.blockers.includes('REPEATED_AGENDA_CURSOR'));
  assert.equal(await getAcceptedLocalEventsSnapshot('marseille', store, referenceDate), undefined);
});

test('OpenAgenda page fetcher sends cursor arrays and retries 429', async () => {
  const urls: string[] = [];
  let attempt = 0;
  const fetcher = createOpenAgendaPageFetcher({
    apiKey: 'test-key',
    retries: 1,
    retryDelayMs: 0,
    fetchImpl: async (input) => {
      urls.push(String(input));
      attempt += 1;
      if (attempt === 1) return new Response('{}', { status: 429, headers: { 'retry-after': '0' } });
      return new Response(JSON.stringify({ agendas: [], after: null, total: 0 }), { status: 200 });
    },
  });
  await fetcher.fetchAgendaPage({
    slug: 'test', title: 'Test', type: 'city', radiusKm: 10, searchTerms: ['Test'],
  }, 'Test', ['cursor-a', 'cursor-b']);
  assert.equal(attempt, 2);
  assert.match(urls[0], /after%5B%5D=cursor-a/);
  assert.match(urls[0], /after%5B%5D=cursor-b/);
});

test('OpenAgenda page fetcher bounds timeouts', async () => {
  const fetcher = createOpenAgendaPageFetcher({
    apiKey: 'test-key',
    retries: 0,
    timeoutMs: 5,
    fetchImpl: async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }),
  });
  await assert.rejects(
    fetcher.fetchAgendaPage({ slug: 'test', title: 'Test', type: 'city', radiusKm: 10, searchTerms: ['Test'] }, 'Test', null),
    /Abort|aborted/i,
  );
});

test('OpenAgenda retries only timeout, 429 and 5xx responses', async () => {
  let badRequestAttempts = 0;
  const badRequestFetcher = createOpenAgendaPageFetcher({
    apiKey: 'test-key',
    retries: 2,
    retryDelayMs: 0,
    fetchImpl: async () => {
      badRequestAttempts += 1;
      return new Response('{}', { status: 400 });
    },
  });
  await assert.rejects(
    badRequestFetcher.fetchAgendaPage({ slug: 'test', title: 'Test', type: 'city', radiusKm: 10, searchTerms: ['Test'] }, 'Test', null),
    /OpenAgenda 400/,
  );
  assert.equal(badRequestAttempts, 1);

  let networkAttempts = 0;
  const networkFetcher = createOpenAgendaPageFetcher({
    apiKey: 'test-key',
    retries: 2,
    retryDelayMs: 0,
    fetchImpl: async () => {
      networkAttempts += 1;
      throw new TypeError('socket failed');
    },
  });
  await assert.rejects(
    networkFetcher.fetchAgendaPage({ slug: 'test', title: 'Test', type: 'city', radiusKm: 10, searchTerms: ['Test'] }, 'Test', null),
    /socket failed/,
  );
  assert.equal(networkAttempts, 1);
});

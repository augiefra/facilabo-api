import { createHash, randomUUID } from 'node:crypto';
import {
  getLocalEventTarget,
  LOCAL_EVENTS_CONTRACT_VERSION,
  localEventsDateRange,
  localEventsEventDigest,
  localEventSourceAgendaUids,
  localEventsToIcs,
  mapOpenAgendaEvent,
  openAgendaKey,
  type LocalEventCoverage,
  type LocalEventItem,
  type LocalEventSearchResponse,
  type LocalEventTarget,
  type LocalEventsConvergenceProof,
  type LocalEventsQualification,
  type LocalEventsStorageState,
  type OpenAgendaAgenda,
} from './local-events';

const OPENAGENDA_BASE_URL = 'https://api.openagenda.com/v2';
const SNAPSHOT_PREFIX = 'local-events/v3';
const INGESTION_HORIZON_DAYS = 180;
const EVENT_PAGE_SIZE = 100;
const AGENDA_PAGE_SIZE = 100;
const BLOB_CACHE_CONTROL_MAX_AGE = 60;
export const LOCAL_EVENTS_MAX_RUN_AGE_MS = 24 * 60 * 60 * 1000;
export const LOCAL_EVENTS_MAX_RUN_PAGES = 500;
export const LOCAL_EVENTS_MAX_RUN_BYTES = 25 * 1024 * 1024;
export const LOCAL_EVENTS_GC_DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const LOCAL_EVENTS_GC_DEFAULT_MAX_SCAN = 5_000;
export const LOCAL_EVENTS_GC_DEFAULT_MAX_DELETE = 100;

export const LOCAL_EVENTS_SNAPSHOT_TARGETS = [
  'marseille', 'aix-en-provence', 'paris', 'lyon', 'toulouse', 'nice', 'nantes',
  'montpellier', 'strasbourg', 'bordeaux', 'lille', 'rennes', 'reims',
  'saint-etienne', 'toulon', 'le-havre', 'grenoble', 'dijon', 'angers', 'nimes',
  'villeurbanne', 'grand-paris', 'metropole-aix-marseille-provence', 'grand-lyon',
  'metropole-europeenne-lille', 'toulouse-metropole', 'bordeaux-metropole',
  'nantes-metropole', 'eurometropole-strasbourg',
  'montpellier-mediterranee-metropole', 'rennes-metropole', 'region-sud',
  'braderie-lille', 'rencontres-arles',
] as const;

type SnapshotTargetSlug = typeof LOCAL_EVENTS_SNAPSHOT_TARGETS[number];
type Cursor = string[] | null;
type RunPhase = 'discovery' | 'events' | 'finalizing' | 'accepted' | 'blocked';

export interface LocalEventsSnapshotStore {
  readonly storage: LocalEventsStorageState;
  readJson<T>(key: string): Promise<T | undefined>;
  readJsonVersioned<T>(key: string): Promise<{ value: T; version: string } | undefined>;
  writeJson(key: string, value: unknown, options?: { overwrite?: boolean }): Promise<string>;
  compareAndSwapJson(key: string, value: unknown, expectedVersion?: string): Promise<string>;
  deleteJson(key: string, expectedVersion: string): Promise<void>;
}

export interface LocalEventsBlobEntry {
  pathname: string;
  etag: string;
  size: number;
  uploadedAt: string;
}

export interface LocalEventsSnapshotMaintenanceStore extends LocalEventsSnapshotStore {
  listBlobs(prefix: string, cursor?: string, limit?: number): Promise<{
    blobs: LocalEventsBlobEntry[];
    cursor?: string;
    hasMore: boolean;
  }>;
}

export class MemoryLocalEventsSnapshotStore implements LocalEventsSnapshotStore {
  readonly storage: LocalEventsStorageState;
  private readonly objects = new Map<string, { raw: string; version: number }>();

  constructor() {
    this.storage = {
      adapter: 'memory',
      configured: false,
      durable: false,
    };
  }

  async readJson<T>(key: string): Promise<T | undefined> {
    const object = this.objects.get(key);
    return object === undefined ? undefined : JSON.parse(object.raw) as T;
  }

  async readJsonVersioned<T>(key: string): Promise<{ value: T; version: string } | undefined> {
    const object = this.objects.get(key);
    return object === undefined ? undefined : { value: JSON.parse(object.raw) as T, version: String(object.version) };
  }

  async writeJson(key: string, value: unknown, options: { overwrite?: boolean } = {}): Promise<string> {
    const existing = this.objects.get(key);
    const raw = JSON.stringify(value);
    if (options.overwrite === false && existing) {
      if (existing.raw !== raw) throw new Error(`IMMUTABLE_BLOB_CONFLICT:${key}`);
      return String(existing.version);
    }
    const version = (existing?.version ?? 0) + 1;
    this.objects.set(key, { raw, version });
    return String(version);
  }

  async compareAndSwapJson(key: string, value: unknown, expectedVersion?: string): Promise<string> {
    const existing = this.objects.get(key);
    if ((existing ? String(existing.version) : undefined) !== expectedVersion) throw new Error('SNAPSHOT_CAS_CONFLICT');
    return this.writeJson(key, value, { overwrite: true });
  }

  async deleteJson(key: string, expectedVersion: string): Promise<void> {
    const existing = this.objects.get(key);
    if (!existing || String(existing.version) !== expectedVersion) throw new Error('SNAPSHOT_CAS_CONFLICT');
    this.objects.delete(key);
  }
}

export class VercelBlobLocalEventsSnapshotStore implements LocalEventsSnapshotMaintenanceStore {
  readonly storage: LocalEventsStorageState = {
    adapter: 'vercel-blob-private',
    configured: true,
    durable: true,
  };

  constructor(
    private readonly token: string,
    private readonly loadBlob: () => Promise<Pick<typeof import('@vercel/blob'), 'get' | 'put' | 'del'> & Partial<Pick<typeof import('@vercel/blob'), 'list'>>> = () => import('@vercel/blob'),
  ) {}

  async readJson<T>(key: string): Promise<T | undefined> {
    return (await this.readJsonVersioned<T>(key))?.value;
  }

  async readJsonVersioned<T>(key: string): Promise<{ value: T; version: string } | undefined> {
    const raw = await this.readRawVersioned(key);
    return raw === undefined ? undefined : { value: JSON.parse(raw.raw) as T, version: raw.version };
  }

  private async readRawVersioned(key: string): Promise<{ raw: string; version: string } | undefined> {
    const { get } = await this.loadBlob();
    const result = await get(key, { access: 'private', token: this.token, useCache: false });
    if (!result) return undefined;
    if (result.statusCode !== 200) throw new Error(`Unexpected Blob read status ${result.statusCode}`);
    return {
      raw: await new Response(result.stream).text(),
      version: requireVersion(result.blob.etag, `Blob read ${key}`),
    };
  }

  async writeJson(key: string, value: unknown, options: { overwrite?: boolean } = {}): Promise<string> {
    const { put } = await this.loadBlob();
    const body = JSON.stringify(value);
    if (options.overwrite === false) {
      const existing = await this.readRawVersioned(key);
      if (existing) {
        if (existing.raw !== body) throw new Error(`IMMUTABLE_BLOB_CONFLICT:${key}`);
        return existing.version;
      }
    }
    try {
      const result = await put(key, body, {
        access: 'private',
        token: this.token,
        addRandomSuffix: false,
        allowOverwrite: options.overwrite ?? true,
        contentType: 'application/json',
        cacheControlMaxAge: BLOB_CACHE_CONTROL_MAX_AGE,
      });
      return requireVersion(result.etag, `Blob write ${key}`);
    } catch (error) {
      if (options.overwrite !== false) throw error;
      // Two identical content-addressed writes may race. The winner is accepted
      // only after an origin read-back proves byte-equivalent JSON.
      const existing = await this.readRawVersioned(key);
      if (!existing || existing.raw !== body) throw error;
      return existing.version;
    }
  }

  async compareAndSwapJson(key: string, value: unknown, expectedVersion?: string): Promise<string> {
    if (expectedVersion !== undefined) requireVersion(expectedVersion, `Blob CAS expected version ${key}`);
    const { put } = await this.loadBlob();
    const result = await put(key, JSON.stringify(value), {
      access: 'private',
      token: this.token,
      addRandomSuffix: false,
      allowOverwrite: expectedVersion !== undefined,
      ifMatch: expectedVersion,
      contentType: 'application/json',
      cacheControlMaxAge: BLOB_CACHE_CONTROL_MAX_AGE,
    });
    return requireVersion(result.etag, `Blob CAS write ${key}`);
  }

  async deleteJson(key: string, expectedVersion: string): Promise<void> {
    requireVersion(expectedVersion, `Blob delete expected version ${key}`);
    const { del } = await this.loadBlob();
    await del(key, { token: this.token, ifMatch: expectedVersion });
  }

  async listBlobs(prefix: string, cursor?: string, limit = LOCAL_EVENTS_GC_DEFAULT_MAX_SCAN): Promise<{
    blobs: LocalEventsBlobEntry[];
    cursor?: string;
    hasMore: boolean;
  }> {
    const { list } = await this.loadBlob();
    if (!list) throw new Error('Blob list operation unavailable');
    const result = await list({ token: this.token, prefix, cursor, limit });
    return {
      blobs: result.blobs.map((blob) => ({
        pathname: blob.pathname,
        etag: requireVersion(blob.etag, `Blob list ${blob.pathname}`),
        size: blob.size,
        uploadedAt: blob.uploadedAt.toISOString(),
      })),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  }
}

let defaultStore: LocalEventsSnapshotStore | undefined;

export function localEventsSnapshotStore(): LocalEventsSnapshotStore {
  if (defaultStore) return defaultStore;
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  defaultStore = token
    ? new VercelBlobLocalEventsSnapshotStore(token)
    : new MemoryLocalEventsSnapshotStore();
  return defaultStore;
}

export function resetLocalEventsSnapshotStoreForTests(): void {
  defaultStore = undefined;
}

export function setLocalEventsSnapshotStoreForTests(store: LocalEventsSnapshotStore): void {
  defaultStore = store;
}

export function localEventsTargetFromSourceUrl(sourceUrl: string): string | undefined {
  try {
    const pathname = new URL(sourceUrl).pathname;
    const encodedTarget = pathname.match(/\/api\/v1\/local-events\/ics\/([^/]+)\/?$/)?.[1];
    if (!encodedTarget) return undefined;
    const target = decodeURIComponent(encodedTarget);
    return LOCAL_EVENTS_SNAPSHOT_TARGETS.includes(target as SnapshotTargetSlug) ? target : undefined;
  } catch {
    return undefined;
  }
}

interface StoredPage {
  schemaVersion: 1;
  sha256: string;
  target: string;
  kind: 'agenda' | 'event';
  fetchedAt: string;
  cursorBefore: Cursor;
  cursorAfter: Cursor;
  itemCount: number;
  upstreamTotal?: number;
  term?: string;
  termIndex?: number;
  agendaUid?: string;
  agendaTitle?: string;
  payload: unknown;
}

interface PageReference {
  sha256: string;
  key: string;
  kind: 'agenda' | 'event';
  cursorBefore: Cursor;
  cursorAfter: Cursor;
  itemCount: number;
  upstreamTotal?: number;
  term?: string;
  termIndex?: number;
  agendaUid?: string;
  agendaTitle?: string;
  fetchedAt: string;
  byteLength: number;
}

export interface LocalEventsRunManifest {
  schemaVersion: 1;
  runId: string;
  target: string;
  createdAt: string;
  updatedAt: string;
  from: string;
  to: string;
  phase: RunPhase;
  discovery: {
    termIndex: number;
    cursor: Cursor;
    seenCursorSignatures: string[];
    agendas: OpenAgendaAgenda[];
  };
  events: {
    agendaIndex: number;
    cursor: Cursor;
    seenCursorSignatures: string[];
  };
  pages: PageReference[];
  counters: {
    agendaPages: number;
    eventPages: number;
    agendasBeforeDeduplication: number;
    agendasAfterDeduplication: number;
    eventsBeforeFiltering: number;
    eventsAfterFiltering: number;
    storedBytes: number;
  };
  blockers: string[];
  candidateSnapshotId?: string;
}

export interface AcceptedLocalEventsSnapshot {
  schemaVersion: 1;
  snapshotId: string;
  target: string;
  runId: string;
  generatedAt: string;
  acceptedAt: string;
  pageHashes: string[];
  contentDigest: string;
  eventDigest: string;
  response: LocalEventSearchResponse;
}

interface CurrentPointer {
  schemaVersion: 1;
  target: string;
  snapshotId: string;
  acceptedAt: string;
  generation: string;
  snapshotKey: string;
  contentDigest: string;
  eventDigest: string;
}

export interface OpenAgendaPage {
  payload: unknown;
  items: unknown[];
  total?: number;
  nextCursor: Cursor;
}

export interface OpenAgendaPageFetcher {
  fetchAgendaPage(target: LocalEventTarget, term: string, cursor: Cursor, deadlineAt?: number): Promise<OpenAgendaPage>;
  fetchEventPage(target: LocalEventTarget, agenda: OpenAgendaAgenda, cursor: Cursor, from: string, to: string, deadlineAt?: number): Promise<OpenAgendaPage>;
}

export interface IngestionStepResult {
  target: string;
  runId?: string;
  phase: RunPhase | 'store-unavailable' | 'source-unavailable';
  pagesProcessed: number;
  promoted: boolean;
  snapshotId?: string;
  previousSnapshotId?: string;
  storage: LocalEventsStorageState;
  blockers: string[];
  restarted: boolean;
}

export interface LocalEventsGcCandidate {
  key: string;
  expectedVersion: string;
  uploadedAt: string;
  size: number;
}

export interface LocalEventsGcPlan {
  dryRun: boolean;
  cutoff: string;
  scannedBlobs: number;
  protectedBlobs: number;
  retainedSnapshots: number;
  candidateSnapshots: LocalEventsGcCandidate[];
  candidatePages: LocalEventsGcCandidate[];
  blockers: string[];
  guardedTargets: string[];
  limits: {
    retentionMs: number;
    maxScan: number;
    maxDelete: number;
  };
}

export interface LocalEventsGcResult {
  plan: LocalEventsGcPlan;
  applied: boolean;
  deleted: string[];
}

export interface LocalEventsPointerRestoreOptions {
  target: string;
  snapshotId: string;
  expectedVersion: string;
  dryRun?: boolean;
}

export interface LocalEventsPointerRestoreResult {
  target: string;
  snapshotId: string;
  previousSnapshotId: string;
  expectedVersion: string;
  snapshotKey: string;
  dryRun: boolean;
  applied: boolean;
  reason?: string;
  newVersion?: string;
}

export function createOpenAgendaPageFetcher(options: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
} = {}): OpenAgendaPageFetcher {
  const apiKey = options.apiKey ?? openAgendaKey();
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 6_000;
  const retries = options.retries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 150;

  const fetchPage = async (url: URL, deadlineAt?: number): Promise<OpenAgendaPage> => {
    if (!apiKey) throw new Error('OPENAGENDA_PUBLIC_KEY unavailable');
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const remainingBudget = deadlineAt === undefined ? timeoutMs : deadlineAt - Date.now();
      if (remainingBudget <= 0) throw new Error('INGESTION_BUDGET_EXHAUSTED');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.max(1, Math.min(timeoutMs, remainingBudget)));
      try {
        const response = await fetchImpl(url, {
          signal: controller.signal,
          headers: { key: apiKey, accept: 'application/json', 'user-agent': 'FacilAbo/2.0 local-events-snapshot' },
        });
        if (!response.ok) {
          if ((response.status === 429 || response.status >= 500) && attempt < retries) {
            const retryAfterSeconds = Number.parseFloat(response.headers.get('retry-after') ?? '0');
            const retryDelay = Math.min(1_000, Math.max(retryDelayMs, retryAfterSeconds * 1_000));
            if (deadlineAt !== undefined && Date.now() + retryDelay >= deadlineAt) throw new Error('INGESTION_BUDGET_EXHAUSTED');
            await delay(retryDelay);
            continue;
          }
          throw new Error(`OpenAgenda ${response.status} for ${url.pathname}`);
        }
        const payload = await response.json();
        const items = extractItems(payload);
        return {
          payload,
          items,
          total: numberValue(recordValue(payload)?.total),
          nextCursor: normalizeCursor(recordValue(payload)?.after),
        };
      } catch (error) {
        lastError = error;
        if (!isTimeoutError(error) || attempt >= retries) break;
        if (deadlineAt !== undefined && Date.now() + retryDelayMs >= deadlineAt) break;
        await delay(retryDelayMs);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('OpenAgenda request failed');
  };

  return {
    async fetchAgendaPage(_target, term, cursor, deadlineAt) {
      const url = new URL(`${OPENAGENDA_BASE_URL}/agendas`);
      url.searchParams.set('official', '1');
      url.searchParams.set('search', term);
      url.searchParams.set('size', String(AGENDA_PAGE_SIZE));
      for (const field of ['uid', 'title', 'slug', 'official']) url.searchParams.append('includeFields[]', field);
      appendCursor(url, cursor);
      return fetchPage(url, deadlineAt);
    },
    async fetchEventPage(target, agenda, cursor, from, to, deadlineAt) {
      if (agenda.uid === undefined || agenda.uid === null) throw new Error('Agenda UID unavailable');
      const url = new URL(`${OPENAGENDA_BASE_URL}/agendas/${agenda.uid}/events`);
      url.searchParams.set('size', String(EVENT_PAGE_SIZE));
      url.searchParams.set('sort', 'timings.asc');
      url.searchParams.set('timings[gte]', from);
      url.searchParams.set('timings[lte]', to);
      url.searchParams.append('relative[]', 'upcoming');
      for (const field of ['uid', 'title', 'description', 'longDescription', 'timings', 'location', 'image', 'canonicalUrl', 'registrationUrl']) {
        url.searchParams.append('includeFields[]', field);
      }
      if (target.city) url.searchParams.append('adminLevel4[]', target.city);
      else if (target.department) url.searchParams.append('adminLevel2[]', target.department);
      else if (target.region && target.region !== 'France') url.searchParams.append('adminLevel1[]', target.region);
      if (target.type === 'event') url.searchParams.set('search', target.searchTerms[0]);
      appendCursor(url, cursor);
      return fetchPage(url, deadlineAt);
    },
  };
}

export async function stepLocalEventsIngestion(options: {
  target: string;
  store?: LocalEventsSnapshotStore;
  fetcher?: OpenAgendaPageFetcher;
  maxPages?: number;
  budgetMs?: number;
  now?: Date;
}): Promise<IngestionStepResult> {
  const store = options.store ?? localEventsSnapshotStore();
  const maxPages = Math.max(1, Math.min(options.maxPages ?? 8, 20));
  const budgetMs = Math.max(250, Math.min(options.budgetMs ?? 20_000, 25_000));
  const now = options.now ?? new Date();
  const target = getLocalEventTarget(options.target);
  if (!target || !LOCAL_EVENTS_SNAPSHOT_TARGETS.includes(target.slug as SnapshotTargetSlug)) {
    throw new Error(`Unsupported snapshot target: ${options.target}`);
  }
  if (!store.storage.durable) {
    return {
      target: target.slug,
      phase: 'store-unavailable',
      pagesProcessed: 0,
      promoted: false,
      storage: store.storage,
      blockers: ['DURABLE_STORE_UNAVAILABLE'],
      restarted: false,
    };
  }
  const fetcher = options.fetcher ?? createOpenAgendaPageFetcher();
  if (!openAgendaKey() && !options.fetcher) {
    return {
      target: target.slug,
      phase: 'source-unavailable',
      pagesProcessed: 0,
      promoted: false,
      storage: store.storage,
      blockers: ['OPENAGENDA_KEY_UNAVAILABLE'],
      restarted: false,
    };
  }

  const startedAt = Date.now();
  const deadlineAt = startedAt + budgetMs;
  let pagesProcessed = 0;
  let promoted = false;
  const persistedRun = await activeRun(store, target.slug);
  let run = persistedRun?.value ?? newRun(target, now);
  run.counters.storedBytes ??= run.pages.reduce((sum, page) => sum + (page.byteLength ?? 0), 0);
  let runVersion = persistedRun?.version;
  let restarted = false;
  const previous = await readCurrentPointer(store, target.slug);
  const runAgeMs = now.getTime() - new Date(run.createdAt).getTime();
  if (run.phase === 'accepted'
    || run.phase === 'blocked'
    || !Number.isFinite(runAgeMs)
    || runAgeMs < 0
    || runAgeMs > LOCAL_EVENTS_MAX_RUN_AGE_MS
    || run.pages.length >= LOCAL_EVENTS_MAX_RUN_PAGES
    || run.counters.storedBytes >= LOCAL_EVENTS_MAX_RUN_BYTES) {
    run = newRun(target, now);
    restarted = persistedRun !== undefined;
  }
  // Optimistic claim: concurrent invocations may create orphan immutable pages, but
  // only one generation can advance this run manifest and reach promotion.
  runVersion = await store.compareAndSwapJson(activeRunKey(target.slug), run, runVersion);

  while (pagesProcessed < maxPages && Date.now() - startedAt < budgetMs) {
    if (run.phase === 'discovery') {
      if (run.discovery.termIndex >= target.searchTerms.length) {
        run.discovery.agendas = dedupeAgendas(run.discovery.agendas);
        run.counters.agendasAfterDeduplication = run.discovery.agendas.length;
        run.phase = 'events';
        run.discovery.cursor = null;
        run.discovery.seenCursorSignatures = [];
        continue;
      }
      const term = target.searchTerms[run.discovery.termIndex];
      const cursorBefore = run.discovery.cursor;
      const page = await fetcher.fetchAgendaPage(target, term, cursorBefore, deadlineAt);
      const stored = await persistPage(store, target.slug, 'agenda', page, now, {
        term,
        termIndex: run.discovery.termIndex,
        cursorBefore,
      });
      run.pages.push(stored);
      run.counters.storedBytes += stored.byteLength;
      run.counters.agendaPages += 1;
      run.counters.agendasBeforeDeduplication += page.items.length;
      run.discovery.agendas.push(...page.items.map(asAgenda).filter((value): value is OpenAgendaAgenda => value !== undefined));
      pagesProcessed += 1;
      if (applyRunResourceBounds(run)) {
        run.phase = 'blocked';
        break;
      }
      if (page.nextCursor) {
        const signature = cursorSignature(page.nextCursor);
        if (signature === cursorSignature(cursorBefore) || run.discovery.seenCursorSignatures.includes(signature)) {
          run.blockers.push('REPEATED_AGENDA_CURSOR');
          run.phase = 'blocked';
          break;
        }
        run.discovery.seenCursorSignatures.push(signature);
      } else {
        run.discovery.cursor = null;
      }
      const discoveryBlocker = discoveryPageBlocker(run, run.discovery.termIndex, term, page);
      if (discoveryBlocker) {
        run.blockers.push(discoveryBlocker);
        run.phase = 'blocked';
        break;
      }
      if (page.nextCursor) {
        run.discovery.cursor = page.nextCursor;
      } else {
        run.discovery.termIndex += 1;
        run.discovery.cursor = null;
        run.discovery.seenCursorSignatures = [];
      }
    } else if (run.phase === 'events') {
      const agenda = run.discovery.agendas[run.events.agendaIndex];
      if (!agenda) {
        applyUpstreamCompletenessProof(run);
        run.phase = 'finalizing';
        if (run.blockers.length > 0) run.phase = 'blocked';
        continue;
      }
      const cursorBefore = run.events.cursor;
      const page = await fetcher.fetchEventPage(target, agenda, cursorBefore, run.from, run.to, deadlineAt);
      const agendaUid = String(agenda.uid ?? '');
      const agendaTitle = localizedText(agenda.title ?? agenda.name) ?? target.title;
      const stored = await persistPage(store, target.slug, 'event', page, now, { agendaUid, agendaTitle, cursorBefore });
      run.pages.push(stored);
      run.counters.storedBytes += stored.byteLength;
      run.counters.eventPages += 1;
      run.counters.eventsBeforeFiltering += page.items.length;
      pagesProcessed += 1;
      if (applyRunResourceBounds(run)) {
        run.phase = 'blocked';
        break;
      }
      if (page.nextCursor) {
        const signature = cursorSignature(page.nextCursor);
        if (signature === cursorSignature(cursorBefore) || run.events.seenCursorSignatures.includes(signature)) {
          run.blockers.push('REPEATED_EVENT_CURSOR');
          run.phase = 'blocked';
          break;
        }
        run.events.seenCursorSignatures.push(signature);
        run.events.cursor = page.nextCursor;
      } else {
        run.events.agendaIndex += 1;
        run.events.cursor = null;
        run.events.seenCursorSignatures = [];
      }
    } else if (run.phase === 'finalizing') {
      if (Date.now() >= deadlineAt) break;
      const candidate = await buildCandidate(store, run, target, now);
      run.candidateSnapshotId = candidate.snapshotId;
      await store.writeJson(snapshotKey(target.slug, candidate.snapshotId), candidate, { overwrite: false });
      const snapshotReadBack = await store.readJson<AcceptedLocalEventsSnapshot>(snapshotKey(target.slug, candidate.snapshotId));
      if (!snapshotReadBack) {
        throw new Error('SNAPSHOT_READBACK_FAILED');
      }
      // Promotion keeps the strong proof: immutable root, every page hash and
      // the run page order are verified before the current pointer can move.
      await verifyAcceptedSnapshot(store, snapshotKey(target.slug, candidate.snapshotId), snapshotReadBack, run, { verifyPages: true });
      if (canonicalJson(snapshotReadBack) !== canonicalJson(candidate)) throw new Error('SNAPSHOT_READBACK_MISMATCH');
      if (candidate.response.qualification.qualified) {
        const current = await store.readJsonVersioned<CurrentPointer>(currentKey(target.slug));
        if (current && current.value.acceptedAt >= candidate.acceptedAt) {
          if (current.value.contentDigest === candidate.contentDigest
            && current.value.eventDigest === candidate.eventDigest) {
            run.candidateSnapshotId = current.value.snapshotId;
            run.phase = 'accepted';
            break;
          }
          run.blockers.push('MONOTONIC_PROMOTION_REJECTED');
          run.phase = 'blocked';
          break;
        }
        const pointer: CurrentPointer = {
          schemaVersion: 1,
          target: target.slug,
          snapshotId: candidate.snapshotId,
          acceptedAt: candidate.acceptedAt,
          generation: run.runId,
          snapshotKey: snapshotKey(target.slug, candidate.snapshotId),
          contentDigest: candidate.contentDigest,
          eventDigest: candidate.eventDigest,
        };
        const pointerVersion = await store.compareAndSwapJson(currentKey(target.slug), pointer, current?.version);
        try {
          const pointerReadBack = await store.readJsonVersioned<CurrentPointer>(currentKey(target.slug));
          if (!pointerReadBack
            || pointerReadBack.version !== pointerVersion
            || pointerReadBack.value.snapshotId !== candidate.snapshotId
            || pointerReadBack.value.generation !== run.runId
            || pointerReadBack.value.snapshotKey !== snapshotKey(target.slug, candidate.snapshotId)
            || pointerReadBack.value.contentDigest !== candidate.contentDigest
            || pointerReadBack.value.eventDigest !== candidate.eventDigest) {
            throw new Error('CURRENT_POINTER_READBACK_FAILED');
          }
        } catch (error) {
          if (current) await store.compareAndSwapJson(currentKey(target.slug), current.value, pointerVersion);
          else await store.deleteJson(currentKey(target.slug), pointerVersion);
          throw error;
        }
        promoted = true;
        run.phase = 'accepted';
      } else {
        run.blockers.push(...candidate.response.qualification.blockers);
        run.phase = 'blocked';
      }
      break;
    } else {
      break;
    }
    run.updatedAt = now.toISOString();
    runVersion = await store.compareAndSwapJson(activeRunKey(target.slug), run, runVersion);
  }

  run.updatedAt = now.toISOString();
  run.blockers = Array.from(new Set(run.blockers));
  await store.compareAndSwapJson(activeRunKey(target.slug), run, runVersion);
  return {
    target: target.slug,
    runId: run.runId,
    phase: run.phase,
    pagesProcessed,
    promoted,
    snapshotId: run.candidateSnapshotId,
    previousSnapshotId: previous?.snapshotId,
    storage: store.storage,
    blockers: run.blockers,
    restarted,
  };
}

export async function getAcceptedLocalEventsSnapshot(target: string, store = localEventsSnapshotStore(), now = new Date()): Promise<{
  snapshot: AcceptedLocalEventsSnapshot;
  response: LocalEventSearchResponse;
  ics: string;
} | undefined> {
  const pointer = await readCurrentPointer(store, target);
  if (!pointer) return undefined;
  const snapshot = await store.readJson<AcceptedLocalEventsSnapshot>(pointer.snapshotKey);
  if (!snapshot) return undefined;
  try {
    // Public reads validate the immutable root and pointer identity, but do not
    // re-download every page referenced by a snapshot that was already proved
    // at promotion time. Blob reads remain origin reads (useCache:false).
    await verifyAcceptedSnapshot(store, pointer.snapshotKey, snapshot, undefined, { verifyPages: false });
  } catch {
    return undefined;
  }
  if (snapshot.snapshotId !== pointer.snapshotId
    || snapshot.target !== target
    || pointer.snapshotKey !== snapshotKey(target, pointer.snapshotId)
    || pointer.contentDigest !== snapshot.contentDigest
    || pointer.eventDigest !== snapshot.eventDigest) return undefined;
  const response = refreshSnapshotQualification(snapshot.response, now);
  const targetDefinition = getLocalEventTarget(target);
  if (!targetDefinition) return undefined;
  const note = response.note ? ` ${response.note}` : '';
  return {
    snapshot,
    response,
    ics: localEventsToIcs(targetDefinition.title, `${targetDefinition.title} via OpenAgenda.${note}`.trim(), response.events, {
      snapshotId: response.snapshotId,
      qualified: response.qualification.qualified,
      complete: response.coverage.complete,
      truncated: response.coverage.truncated,
      futureEventCount: response.coverage.futureEventCount,
      horizonDays: response.coverage.horizonDays,
      eventDigest: response.eventDigest,
    }),
  };
}

/**
 * Projects an accepted snapshot for a caller-requested limit without changing
 * the immutable snapshot identity. `snapshotEvent*` remains the full-set
 * proof; `eventDigest`, `total` and JSON convergence describe this projection.
 */
export function projectAcceptedLocalEventsResponse(
  response: LocalEventSearchResponse,
  requestedLimit?: number,
): LocalEventSearchResponse {
  const fullEvents = response.events;
  const snapshotEventCount = response.snapshotEventCount ?? fullEvents.length;
  const snapshotEventDigest = response.snapshotEventDigest ?? response.eventDigest ?? localEventsEventDigest(fullEvents);
  const effectiveLimit = requestedLimit ?? fullEvents.length;
  const events = fullEvents.slice(0, effectiveLimit);
  const eventDigest = localEventsEventDigest(events);
  const dateRange = localEventsDateRange(events);
  return {
    ...response,
    events,
    total: events.length,
    limit: effectiveLimit,
    requestedLimit,
    query: { ...response.query, limit: effectiveLimit },
    snapshotEventCount,
    snapshotEventDigest,
    eventDigest,
    dateRange,
  };
}

interface LocalEventsGcCollection {
  plan: LocalEventsGcPlan;
  guardVersions: Map<string, string | undefined>;
}

interface LocalEventsGcProtection {
  protectedSnapshots: Set<string>;
  protectedPages: Set<string>;
  validatedSnapshots: Map<string, string[]>;
  validatedPages: Set<string>;
}

const LOCAL_EVENTS_GC_MAX_SCAN = 50_000;
const LOCAL_EVENTS_GC_MAX_DELETE = 1_000;

class LocalEventsGcScanLimitError extends Error {
  constructor(readonly scanned: number) {
    super('GC_SCAN_LIMIT_EXCEEDED');
  }
}

export async function planLocalEventsGarbageCollection(
  store: LocalEventsSnapshotMaintenanceStore,
  options: {
    now?: Date;
    retentionMs?: number;
    maxScan?: number;
    maxDelete?: number;
    dryRun?: boolean;
  } = {},
): Promise<LocalEventsGcPlan> {
  return (await collectLocalEventsGarbageCollection(store, options)).plan;
}

export async function runLocalEventsGarbageCollection(
  store: LocalEventsSnapshotMaintenanceStore,
  options: {
    now?: Date;
    retentionMs?: number;
    maxScan?: number;
    maxDelete?: number;
    dryRun?: boolean;
  } = {},
): Promise<LocalEventsGcResult> {
  const collection = await collectLocalEventsGarbageCollection(store, options);
  const { plan, guardVersions } = collection;
  const deleted: string[] = [];
  if (plan.blockers.length > 0 || plan.dryRun) return { plan, applied: false, deleted };

  for (const candidate of plan.candidateSnapshots) {
    if (!(await localEventsGcGuardsMatch(store, guardVersions))) {
      plan.blockers.push('GC_GUARD_CHANGED');
      return { plan, applied: deleted.length > 0, deleted };
    }
    try {
      await store.deleteJson(candidate.key, candidate.expectedVersion);
      deleted.push(candidate.key);
    } catch {
      plan.blockers.push(`GC_DELETE_FAILED:${candidate.key}`);
      return { plan, applied: deleted.length > 0, deleted };
    }
  }

  // Snapshot deletion may have raced with an ingest or a manual restore. Do not
  // remove any page until all current/active ETags still match the plan.
  if (!(await localEventsGcGuardsMatch(store, guardVersions))) {
    plan.blockers.push('GC_GUARD_CHANGED');
    return { plan, applied: deleted.length > 0, deleted };
  }
  for (const candidate of plan.candidatePages) {
    if (!(await localEventsGcGuardsMatch(store, guardVersions))) {
      plan.blockers.push('GC_GUARD_CHANGED');
      return { plan, applied: deleted.length > 0, deleted };
    }
    try {
      await store.deleteJson(candidate.key, candidate.expectedVersion);
      deleted.push(candidate.key);
    } catch {
      plan.blockers.push(`GC_DELETE_FAILED:${candidate.key}`);
      return { plan, applied: deleted.length > 0, deleted };
    }
  }
  return { plan, applied: deleted.length > 0, deleted };
}

async function collectLocalEventsGarbageCollection(
  store: LocalEventsSnapshotMaintenanceStore,
  options: {
    now?: Date;
    retentionMs?: number;
    maxScan?: number;
    maxDelete?: number;
    dryRun?: boolean;
  },
): Promise<LocalEventsGcCollection> {
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error('GC_INVALID_NOW');
  const retentionMs = normalizeGcBound(options.retentionMs ?? LOCAL_EVENTS_GC_DEFAULT_RETENTION_MS, 0, Number.MAX_SAFE_INTEGER, 'GC_INVALID_RETENTION');
  const maxScan = normalizeGcBound(options.maxScan ?? LOCAL_EVENTS_GC_DEFAULT_MAX_SCAN, 1, LOCAL_EVENTS_GC_MAX_SCAN, 'GC_INVALID_SCAN_LIMIT');
  const maxDelete = normalizeGcBound(options.maxDelete ?? LOCAL_EVENTS_GC_DEFAULT_MAX_DELETE, 1, LOCAL_EVENTS_GC_MAX_DELETE, 'GC_INVALID_DELETE_LIMIT');
  const plan: LocalEventsGcPlan = {
    dryRun: options.dryRun ?? true,
    cutoff: new Date(now.getTime() - retentionMs).toISOString(),
    scannedBlobs: 0,
    protectedBlobs: 0,
    retainedSnapshots: 0,
    candidateSnapshots: [],
    candidatePages: [],
    blockers: [],
    guardedTargets: [...LOCAL_EVENTS_SNAPSHOT_TARGETS],
    limits: { retentionMs, maxScan, maxDelete },
  };
  const guardVersions = new Map<string, string | undefined>();
  try {
    if (!store.storage.durable) throw new Error('GC_DURABLE_STORE_UNAVAILABLE');
    if (typeof store.listBlobs !== 'function') throw new Error('GC_LIST_UNAVAILABLE');
    const blobs = await listLocalEventsBlobs(store, maxScan);
    plan.scannedBlobs = blobs.length;
    const entries = new Map<string, LocalEventsBlobEntry>();
    for (const blob of blobs) {
      if (entries.has(blob.pathname)) throw new Error(`GC_DUPLICATE_BLOB:${blob.pathname}`);
      entries.set(blob.pathname, blob);
    }

    const protection: LocalEventsGcProtection = {
      protectedSnapshots: new Set(),
      protectedPages: new Set(),
      validatedSnapshots: new Map(),
      validatedPages: new Set(),
    };

    for (const target of LOCAL_EVENTS_SNAPSHOT_TARGETS) {
      const pointerPath = currentKey(target);
      const pointer = await store.readJsonVersioned<CurrentPointer>(pointerPath);
      guardVersions.set(pointerPath, pointer?.version);
      if (pointer) {
        validateCurrentPointer(pointer.value, target);
        await protectLocalEventsSnapshot(store, target, pointer.value.snapshotId, protection, 'current');
      }

      const activePath = activeRunKey(target);
      const active = await store.readJsonVersioned<LocalEventsRunManifest>(activePath);
      guardVersions.set(activePath, active?.version);
      if (active) {
        validateRunManifest(active.value, target);
        await protectLocalEventsRun(store, active.value, protection);
      }
    }

    const snapshots: Array<{ entry: LocalEventsBlobEntry; pageKeys: string[] }> = [];
    for (const entry of entries.values()) {
      const parsed = parseSnapshotBlobPath(entry.pathname);
      if (!parsed) continue;
      const versioned = await store.readJsonVersioned<AcceptedLocalEventsSnapshot>(entry.pathname);
      if (!versioned || versioned.version !== entry.etag) throw new Error(`GC_SNAPSHOT_VERSION_MISMATCH:${entry.pathname}`);
      const pageKeys = await protectLocalEventsSnapshot(store, parsed.target, parsed.snapshotId, protection, 'listed', false);
      snapshots.push({ entry, pageKeys });
      const oldEnough = isOlderThan(entry.uploadedAt, plan.cutoff);
      // A snapshot is protected when a current pointer or active run names it.
      // Future/unknown-age snapshots are retained conservatively as well.
      if (!protection.protectedSnapshots.has(entry.pathname) && oldEnough) {
        plan.candidateSnapshots.push(toGcCandidate(entry));
      } else {
        plan.retainedSnapshots += 1;
        for (const pageKey of pageKeys) protection.protectedPages.add(pageKey);
      }
    }

    // Pages referenced by every retained snapshot are protected. Pages only
    // referenced by a snapshot selected above can be removed after that root
    // object is conditionally deleted.
    const candidateSnapshotKeys = new Set(plan.candidateSnapshots.map((candidate) => candidate.key));
    for (const snapshot of snapshots) {
      if (!candidateSnapshotKeys.has(snapshot.entry.pathname)) {
        for (const pageKey of snapshot.pageKeys) protection.protectedPages.add(pageKey);
      }
    }
    for (const entry of entries.values()) {
      const pageHash = parsePageBlobPath(entry.pathname);
      if (!pageHash || !isOlderThan(entry.uploadedAt, plan.cutoff) || protection.protectedPages.has(entry.pathname)) continue;
      plan.candidatePages.push(toGcCandidate(entry));
    }

    plan.protectedBlobs = [...entries.keys()].filter((key) => protection.protectedSnapshots.has(key) || protection.protectedPages.has(key)).length;
    if (plan.candidateSnapshots.length + plan.candidatePages.length > maxDelete) {
      plan.blockers.push('GC_DELETE_LIMIT_EXCEEDED');
    }
  } catch (error) {
    if (error instanceof LocalEventsGcScanLimitError) plan.scannedBlobs = error.scanned;
    plan.blockers.push(localEventsGcBlocker(error));
  }
  plan.blockers = Array.from(new Set(plan.blockers));
  return { plan, guardVersions };
}

function normalizeGcBound(value: number, minimum: number, maximum: number, errorCode: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(errorCode);
  return value;
}

async function listLocalEventsBlobs(store: LocalEventsSnapshotMaintenanceStore, maxScan: number): Promise<LocalEventsBlobEntry[]> {
  const blobs: LocalEventsBlobEntry[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  while (true) {
    const remaining = maxScan - blobs.length;
    if (remaining <= 0) throw new LocalEventsGcScanLimitError(blobs.length);
    const page = await store.listBlobs(`${SNAPSHOT_PREFIX}/`, cursor, Math.min(1_000, remaining));
    if (!Array.isArray(page.blobs) || typeof page.hasMore !== 'boolean') throw new Error('GC_LIST_INVALID');
    if (page.blobs.length > remaining) throw new LocalEventsGcScanLimitError(blobs.length);
    for (const blob of page.blobs) {
      if (!blob.pathname || typeof blob.pathname !== 'string' || !blob.pathname.startsWith(`${SNAPSHOT_PREFIX}/`)) {
        throw new Error('GC_LIST_ENTRY_INVALID');
      }
      requireVersion(blob.etag, `GC list ${blob.pathname}`);
      if (!Number.isSafeInteger(blob.size) || blob.size < 0 || typeof blob.uploadedAt !== 'string') throw new Error('GC_LIST_ENTRY_INVALID');
      blobs.push(blob);
    }
    if (!page.hasMore) return blobs;
    if (!page.cursor || cursors.has(page.cursor)) throw new Error('GC_LIST_CURSOR_INVALID');
    cursors.add(page.cursor);
    cursor = page.cursor;
  }
}

function toGcCandidate(entry: LocalEventsBlobEntry): LocalEventsGcCandidate {
  return { key: entry.pathname, expectedVersion: entry.etag, uploadedAt: entry.uploadedAt, size: entry.size };
}

function isOlderThan(uploadedAt: string, cutoff: string): boolean {
  const uploadedAtMs = Date.parse(uploadedAt);
  const cutoffMs = Date.parse(cutoff);
  return Number.isFinite(uploadedAtMs) && Number.isFinite(cutoffMs) && uploadedAtMs < cutoffMs;
}

function parseSnapshotBlobPath(path: string): { target: string; snapshotId: string } | undefined {
  const prefix = `${SNAPSHOT_PREFIX}/snapshots/`;
  if (!path.startsWith(prefix)) return undefined;
  const remainder = path.slice(prefix.length);
  const match = remainder.match(/^([^/]+)\/([a-f0-9]{64})\.json$/);
  if (!match || !LOCAL_EVENTS_SNAPSHOT_TARGETS.includes(match[1] as SnapshotTargetSlug)) return undefined;
  return { target: match[1], snapshotId: match[2] };
}

function parsePageBlobPath(path: string): string | undefined {
  const match = path.match(/^local-events\/v3\/pages\/([a-f0-9]{64})\.json$/);
  return match?.[1];
}

async function protectLocalEventsSnapshot(
  store: LocalEventsSnapshotStore,
  target: string,
  snapshotId: string,
  protection: LocalEventsGcProtection,
  reason: string,
  markProtected = true,
): Promise<string[]> {
  const key = snapshotKey(target, snapshotId);
  const cached = protection.validatedSnapshots.get(key);
  if (cached) {
    if (markProtected) {
      protection.protectedSnapshots.add(key);
      for (const pageKey of cached) protection.protectedPages.add(pageKey);
    }
    return cached;
  }
  if (!LOCAL_EVENTS_SNAPSHOT_TARGETS.includes(target as SnapshotTargetSlug) || !/^[a-f0-9]{64}$/.test(snapshotId)) {
    throw new Error(`GC_REFERENCED_SNAPSHOT_INVALID:${reason}`);
  }
  const versioned = await store.readJsonVersioned<AcceptedLocalEventsSnapshot>(key);
  if (!versioned) throw new Error(`GC_REFERENCED_SNAPSHOT_MISSING:${key}`);
  try {
    await verifyAcceptedSnapshot(store, key, versioned.value, undefined, { verifyPages: false });
  } catch {
    throw new Error(`GC_REFERENCED_SNAPSHOT_INVALID:${key}`);
  }
  if (!Array.isArray(versioned.value.pageHashes) || versioned.value.pageHashes.length > LOCAL_EVENTS_MAX_RUN_PAGES) {
    throw new Error(`GC_REFERENCED_SNAPSHOT_INVALID:${key}`);
  }
  const pageKeys: string[] = [];
  for (const hash of versioned.value.pageHashes) {
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new Error(`GC_REFERENCED_PAGE_INVALID:${key}`);
    const pageKey = `${SNAPSHOT_PREFIX}/pages/${hash}.json`;
    await validateLocalEventsPage(store, pageKey, target, hash, protection);
    pageKeys.push(pageKey);
  }
  protection.validatedSnapshots.set(key, pageKeys);
  if (markProtected) {
    protection.protectedSnapshots.add(key);
    for (const pageKey of pageKeys) protection.protectedPages.add(pageKey);
  }
  return pageKeys;
}

async function validateLocalEventsPage(
  store: LocalEventsSnapshotStore,
  key: string,
  target: string,
  hash: string,
  protection: LocalEventsGcProtection,
): Promise<void> {
  if (protection.validatedPages.has(key)) return;
  const page = await store.readJson<StoredPage>(key);
  if (!page || page.target !== target || page.sha256 !== hash || sha256(canonicalJson(storedPageDigestMaterial(page))) !== hash) {
    throw new Error(`GC_REFERENCED_PAGE_INVALID:${key}`);
  }
  protection.validatedPages.add(key);
}

async function protectLocalEventsRun(
  store: LocalEventsSnapshotStore,
  run: LocalEventsRunManifest,
  protection: LocalEventsGcProtection,
): Promise<void> {
  for (const reference of run.pages) {
    if (!reference || typeof reference.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(reference.sha256)
      || reference.key !== `${SNAPSHOT_PREFIX}/pages/${reference.sha256}.json`) {
      throw new Error('GC_ACTIVE_RUN_PAGE_INVALID');
    }
    await validateLocalEventsPage(store, reference.key, run.target, reference.sha256, protection);
    protection.protectedPages.add(reference.key);
  }
  if (run.candidateSnapshotId) {
    await protectLocalEventsSnapshot(store, run.target, run.candidateSnapshotId, protection, 'active-candidate');
  }
}

function validateCurrentPointer(value: unknown, target: string): asserts value is CurrentPointer {
  const pointer = recordValue(value);
  if (!pointer
    || pointer.schemaVersion !== 1
    || pointer.target !== target
    || typeof pointer.snapshotId !== 'string'
    || !/^[a-f0-9]{64}$/.test(pointer.snapshotId)
    || pointer.snapshotKey !== snapshotKey(target, pointer.snapshotId)
    || typeof pointer.acceptedAt !== 'string'
    || !Number.isFinite(Date.parse(pointer.acceptedAt))
    || typeof pointer.generation !== 'string'
    || pointer.generation.length === 0
    || typeof pointer.contentDigest !== 'string'
    || pointer.contentDigest.length === 0
    || typeof pointer.eventDigest !== 'string'
    || pointer.eventDigest.length === 0) {
    throw new Error(`GC_CURRENT_POINTER_INVALID:${target}`);
  }
}

function validateRunManifest(run: unknown, target: string): asserts run is LocalEventsRunManifest {
  const manifest = recordValue(run);
  if (!manifest
    || manifest.schemaVersion !== 1
    || manifest.target !== target
    || typeof manifest.runId !== 'string'
    || !Array.isArray(manifest.pages)
    || manifest.pages.length > LOCAL_EVENTS_MAX_RUN_PAGES
    || !recordValue(manifest.discovery)
    || !recordValue(manifest.events)) {
    throw new Error(`GC_ACTIVE_RUN_INVALID:${target}`);
  }
}

async function localEventsGcGuardsMatch(
  store: LocalEventsSnapshotStore,
  guards: Map<string, string | undefined>,
): Promise<boolean> {
  try {
    for (const [key, expectedVersion] of guards) {
      const current = await store.readJsonVersioned<unknown>(key);
      if (current?.version !== expectedVersion) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function localEventsGcBlocker(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return message.startsWith('GC_') ? message : 'GC_READ_FAILED';
}

export async function restoreLocalEventsCurrentPointer(
  store: LocalEventsSnapshotStore,
  options: LocalEventsPointerRestoreOptions,
): Promise<LocalEventsPointerRestoreResult> {
  const target = options.target;
  const snapshotId = options.snapshotId;
  const expectedVersion = requireVersion(options.expectedVersion, 'Current pointer restore expected version');
  const dryRun = options.dryRun ?? true;
  if (!LOCAL_EVENTS_SNAPSHOT_TARGETS.includes(target as SnapshotTargetSlug) || !/^[a-f0-9]{64}$/.test(snapshotId)) {
    throw new Error('CURRENT_POINTER_RESTORE_TARGET_INVALID');
  }
  const pointerPath = currentKey(target);
  const current = await store.readJsonVersioned<CurrentPointer>(pointerPath);
  if (!current) throw new Error('CURRENT_POINTER_MISSING');
  validateCurrentPointer(current.value, target);
  if (current.version !== expectedVersion) throw new Error('CURRENT_POINTER_ETAG_MISMATCH');
  const targetSnapshotKey = snapshotKey(target, snapshotId);
  const snapshot = await store.readJson<AcceptedLocalEventsSnapshot>(targetSnapshotKey);
  if (!snapshot) throw new Error('CURRENT_POINTER_RESTORE_SNAPSHOT_MISSING');
  await verifyAcceptedSnapshot(store, targetSnapshotKey, snapshot, undefined, { verifyPages: true });
  const resultBase = {
    target,
    snapshotId,
    previousSnapshotId: current.value.snapshotId,
    expectedVersion,
    snapshotKey: targetSnapshotKey,
    dryRun,
  };
  if (current.value.snapshotId === snapshotId) return { ...resultBase, applied: false, reason: 'ALREADY_CURRENT' };
  if (dryRun) return { ...resultBase, applied: false, reason: 'DRY_RUN' };

  const pointer: CurrentPointer = {
    schemaVersion: 1,
    target,
    snapshotId,
    acceptedAt: snapshot.acceptedAt,
    generation: snapshot.runId,
    snapshotKey: targetSnapshotKey,
    contentDigest: snapshot.contentDigest,
    eventDigest: snapshot.eventDigest,
  };
  let pointerVersion: string | undefined;
  try {
    pointerVersion = await store.compareAndSwapJson(pointerPath, pointer, expectedVersion);
    const readBack = await store.readJsonVersioned<CurrentPointer>(pointerPath);
    if (!readBack
      || readBack.version !== pointerVersion
      || readBack.value.snapshotId !== snapshotId
      || readBack.value.snapshotKey !== targetSnapshotKey
      || readBack.value.contentDigest !== snapshot.contentDigest
      || readBack.value.eventDigest !== snapshot.eventDigest) {
      throw new Error('CURRENT_POINTER_RESTORE_READBACK_FAILED');
    }
  } catch (error) {
    if (pointerVersion) {
      try {
        await store.compareAndSwapJson(pointerPath, current.value, pointerVersion);
      } catch {
        throw new Error('CURRENT_POINTER_RESTORE_ROLLBACK_FAILED');
      }
    }
    throw error;
  }
  return { ...resultBase, applied: true, newVersion: pointerVersion };
}

async function buildCandidate(store: LocalEventsSnapshotStore, run: LocalEventsRunManifest, target: LocalEventTarget, now: Date): Promise<AcceptedLocalEventsSnapshot> {
  const rawEvents: LocalEventItem[] = [];
  for (const reference of run.pages.filter((page) => page.kind === 'event')) {
    const page = await store.readJson<StoredPage>(reference.key);
    if (!page || !verifyStoredPage(reference, page) || !page.agendaUid) {
      run.blockers.push('PAGE_PROOF_MISSING');
      continue;
    }
    for (const raw of extractItems(page.payload)) {
      const record = recordValue(raw);
      if (!record) continue;
      rawEvents.push(mapOpenAgendaEvent(record, target, page.agendaUid, page.agendaTitle ?? target.title));
    }
  }
  const fromTimestamp = new Date(run.from).getTime();
  const toTimestamp = new Date(run.to).getTime();
  const deduped = dedupeEvents(rawEvents).filter((event) => {
    const timestamp = new Date(event.startDate ?? '').getTime();
    return Number.isFinite(timestamp) && timestamp >= fromTimestamp && timestamp <= toTimestamp;
  }).sort(compareEvents);
  run.counters.eventsAfterFiltering = deduped.length;
  const future = deduped.filter((event) => new Date(event.endDate ?? event.startDate ?? '').getTime() >= now.getTime());
  const latestTimestamp = future.reduce((latest, event) => {
    const value = new Date(event.endDate ?? event.startDate ?? '').getTime();
    return Number.isFinite(value) ? Math.max(latest, value) : latest;
  }, 0);
  const horizonDays = latestTimestamp > 0 ? Math.max(0, Math.floor((latestTimestamp - now.getTime()) / 86_400_000)) : 0;
  const pageHashes = run.pages.map((page) => page.sha256);
  const oldestPageTimestamp = run.pages.reduce((oldest, page) => {
    const timestamp = new Date(page.fetchedAt).getTime();
    return Number.isFinite(timestamp) ? Math.min(oldest, timestamp) : oldest;
  }, Number.POSITIVE_INFINITY);
  const freshnessAnchor = Number.isFinite(oldestPageTimestamp) ? new Date(oldestPageTimestamp) : new Date(Number.NaN);
  const snapshotAgeHours = Number.isFinite(oldestPageTimestamp)
    ? (now.getTime() - oldestPageTimestamp) / 3_600_000
    : Number.POSITIVE_INFINITY;
  const eventDigest = localEventsEventDigest(deduped);
  const dateRange = localEventsDateRange(deduped);
  const query: LocalEventSearchResponse['query'] = {
    target: target.slug,
    radius: target.radiusKm,
    limit: deduped.length,
    from: run.from,
    to: run.to,
  };
  const contentDigest = sha256(canonicalJson({ target: target.slug, query, pageHashes, events: deduped }));
  const eventTotals = new Map<string, number>();
  for (const page of run.pages.filter((item) => item.kind === 'event' && item.agendaUid)) {
    if (page.upstreamTotal !== undefined) {
      eventTotals.set(page.agendaUid!, Math.max(eventTotals.get(page.agendaUid!) ?? 0, page.upstreamTotal));
    }
  }
  const coverage: LocalEventCoverage = {
    returned: deduped.length,
    limit: deduped.length,
    complete: run.blockers.length === 0,
    truncated: false,
    agendasDiscovered: run.counters.agendasAfterDeduplication,
    agendasSelected: run.counters.agendasAfterDeduplication,
    agendasFetched: new Set(run.pages.filter((page) => page.kind === 'event').map((page) => page.agendaUid)).size,
    pagesFetched: run.counters.agendaPages + run.counters.eventPages,
    agendaDiscoveryPagesFetched: run.counters.agendaPages,
    eventPagesFetched: run.counters.eventPages,
    upstreamEventsFetched: run.counters.eventsBeforeFiltering,
    upstreamTotal: Array.from(eventTotals.values()).reduce((sum, value) => sum + value, 0),
    beforeFiltering: run.counters.eventsBeforeFiltering,
    afterFiltering: deduped.length,
    futureEventCount: future.length,
    horizonDays,
    snapshotAgeHours,
    cursorsExhausted: run.discovery.cursor === null
      && run.events.cursor === null
      && run.discovery.termIndex >= target.searchTerms.length
      && run.events.agendaIndex >= run.discovery.agendas.length,
  };
  const blockers = qualificationBlockers(coverage, store.storage, run.blockers);
  const qualification: LocalEventsQualification = {
    qualified: blockers.length === 0,
    evaluatedAt: now.toISOString(),
    blockers,
    thresholds: { minimumFutureEvents: 5, minimumHorizonDays: 14, maximumSnapshotAgeHours: 36 },
  };
  const convergence: LocalEventsConvergenceProof = {
    converged: true,
    jsonEventCount: deduped.length,
    icsEventCount: deduped.length,
    metadataEventCount: deduped.length,
    jsonEventDigest: eventDigest,
    icsEventDigest: eventDigest,
    metadataEventDigest: eventDigest,
  };
  const generatedAt = now.toISOString();
  const lastUpdated = Number.isFinite(freshnessAnchor.getTime()) ? freshnessAnchor.toISOString() : generatedAt;
  const freshUntil = new Date(new Date(lastUpdated).getTime() + 36 * 3_600_000).toISOString();
  const responseWithoutSnapshotIdentity: LocalEventSearchResponse = {
    events: deduped,
    targets: [{
      slug: target.slug, title: target.title, type: target.type, city: target.city,
      department: target.department, region: target.region, latitude: target.latitude,
      longitude: target.longitude, radiusKm: target.radiusKm,
    }],
    total: deduped.length,
    query,
    limit: deduped.length,
    contractVersion: LOCAL_EVENTS_CONTRACT_VERSION,
    lastUpdated,
    source: 'OpenAgenda v2',
    note: qualification.qualified ? undefined : 'Snapshot candidat conserve mais non promu: qualification fail-closed.',
    snapshotEventCount: deduped.length,
    snapshotEventDigest: eventDigest,
    contentDigest,
    eventDigest,
    freshUntil,
    dateRange,
    coverage,
    qualification,
    storage: store.storage,
    convergence,
    runtime: {
      freshness: snapshotAgeHours >= 0 && snapshotAgeHours <= 36 ? 'fresh' : 'stale',
      degraded: !qualification.qualified,
      fallbackUsed: false,
      lastUpdated,
    },
  };
  const provisional: AcceptedLocalEventsSnapshot = {
    schemaVersion: 1,
    snapshotId: '',
    target: target.slug,
    runId: run.runId,
    generatedAt,
    acceptedAt: generatedAt,
    pageHashes,
    contentDigest,
    eventDigest,
    response: responseWithoutSnapshotIdentity,
  };
  const snapshotId = sha256(canonicalJson(snapshotIdentityMaterial(provisional)));
  return {
    ...provisional,
    snapshotId,
    response: {
      ...responseWithoutSnapshotIdentity,
      snapshotId,
      convergence: {
        ...convergence,
        jsonSnapshotId: snapshotId,
        icsSnapshotId: snapshotId,
        metadataSnapshotId: snapshotId,
      },
    },
  };
}

function refreshSnapshotQualification(response: LocalEventSearchResponse, now: Date): LocalEventSearchResponse {
  const lastUpdated = new Date(response.lastUpdated).getTime();
  const snapshotAgeHours = Number.isFinite(lastUpdated) ? (now.getTime() - lastUpdated) / 3_600_000 : Number.POSITIVE_INFINITY;
  const coverage = { ...response.coverage, snapshotAgeHours };
  const blockers = qualificationBlockers(coverage, response.storage, response.qualification.blockers.filter((item) => item !== 'SNAPSHOT_STALE'));
  const qualified = blockers.length === 0;
  return {
    ...response,
    coverage,
    qualification: { ...response.qualification, qualified, evaluatedAt: now.toISOString(), blockers },
    runtime: { ...response.runtime, freshness: snapshotAgeHours >= 0 && snapshotAgeHours <= 36 ? 'fresh' : 'stale', degraded: !qualified },
  };
}

function qualificationBlockers(coverage: LocalEventCoverage, storage: LocalEventsStorageState, inherited: string[]): string[] {
  return Array.from(new Set([
    ...inherited,
    ...(storage.adapter !== 'vercel-blob-private' || !storage.configured || !storage.durable ? ['DURABLE_STORE_UNAVAILABLE'] : []),
    ...(!coverage.complete ? ['COVERAGE_INCOMPLETE'] : []),
    ...(coverage.truncated ? ['COVERAGE_TRUNCATED'] : []),
    ...(!coverage.cursorsExhausted ? ['CURSORS_NOT_EXHAUSTED'] : []),
    ...(coverage.futureEventCount < 5 ? ['SPARSE_FUTURE_EVENTS'] : []),
    ...(coverage.horizonDays < 14 ? ['HORIZON_INSUFFICIENT'] : []),
    ...(coverage.snapshotAgeHours < 0 ? ['SNAPSHOT_AGE_NEGATIVE'] : []),
    ...(coverage.snapshotAgeHours > 36 ? ['SNAPSHOT_STALE'] : []),
  ]));
}

async function persistPage(store: LocalEventsSnapshotStore, target: string, kind: 'agenda' | 'event', page: OpenAgendaPage, now: Date, metadata: {
  cursorBefore: Cursor;
  term?: string;
  termIndex?: number;
  agendaUid?: string;
  agendaTitle?: string;
}): Promise<PageReference> {
  const storedWithoutDigest: Omit<StoredPage, 'sha256'> = {
    schemaVersion: 1,
    target,
    kind,
    fetchedAt: now.toISOString(),
    cursorBefore: metadata.cursorBefore,
    cursorAfter: page.nextCursor,
    itemCount: page.items.length,
    upstreamTotal: page.total,
    term: metadata.term,
    termIndex: metadata.termIndex,
    agendaUid: metadata.agendaUid,
    agendaTitle: metadata.agendaTitle,
    payload: page.payload,
  };
  const digest = sha256(canonicalJson(storedPageDigestMaterial(storedWithoutDigest)));
  const key = `${SNAPSHOT_PREFIX}/pages/${digest}.json`;
  const stored: StoredPage = { ...storedWithoutDigest, sha256: digest };
  const byteLength = Buffer.byteLength(JSON.stringify(stored));
  await store.writeJson(key, stored, { overwrite: false });
  return {
    sha256: digest,
    key,
    kind,
    cursorBefore: metadata.cursorBefore,
    cursorAfter: page.nextCursor,
    itemCount: page.items.length,
    upstreamTotal: page.total,
    term: metadata.term,
    termIndex: metadata.termIndex,
    agendaUid: metadata.agendaUid,
    agendaTitle: metadata.agendaTitle,
    fetchedAt: stored.fetchedAt,
    byteLength,
  };
}

function newRun(target: LocalEventTarget, now: Date): LocalEventsRunManifest {
  const to = new Date(now.getTime() + INGESTION_HORIZON_DAYS * 86_400_000);
  const sourceAgendas = localEventSourceAgendaUids(target).map((uid) => ({ uid, title: target.title }));
  const usesPinnedSourceAgendas = sourceAgendas.length > 0;
  return {
    schemaVersion: 1,
    runId: `${now.toISOString().replace(/[-:.TZ]/g, '')}-${randomUUID()}`,
    target: target.slug,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    from: now.toISOString(),
    to: to.toISOString(),
    phase: usesPinnedSourceAgendas ? 'events' : 'discovery',
    discovery: {
      termIndex: usesPinnedSourceAgendas ? target.searchTerms.length : 0,
      cursor: null,
      seenCursorSignatures: [],
      agendas: sourceAgendas,
    },
    events: { agendaIndex: 0, cursor: null, seenCursorSignatures: [] },
    pages: [],
    counters: {
      agendaPages: 0, eventPages: 0, agendasBeforeDeduplication: sourceAgendas.length,
      agendasAfterDeduplication: sourceAgendas.length, eventsBeforeFiltering: 0, eventsAfterFiltering: 0,
      storedBytes: 0,
    },
    blockers: [],
  };
}

function applyRunResourceBounds(run: LocalEventsRunManifest): boolean {
  if (run.pages.length > LOCAL_EVENTS_MAX_RUN_PAGES) run.blockers.push('RUN_PAGE_LIMIT_EXCEEDED');
  if (run.counters.storedBytes > LOCAL_EVENTS_MAX_RUN_BYTES) run.blockers.push('RUN_BYTE_LIMIT_EXCEEDED');
  return run.blockers.some((item) => item === 'RUN_PAGE_LIMIT_EXCEEDED' || item === 'RUN_BYTE_LIMIT_EXCEEDED');
}

function discoveryPageBlocker(
  run: LocalEventsRunManifest,
  termIndex: number,
  term: string,
  page: OpenAgendaPage,
): string | undefined {
  const pages = run.pages.filter((reference) => reference.kind === 'agenda' && reference.termIndex === termIndex);
  const label = `${termIndex}:${term}`;
  if (page.total === undefined) return `UPSTREAM_AGENDA_TOTAL_UNAVAILABLE:${label}`;

  const totals = pages.map((reference) => reference.upstreamTotal);
  if (totals.some((total) => total === undefined)) return `UPSTREAM_AGENDA_TOTAL_UNAVAILABLE:${label}`;
  if (new Set(totals).size !== 1) return `UPSTREAM_AGENDA_TOTAL_INCONSISTENT:${label}`;

  const total = page.total;
  const returned = pages.reduce((sum, reference) => sum + reference.itemCount, 0);
  if (page.nextCursor === null && returned < total) {
    return `UPSTREAM_AGENDA_TOTAL_INCOMPLETE:${label}:${returned}/${total}`;
  }
  if (page.nextCursor !== null && returned >= total) {
    return `UPSTREAM_AGENDA_CURSOR_INCONSISTENT:${label}:${returned}/${total}`;
  }
  return undefined;
}

function applyUpstreamCompletenessProof(run: LocalEventsRunManifest): void {
  for (const agenda of run.discovery.agendas) {
    const agendaUid = String(agenda.uid ?? '');
    const pages = run.pages.filter((page) => page.kind === 'event' && page.agendaUid === agendaUid);
    const totals = pages.map((page) => page.upstreamTotal).filter((value): value is number => value !== undefined);
    if (pages.length === 0) {
      run.blockers.push(`AGENDA_PAGES_MISSING:${agendaUid}`);
      continue;
    }
    if (totals.length !== pages.length) {
      run.blockers.push(`UPSTREAM_TOTAL_UNAVAILABLE:${agendaUid}`);
      continue;
    }
    if (new Set(totals).size !== 1) run.blockers.push(`UPSTREAM_TOTAL_INCONSISTENT:${agendaUid}`);
    const upstreamTotal = Math.max(...totals);
    const rawItems = pages.reduce((sum, page) => sum + page.itemCount, 0);
    if (rawItems < upstreamTotal) run.blockers.push(`UPSTREAM_TOTAL_INCOMPLETE:${agendaUid}:${rawItems}/${upstreamTotal}`);
  }
}

function storedPageDigestMaterial(page: Omit<StoredPage, 'sha256'> | StoredPage): Omit<StoredPage, 'sha256'> {
  return {
    schemaVersion: page.schemaVersion,
    target: page.target,
    kind: page.kind,
    fetchedAt: page.fetchedAt,
    cursorBefore: page.cursorBefore,
    cursorAfter: page.cursorAfter,
    itemCount: page.itemCount,
    upstreamTotal: page.upstreamTotal,
    term: page.term,
    termIndex: page.termIndex,
    agendaUid: page.agendaUid,
    agendaTitle: page.agendaTitle,
    payload: page.payload,
  };
}

function verifyStoredPage(reference: PageReference, page: StoredPage): boolean {
  const digest = sha256(canonicalJson(storedPageDigestMaterial(page)));
  return page.schemaVersion === 1
    && digest === page.sha256
    && digest === reference.sha256
    && reference.key === `${SNAPSHOT_PREFIX}/pages/${digest}.json`
    && page.target.length > 0
    && page.kind === reference.kind
    && page.cursorBefore?.join('\u0000') === reference.cursorBefore?.join('\u0000')
    && page.cursorAfter?.join('\u0000') === reference.cursorAfter?.join('\u0000')
    && page.itemCount === reference.itemCount
    && page.itemCount === extractItems(page.payload).length
    && page.termIndex === reference.termIndex
    && page.fetchedAt === reference.fetchedAt
    && Buffer.byteLength(JSON.stringify(page)) === reference.byteLength;
}

function snapshotIdentityMaterial(snapshot: AcceptedLocalEventsSnapshot): unknown {
  const material = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
  delete material.snapshotId;
  const response = recordValue(material.response);
  if (response) {
    delete response.snapshotId;
    const convergence = recordValue(response.convergence);
    if (convergence) {
      delete convergence.jsonSnapshotId;
      delete convergence.icsSnapshotId;
      delete convergence.metadataSnapshotId;
    }
  }
  return material;
}

async function verifyAcceptedSnapshot(
  store: LocalEventsSnapshotStore,
  key: string,
  snapshot: AcceptedLocalEventsSnapshot,
  run?: LocalEventsRunManifest,
  options: { verifyPages?: boolean } = {},
): Promise<void> {
  const response = snapshot.response;
  const verifyPages = options.verifyPages ?? true;
  const expectedKey = snapshotKey(snapshot.target, snapshot.snapshotId);
  const calculatedSnapshotId = sha256(canonicalJson(snapshotIdentityMaterial(snapshot)));
  const calculatedEventDigest = localEventsEventDigest(response.events);
  const calculatedContentDigest = sha256(canonicalJson({
    target: snapshot.target,
    query: response.query,
    pageHashes: snapshot.pageHashes,
    events: response.events,
  }));
  if (key !== expectedKey
    || snapshot.snapshotId !== calculatedSnapshotId
    || response.snapshotId !== snapshot.snapshotId
    || response.query.target !== snapshot.target
    || response.targets.length !== 1
    || response.targets[0]?.slug !== snapshot.target
    || response.source !== 'OpenAgenda v2'
    || snapshot.contentDigest !== calculatedContentDigest
    || response.contentDigest !== calculatedContentDigest
    || snapshot.eventDigest !== calculatedEventDigest
    || response.eventDigest !== calculatedEventDigest
    || response.snapshotEventCount !== response.events.length
    || response.snapshotEventDigest !== calculatedEventDigest
    || canonicalJson(response.dateRange) !== canonicalJson(localEventsDateRange(response.events))
    || response.total !== response.events.length
    || response.limit !== response.query.limit
    || response.coverage.returned !== response.events.length
    || response.coverage.afterFiltering !== response.events.length
    || response.coverage.pagesFetched !== snapshot.pageHashes.length
    || response.convergence.jsonSnapshotId !== snapshot.snapshotId
    || response.convergence.icsSnapshotId !== snapshot.snapshotId
    || response.convergence.metadataSnapshotId !== snapshot.snapshotId
    || response.convergence.jsonEventCount !== response.events.length
    || response.convergence.icsEventCount !== response.events.length
    || response.convergence.metadataEventCount !== response.events.length
    || response.convergence.jsonEventDigest !== calculatedEventDigest
    || response.convergence.icsEventDigest !== calculatedEventDigest
    || response.convergence.metadataEventDigest !== calculatedEventDigest) {
    throw new Error('SNAPSHOT_READBACK_PROOF_INVALID');
  }
  if (run && canonicalJson(snapshot.pageHashes) !== canonicalJson(run.pages.map((page) => page.sha256))) {
    throw new Error('SNAPSHOT_PAGE_HASHES_MISMATCH');
  }
  if (verifyPages) {
    for (const hash of snapshot.pageHashes) {
      const pageKey = `${SNAPSHOT_PREFIX}/pages/${hash}.json`;
      const page = await store.readJson<StoredPage>(pageKey);
      if (!page || page.target !== snapshot.target || page.sha256 !== hash || sha256(canonicalJson(storedPageDigestMaterial(page))) !== hash) {
        throw new Error('SNAPSHOT_PAGE_READBACK_INVALID');
      }
    }
  }
}

function activeRun(store: LocalEventsSnapshotStore, target: string) {
  return store.readJsonVersioned<LocalEventsRunManifest>(activeRunKey(target));
}

function readCurrentPointer(store: LocalEventsSnapshotStore, target: string) {
  return store.readJson<CurrentPointer>(currentKey(target));
}

function activeRunKey(target: string) { return `${SNAPSHOT_PREFIX}/runs/${target}/active.json`; }
function currentKey(target: string) { return `${SNAPSHOT_PREFIX}/current/${target}.json`; }
function snapshotKey(target: string, snapshotId: string) { return `${SNAPSHOT_PREFIX}/snapshots/${target}/${snapshotId}.json`; }

function appendCursor(url: URL, cursor: Cursor): void {
  for (const value of cursor ?? []) url.searchParams.append('after[]', value);
}

function normalizeCursor(value: unknown): Cursor {
  if (Array.isArray(value)) {
    const values = value.filter((item) => typeof item === 'string' || typeof item === 'number').map(String);
    return values.length > 0 ? values : null;
  }
  if (typeof value === 'string' || typeof value === 'number') return [String(value)];
  return null;
}

function cursorSignature(cursor: Cursor): string { return JSON.stringify(cursor ?? []); }

function extractItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = recordValue(payload);
  if (!record) return [];
  for (const key of ['agendas', 'events', 'data', 'items']) if (Array.isArray(record[key])) return record[key] as unknown[];
  return [];
}

function asAgenda(value: unknown): OpenAgendaAgenda | undefined {
  const record = recordValue(value);
  const uid = record?.uid;
  if (typeof uid !== 'string' && typeof uid !== 'number') return undefined;
  return { uid, title: record?.title, name: record?.name, slug: typeof record?.slug === 'string' ? record.slug : undefined };
}

function dedupeAgendas(agendas: OpenAgendaAgenda[]): OpenAgendaAgenda[] {
  return Array.from(new Map(agendas.filter((agenda) => agenda.uid !== undefined).map((agenda) => [String(agenda.uid), agenda])).values());
}

function dedupeEvents(events: LocalEventItem[]): LocalEventItem[] {
  return Array.from(new Map(events.map((event) => [event.id, event])).values());
}

function compareEvents(left: LocalEventItem, right: LocalEventItem): number {
  return (left.startDate ?? '').localeCompare(right.startDate ?? '') || left.title.localeCompare(right.title);
}

function localizedText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  const record = recordValue(value);
  if (!record) return undefined;
  for (const key of ['fr', 'en', 'value']) if (typeof record[key] === 'string' && String(record[key]).trim()) return String(record[key]).trim();
  return undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function requireVersion(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${context}: empty version/ETag`);
  return value;
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && /abort|timeout/i.test(`${error.name}:${error.message}`);
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function delay(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

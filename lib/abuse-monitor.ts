import type { VercelRequest } from '@vercel/node';
import { executeUpstashPipeline, isUpstashConfigured } from './upstash-rest';
import { sendAlertEmail } from './alert-email';

export type AbuseMonitorMode = 'observe' | 'enforce';

export interface AbuseDecision {
  mode: AbuseMonitorMode;
  provider: 'upstash' | 'disabled';
  blocked: boolean;
  reason?: string;
  headers: Record<string, string>;
  metrics?: {
    endpoint: string;
    slug: string;
    ipHash: string;
    uaHash: string;
    isKnownUA: boolean;
    global1m: number;
    global5m: number;
    ip1m: number;
    ua1m: number;
  };
}

interface EndpointAbuseSnapshot {
  oneMinute: number;
  fiveMinutes: number;
  oneHour: number;
}

export interface AbuseSummary {
  mode: AbuseMonitorMode;
  provider: 'upstash' | 'disabled';
  endpoints: Record<string, EndpointAbuseSnapshot>;
  topIpHashes: Array<{ hash: string; count: number }>;
  topUaHashes: Array<{ hash: string; count: number }>;
}

const WINDOW_SECONDS = {
  oneMinute: 60,
  fiveMinutes: 300,
  oneHour: 3600,
} as const;

const KNOWN_UA_REGEX = [
  /FacilAbo/i,
  /CFNetwork/i,
  /Calendar/i,
  /iCalendar/i,
  /iPhone|iPad|iOS/i,
  /AppleCoreMedia/i,
  /Mozilla/i,
  /Mac OS X/i,
];

function getMode(): AbuseMonitorMode {
  const raw = (process.env.ABUSE_MONITOR_MODE || 'observe').toLowerCase();
  return raw === 'enforce' ? 'enforce' : 'observe';
}

function getThreshold(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:-]/g, '-').slice(0, 120);
}

function normalizeIp(raw: string | undefined): string {
  if (!raw) return 'unknown';
  const first = raw.split(',')[0].trim();
  if (!first) return 'unknown';
  // Remove IPv6 mapped IPv4 prefix and ports
  return first
    .replace(/^::ffff:/, '')
    .replace(/^\[(.*)](?::\d+)?$/, '$1')
    .replace(/:\d+$/, '');
}

function hashShort(input: string): string {
  const crypto = require('crypto') as typeof import('crypto');
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function toInt(value: unknown): number {
  if (typeof value === 'number') return Math.max(0, Math.trunc(value));
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  }
  return 0;
}

function isKnownUserAgent(ua: string): boolean {
  return KNOWN_UA_REGEX.some((pattern) => pattern.test(ua));
}

function buildCounterKey(kind: 'global' | 'slug' | 'ip' | 'ua', endpoint: string, windowSec: number, token?: string): string {
  const base = `abuse:v1:${kind}:${sanitizeToken(endpoint)}:${windowSec}s`;
  return token ? `${base}:${sanitizeToken(token)}` : base;
}

function buildTopKey(kind: 'topip' | 'topua', endpoint: string): string {
  return `abuse:v1:${kind}:${sanitizeToken(endpoint)}:${WINDOW_SECONDS.fiveMinutes}s`;
}

async function notifyCriticalAbuse(input: {
  endpoint: string;
  slug: string;
  ipHash: string;
  uaHash: string;
  global1m: number;
  ip1m: number;
  ua1m: number;
  mode: AbuseMonitorMode;
}): Promise<void> {
  const subject = `[FacilAbo] Abuse spike detecte (${input.endpoint})`;
  const body = [
    'Alerte anti-abus (critique)',
    `- Endpoint: ${input.endpoint}`,
    `- Slug: ${input.slug}`,
    `- Mode: ${input.mode}`,
    `- global(1m): ${input.global1m}`,
    `- ip(1m): ${input.ip1m}`,
    `- ua(1m): ${input.ua1m}`,
    `- ipHash: ${input.ipHash}`,
    `- uaHash: ${input.uaHash}`,
    `- Timestamp: ${new Date().toISOString()}`,
  ].join('\n');

  await sendAlertEmail({
    subject,
    text: body,
    dedupKey: `abuse:${sanitizeToken(input.endpoint)}:${sanitizeToken(input.slug)}:${input.ipHash}`,
    dedupWindowSeconds: 1800,
  });
}

export async function trackAbuseRequest(
  req: VercelRequest,
  options: { endpoint: string; slug?: string }
): Promise<AbuseDecision> {
  const mode = getMode();
  const provider: 'upstash' | 'disabled' = isUpstashConfigured() ? 'upstash' : 'disabled';

  const uaRaw = String(req.headers['user-agent'] || 'unknown').slice(0, 256);
  const ipRaw = normalizeIp(
    String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown')
  );

  const ua = uaRaw || 'unknown';
  const slug = sanitizeToken(options.slug || 'none');
  const endpoint = sanitizeToken(options.endpoint);
  const ipHash = hashShort(ipRaw);
  const uaHash = hashShort(ua);
  const knownUA = isKnownUserAgent(ua);

  const headers: Record<string, string> = {
    'X-FacilAbo-Abuse-Mode': mode,
    'X-FacilAbo-Abuse-Provider': provider,
  };

  if (provider === 'disabled') {
    return {
      mode,
      provider,
      blocked: false,
      headers,
    };
  }

  const commands: unknown[][] = [];
  const index: Record<string, number> = {};
  const trackWindows = [WINDOW_SECONDS.oneMinute, WINDOW_SECONDS.fiveMinutes, WINDOW_SECONDS.oneHour];

  for (const windowSec of trackWindows) {
    const suffix = `${windowSec}s`;

    const globalKey = buildCounterKey('global', endpoint, windowSec);
    const slugKey = buildCounterKey('slug', endpoint, windowSec, slug);
    const ipKey = buildCounterKey('ip', endpoint, windowSec, ipHash);
    const uaKey = buildCounterKey('ua', endpoint, windowSec, uaHash);

    index[`global:${suffix}`] = commands.length;
    commands.push(['INCR', globalKey]);
    commands.push(['EXPIRE', globalKey, windowSec + 30]);

    index[`slug:${suffix}`] = commands.length;
    commands.push(['INCR', slugKey]);
    commands.push(['EXPIRE', slugKey, windowSec + 30]);

    index[`ip:${suffix}`] = commands.length;
    commands.push(['INCR', ipKey]);
    commands.push(['EXPIRE', ipKey, windowSec + 30]);

    index[`ua:${suffix}`] = commands.length;
    commands.push(['INCR', uaKey]);
    commands.push(['EXPIRE', uaKey, windowSec + 30]);
  }

  const topIpKey = buildTopKey('topip', endpoint);
  const topUaKey = buildTopKey('topua', endpoint);
  commands.push(['ZINCRBY', topIpKey, 1, ipHash]);
  commands.push(['EXPIRE', topIpKey, WINDOW_SECONDS.fiveMinutes + 30]);
  commands.push(['ZINCRBY', topUaKey, 1, uaHash]);
  commands.push(['EXPIRE', topUaKey, WINDOW_SECONDS.fiveMinutes + 30]);

  const results = await executeUpstashPipeline(commands);
  if (!results) {
    return {
      mode,
      provider,
      blocked: false,
      headers,
    };
  }

  const global1m = toInt(results[index['global:60s']]);
  const global5m = toInt(results[index['global:300s']]);
  const ip1m = toInt(results[index['ip:60s']]);
  const ua1m = toInt(results[index['ua:60s']]);

  headers['X-FacilAbo-Abuse-Window-1m'] = String(global1m);
  headers['X-FacilAbo-Abuse-Window-5m'] = String(global5m);

  const spikeGlobal1m = getThreshold('ABUSE_SPIKE_GLOBAL_1M', 6000);
  const burstIpSoft1m = getThreshold('ABUSE_BURST_IP_SOFT_1M', 260);
  const burstIpHard1m = getThreshold('ABUSE_BURST_IP_HARD_1M', 420);
  const spikeUnknownUa1m = getThreshold('ABUSE_SPIKE_UNKNOWN_UA_1M', 1200);

  const critical = global1m >= spikeGlobal1m || ip1m >= burstIpHard1m || (!knownUA && ua1m >= spikeUnknownUa1m);
  const warning = !critical && (ip1m >= burstIpSoft1m || ua1m >= Math.floor(spikeUnknownUa1m * 0.5));

  let blocked = false;
  let reason: string | undefined;

  if (mode === 'enforce') {
    if (!knownUA && (ip1m >= burstIpHard1m || ua1m >= spikeUnknownUa1m)) {
      blocked = true;
      reason = 'rate_limit_exceeded';
    }
  }

  if (critical) {
    await notifyCriticalAbuse({
      endpoint,
      slug,
      ipHash,
      uaHash,
      global1m,
      ip1m,
      ua1m,
      mode,
    }).catch(() => {
      // Fail-open: never block request path if email notification fails.
    });
  }

  return {
    mode,
    provider,
    blocked,
    reason,
    headers: {
      ...headers,
      'X-FacilAbo-Abuse-Severity': critical ? 'critical' : warning ? 'warning' : 'normal',
    },
    metrics: {
      endpoint,
      slug,
      ipHash,
      uaHash,
      isKnownUA: knownUA,
      global1m,
      global5m,
      ip1m,
      ua1m,
    },
  };
}

function parseTopList(raw: unknown): Array<{ hash: string; count: number }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ hash: string; count: number }> = [];
  for (let i = 0; i < raw.length; i += 2) {
    const hash = typeof raw[i] === 'string' ? raw[i] : '';
    if (!hash) continue;
    const count = toInt(raw[i + 1]);
    out.push({ hash, count });
  }
  return out;
}

export async function getAbuseSummary(): Promise<AbuseSummary> {
  const mode = getMode();
  const provider: 'upstash' | 'disabled' = isUpstashConfigured() ? 'upstash' : 'disabled';

  if (provider === 'disabled') {
    return {
      mode,
      provider,
      endpoints: {
        calendars: { oneMinute: 0, fiveMinutes: 0, oneHour: 0 },
        metadata: { oneMinute: 0, fiveMinutes: 0, oneHour: 0 },
      },
      topIpHashes: [],
      topUaHashes: [],
    };
  }

  const calendarKeys = [
    buildCounterKey('global', 'calendars', WINDOW_SECONDS.oneMinute),
    buildCounterKey('global', 'calendars', WINDOW_SECONDS.fiveMinutes),
    buildCounterKey('global', 'calendars', WINDOW_SECONDS.oneHour),
  ];

  const metadataKeys = [
    buildCounterKey('global', 'metadata', WINDOW_SECONDS.oneMinute),
    buildCounterKey('global', 'metadata', WINDOW_SECONDS.fiveMinutes),
    buildCounterKey('global', 'metadata', WINDOW_SECONDS.oneHour),
  ];

  const results = await executeUpstashPipeline([
    ['MGET', ...calendarKeys],
    ['MGET', ...metadataKeys],
    ['ZREVRANGE', buildTopKey('topip', 'calendars'), 0, 9, 'WITHSCORES'],
    ['ZREVRANGE', buildTopKey('topua', 'calendars'), 0, 9, 'WITHSCORES'],
  ]);

  if (!results) {
    return {
      mode,
      provider,
      endpoints: {
        calendars: { oneMinute: 0, fiveMinutes: 0, oneHour: 0 },
        metadata: { oneMinute: 0, fiveMinutes: 0, oneHour: 0 },
      },
      topIpHashes: [],
      topUaHashes: [],
    };
  }

  const calendars = Array.isArray(results[0]) ? results[0] : [];
  const metadata = Array.isArray(results[1]) ? results[1] : [];

  return {
    mode,
    provider,
    endpoints: {
      calendars: {
        oneMinute: toInt(calendars[0]),
        fiveMinutes: toInt(calendars[1]),
        oneHour: toInt(calendars[2]),
      },
      metadata: {
        oneMinute: toInt(metadata[0]),
        fiveMinutes: toInt(metadata[1]),
        oneHour: toInt(metadata[2]),
      },
    },
    topIpHashes: parseTopList(results[2]),
    topUaHashes: parseTopList(results[3]),
  };
}

export async function getAbuseHealthSummary(): Promise<{ mode: AbuseMonitorMode; provider: 'upstash' | 'disabled'; requests5m: number; suspicious: boolean; }>{
  const summary = await getAbuseSummary();
  const requests5m = summary.endpoints.calendars.fiveMinutes + summary.endpoints.metadata.fiveMinutes;
  const suspicious = summary.topIpHashes.some((entry) => entry.count >= getThreshold('ABUSE_BURST_IP_HARD_1M', 420));

  return {
    mode: summary.mode,
    provider: summary.provider,
    requests5m,
    suspicious,
  };
}

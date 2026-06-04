import type { VercelRequest } from '@vercel/node';

export type AbuseMonitorMode = 'observe' | 'enforce';
type AbuseMonitorProvider = 'disabled';

export interface AbuseDecision {
  mode: AbuseMonitorMode;
  provider: AbuseMonitorProvider;
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
  provider: AbuseMonitorProvider;
  endpoints: Record<string, EndpointAbuseSnapshot>;
  topIpHashes: Array<{ hash: string; count: number }>;
  topUaHashes: Array<{ hash: string; count: number }>;
}

const ZERO_ENDPOINTS = {
  calendars: { oneMinute: 0, fiveMinutes: 0, oneHour: 0 },
  metadata: { oneMinute: 0, fiveMinutes: 0, oneHour: 0 },
};

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

function sanitizeToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:-]/g, '-').slice(0, 120);
}

function normalizeIp(raw: string | undefined): string {
  if (!raw) return 'unknown';
  const first = raw.split(',')[0].trim();
  if (!first) return 'unknown';
  return first
    .replace(/^::ffff:/, '')
    .replace(/^\[(.*)](?::\d+)?$/, '$1')
    .replace(/:\d+$/, '');
}

function hashShort(input: string): string {
  const crypto = require('crypto') as typeof import('crypto');
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function isKnownUserAgent(ua: string): boolean {
  return KNOWN_UA_REGEX.some((pattern) => pattern.test(ua));
}

export async function trackAbuseRequest(
  req: VercelRequest,
  options: { endpoint: string; slug?: string }
): Promise<AbuseDecision> {
  const mode = getMode();
  const provider: AbuseMonitorProvider = 'disabled';

  const uaRaw = String(req.headers['user-agent'] || 'unknown').slice(0, 256);
  const ipRaw = normalizeIp(
    String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown')
  );

  const ua = uaRaw || 'unknown';
  const slug = sanitizeToken(options.slug || 'none');
  const endpoint = sanitizeToken(options.endpoint);
  const ipHash = hashShort(ipRaw);
  const uaHash = hashShort(ua);

  return {
    mode,
    provider,
    blocked: false,
    headers: {
      'X-FacilAbo-Abuse-Mode': mode,
      'X-FacilAbo-Abuse-Provider': provider,
      'X-FacilAbo-Abuse-Severity': 'disabled',
    },
    metrics: {
      endpoint,
      slug,
      ipHash,
      uaHash,
      isKnownUA: isKnownUserAgent(ua),
      global1m: 0,
      global5m: 0,
      ip1m: 0,
      ua1m: 0,
    },
  };
}

export async function getAbuseSummary(): Promise<AbuseSummary> {
  return {
    mode: getMode(),
    provider: 'disabled',
    endpoints: ZERO_ENDPOINTS,
    topIpHashes: [],
    topUaHashes: [],
  };
}

export async function getAbuseHealthSummary(): Promise<{
  mode: AbuseMonitorMode;
  provider: AbuseMonitorProvider;
  requests5m: number;
  suspicious: boolean;
}> {
  return {
    mode: getMode(),
    provider: 'disabled',
    requests5m: 0,
    suspicious: false,
  };
}

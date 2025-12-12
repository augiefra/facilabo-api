// Types for TV Schedule API

export interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  date: string; // ISO 8601 format
  time: string; // HH:mm format
  channel: string;
  channelKey: ChannelKey;
  competition: string;
}

export type ChannelKey =
  | 'dazn'
  | 'ligue1plus'
  | 'canalplus'
  | 'beinsports'
  | 'amazonprime'
  | 'francetv'
  | 'unknown';

export interface TVScheduleResponse {
  competition: string;
  matches: Match[];
  lastUpdated: string;
  source: string;
}

export interface ErrorResponse {
  error: string;
  message: string;
}

// Channel mapping from logo alt text
export const CHANNEL_MAPPING: Record<string, { name: string; key: ChannelKey }> = {
  'ligue 1+': { name: 'Ligue 1+', key: 'ligue1plus' },
  'ligue1+': { name: 'Ligue 1+', key: 'ligue1plus' },
  'dazn': { name: 'DAZN', key: 'dazn' },
  'bein': { name: 'beIN Sports', key: 'beinsports' },
  'bein sports': { name: 'beIN Sports', key: 'beinsports' },
  'canal+': { name: 'Canal+', key: 'canalplus' },
  'canal plus': { name: 'Canal+', key: 'canalplus' },
  'amazon': { name: 'Prime Video', key: 'amazonprime' },
  'prime': { name: 'Prime Video', key: 'amazonprime' },
  'france': { name: 'France TV', key: 'francetv' },
};

// Simple in-memory cache
interface CacheEntry {
  data: TVScheduleResponse;
  timestamp: number;
}

const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

export function getCached(key: string): TVScheduleResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

export function setCache(key: string, data: TVScheduleResponse): void {
  cache.set(key, { data, timestamp: Date.now() });
}

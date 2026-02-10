/**
 * FacilAbo API v1 - Calendar Proxy
 *
 * Fetches ICS calendar from source, renames X-WR-CALNAME to French,
 * and returns the modified calendar.
 *
 * @endpoint GET /api/v1/calendars/[slug]
 * @example GET /api/v1/calendars/f1
 * @example GET /api/v1/calendars/psg
 *
 * @source calendar-mappings.ts
 * @returns ICS file with French calendar name
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getMapping, getAllMappings } from '../../../lib/calendar-mappings';
import { fetchWithRetry, createRetryLogger, RETRY_CONFIGS } from '../../../lib/retry-utils';
import { getCache, getStaleCache, setCache, CACHE_TTL } from '../../../lib/v1-utils';
import { trackAbuseRequest } from '../../../lib/abuse-monitor';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug } = req.query;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Missing calendar slug' });
  }

  const abuseDecision = await trackAbuseRequest(req, { endpoint: 'calendars', slug });
  Object.entries(abuseDecision.headers).forEach(([key, value]) => res.setHeader(key, value));
  if (abuseDecision.blocked) {
    if (req.method === 'HEAD') {
      return res.status(429).end();
    }
    return res.status(429).json({
      error: 'Too many requests',
      code: abuseDecision.reason || 'rate_limit_exceeded',
      mode: abuseDecision.mode,
    });
  }

  // Handle "list" endpoint
  if (slug === 'list') {
    if (req.method === 'HEAD') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).end();
    }
    return res.status(200).json({
      calendars: Object.entries(getAllMappings()).map(([key, mapping]) => ({
        slug: key,
        name: mapping.frenchName,
        description: mapping.description,
      })),
    });
  }

  const mapping = getMapping(slug);

  if (!mapping) {
    return res.status(404).json({
      error: 'Calendar not found',
      availableSlugs: 'Use /api/v1/calendars/list for full list'
    });
  }

  const suffixParam = typeof req.query.suffix === 'string' ? req.query.suffix.toLowerCase() : '';
  const disableSuffix = suffixParam === 'off' || suffixParam === '0' || suffixParam === 'false';
  const displayName = disableSuffix ? mapping.frenchName : `${mapping.frenchName} (FacilAbo)`;
  const retryLogger = createRetryLogger(`calendar:${slug}`);
  const cacheKey = `v1:ics:${slug}:suffix:${disableSuffix ? 'off' : 'on'}`;

  const cached = getCache<string>(cacheKey);
  if (cached) {
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.ics"`);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    res.setHeader('X-Facilabo-Cache', 'hit');
    return res.status(200).send(cached);
  }

  if (req.method === 'HEAD') {
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.ics"`);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    return res.status(200).end();
  }

  try {
    const response = await fetchWithRetry(
      mapping.sourceUrl,
      {
        headers: {
          'User-Agent': 'FacilAbo/1.0 (iOS Calendar App)',
          'Accept': 'text/calendar, text/plain, */*',
        },
      },
      {
        ...RETRY_CONFIGS.calendar,
        onRetry: retryLogger,
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch calendar: ${response.status}`);
      return res.status(502).json({
        error: 'Failed to fetch calendar from source',
        status: response.status
      });
    }

    let icsContent = await response.text();

    // Some sources contain human-readable comment markers (e.g. "# 2028") or blank lines,
    // which are not valid in iCalendar and can make Calendar.app reject the feed.
    // Filter them out, preserve RFC5545 folding, then normalize to CRLF.
    const rawLines = icsContent.split(/\r?\n/);
    const filteredLines = rawLines.filter((line) => {
      if (line.length === 0) return false; // strip empty lines (invalid in some clients)
      if (line.startsWith('#') || line.startsWith(';')) return false; // strip comments
      return true;
    });

    const upsertHeaderProp = (lines: string[], key: string, value: string) => {
      const headerEnd = lines.findIndex((l) => l.startsWith('BEGIN:VEVENT'));
      const endIndex = headerEnd === -1 ? lines.length : headerEnd;
      const header = lines.slice(0, endIndex);
      const rest = lines.slice(endIndex);

      const prefix = `${key}:`;
      const existingIndex = header.findIndex((l) => l.startsWith(prefix));
      if (existingIndex >= 0) {
        header[existingIndex] = `${prefix}${value}`;
      } else {
        const beginIndex = header.findIndex((l) => l === 'BEGIN:VCALENDAR');
        const insertIndex = beginIndex >= 0 ? beginIndex + 1 : 0;
        header.splice(insertIndex, 0, `${prefix}${value}`);
      }

      return header.concat(rest);
    };

    let lines = filteredLines;
    lines = upsertHeaderProp(lines, 'X-WR-CALNAME', displayName);
    lines = upsertHeaderProp(lines, 'NAME', displayName);

    icsContent = lines.join('\r\n');
    if (!icsContent.endsWith('\r\n')) icsContent += '\r\n';

    // Update PRODID
    if (icsContent.includes('PRODID:')) {
      icsContent = icsContent.replace(
        /PRODID:.*/g,
        'PRODID:-//FacilAbo//Calendar Proxy v1//FR'
      );
    }

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.ics"`);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');

    setCache(cacheKey, icsContent, CACHE_TTL.CALENDAR);
    res.setHeader('X-Facilabo-Cache', 'miss');
    return res.status(200).send(icsContent);

  } catch (error) {
    console.error('Calendar proxy error:', error);
    const stale = getStaleCache<string>(cacheKey);
    if (stale) {
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${slug}.ics"`);
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
      res.setHeader('X-Facilabo-Cache', 'stale');
      return res.status(200).send(stale);
    }
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

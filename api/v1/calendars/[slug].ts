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

import type { VercelRequest, VercelResponse } from '../../../lib/vercel-http';
import { getMapping, getAllMappings, getCalendarCacheControlHeader, getCalendarCachePolicy } from '../../../lib/calendar-mappings';
import { fetchWithRetry, createRetryLogger, RETRY_CONFIGS } from '../../../lib/retry-utils';
import { getCache, getStaleCache, setCache } from '../../../lib/v1-utils';
import { trackAbuseRequest } from '../../../lib/abuse-monitor';
import { applyCalendarTransform } from '../../../lib/ics-transforms';
import { buildCalendarListResponse } from '../../../lib/calendar-catalog';
import { getAcceptedLocalEventsSnapshot, localEventsTargetFromSourceUrl } from '../../../lib/local-events-snapshot';

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
    return res.status(200).json(buildCalendarListResponse(getAllMappings()));
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
  const localEventsTarget = localEventsTargetFromSourceUrl(mapping.sourceUrl);
  if (localEventsTarget) {
    try {
      const accepted = await getAcceptedLocalEventsSnapshot(localEventsTarget);
      if (accepted) {
        let snapshotIcs = applyCalendarTransform(slug, accepted.ics)
          .replace(/^X-WR-CALNAME:.*$/m, `X-WR-CALNAME:${displayName}`)
          .replace(/^NAME:.*$/m, `NAME:${displayName}`)
          .replace(/^PRODID:.*$/m, 'PRODID:-//FacilAbo//Calendar Proxy v1//FR');
        if (!snapshotIcs.endsWith('\r\n')) snapshotIcs += '\r\n';
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${slug}.ics"`);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Facilabo-Cache', 'accepted-snapshot');
        res.setHeader('X-Facilabo-Local-Events-State', accepted.response.runtime.freshness);
        res.setHeader('X-Facilabo-Snapshot-Id', accepted.response.snapshotId ?? '');
        res.setHeader('X-Facilabo-Snapshot-Event-Digest', accepted.response.snapshotEventDigest ?? accepted.response.eventDigest ?? '');
        res.setHeader('X-Facilabo-Event-Digest', accepted.response.eventDigest ?? '');
        res.setHeader('X-Facilabo-Local-Events-Qualified', String(accepted.response.qualification.qualified));
        if (req.method === 'HEAD') return res.status(200).end();
        return res.status(200).send(snapshotIcs);
      }
    } catch (error) {
      console.error(`[calendar:${slug}] accepted local-events snapshot unavailable; existing fail-closed fallback retained`, error);
    }
  }
  const retryLogger = createRetryLogger(`calendar:${slug}`);
  const cacheKey = `v1:ics:${slug}:suffix:${disableSuffix ? 'off' : 'on'}`;
  const cachePolicy = getCalendarCachePolicy(slug);
  const cacheControlValue = getCalendarCacheControlHeader(slug);

  const cached = localEventsTarget ? undefined : getCache<string>(cacheKey);
  if (cached) {
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.ics"`);
    res.setHeader('Cache-Control', cacheControlValue);
    res.setHeader('X-Facilabo-Cache', 'hit');
    return res.status(200).send(cached);
  }

  if (req.method === 'HEAD') {
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.ics"`);
    res.setHeader('Cache-Control', localEventsTarget ? 'no-store' : cacheControlValue);
    if (localEventsTarget) {
      res.setHeader('X-FacilAbo-Local-Events-Qualified', 'false');
      res.setHeader('X-FacilAbo-Local-Events-State', 'unavailable');
    }
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
    icsContent = applyCalendarTransform(slug, icsContent);

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
    if (localEventsTarget) lines = upsertHeaderProp(lines, 'X-FACILABO-QUALIFIED', 'FALSE');

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
    const sourceSnapshotId = response.headers.get('x-facilabo-snapshot-id');
    res.setHeader('Cache-Control', localEventsTarget ? 'no-store' : cacheControlValue);
    if (localEventsTarget) {
      if (sourceSnapshotId) {
        res.setHeader('X-Facilabo-Snapshot-Id', sourceSnapshotId);
      }
      const sourceEventDigest = response.headers.get('x-facilabo-event-digest');
      if (sourceEventDigest) res.setHeader('X-Facilabo-Event-Digest', sourceEventDigest);
      res.setHeader('X-Facilabo-Local-Events-Qualified', 'false');
      res.setHeader('X-Facilabo-Local-Events-State', 'unavailable');
    }

    if (!localEventsTarget) setCache(cacheKey, icsContent, cachePolicy.inMemoryTtl);
    res.setHeader('X-Facilabo-Cache', localEventsTarget ? 'unqualified-fallback' : 'miss');
    return res.status(200).send(icsContent);

  } catch (error) {
    console.error('Calendar proxy error:', error);
    const stale = localEventsTarget ? undefined : getStaleCache<string>(cacheKey);
    if (stale) {
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${slug}.ics"`);
      res.setHeader('Cache-Control', cacheControlValue);
      res.setHeader('X-Facilabo-Cache', 'stale');
      return res.status(200).send(stale);
    }
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

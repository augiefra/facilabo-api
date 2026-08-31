import type { VercelRequest, VercelResponse } from '../../lib/vercel-http';
import { applyServiceCors, ensureGetMethod, handleServiceOptions } from '../../lib/service-search-utils';
import { getLocalEventTargetSummaries, searchLocalEvents } from '../../lib/local-events';
import { getAcceptedLocalEventsSnapshot, projectAcceptedLocalEventsResponse } from '../../lib/local-events-snapshot';

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function numberParam(value: string | string[] | undefined): number | undefined {
  const raw = first(value);
  if (!raw) return undefined;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleServiceOptions(req, res)) {
    return;
  }

  applyServiceCors(res);

  if (!ensureGetMethod(req, res)) {
    return;
  }

  const limit = numberParam(req.query.limit);
  const radius = numberParam(req.query.radius);
  const lat = numberParam(req.query.lat);
  const lng = numberParam(req.query.lng);
  const target = first(req.query.target)?.trim();
  const city = first(req.query.city)?.trim();
  const from = first(req.query.from)?.trim();
  const to = first(req.query.to)?.trim();

  if (first(req.query.list) === 'targets') {
    return res.status(200).json({
      targets: getLocalEventTargetSummaries(),
      total: getLocalEventTargetSummaries().length,
    });
  }

  if (lat !== undefined && (lat < -90 || lat > 90)) {
    return res.status(400).json({ error: 'Bad Request', message: 'lat must be between -90 and 90' });
  }
  if (lng !== undefined && (lng < -180 || lng > 180)) {
    return res.status(400).json({ error: 'Bad Request', message: 'lng must be between -180 and 180' });
  }
  if ((lat === undefined) !== (lng === undefined)) {
    return res.status(400).json({ error: 'Bad Request', message: 'lat and lng must be provided together' });
  }
  if (radius !== undefined && (radius <= 0 || radius > 300)) {
    return res.status(400).json({ error: 'Bad Request', message: 'radius must be between 1 and 300 km' });
  }
  if (limit !== undefined && (limit < 1 || limit > 80)) {
    return res.status(400).json({ error: 'Bad Request', message: 'limit must be between 1 and 80' });
  }

  if (target && city === undefined && lat === undefined && lng === undefined && from === undefined && to === undefined) {
    try {
      const accepted = await getAcceptedLocalEventsSnapshot(target);
      const canServeAccepted = accepted
        && (radius === undefined || radius === accepted.response.query.radius);
      if (accepted && canServeAccepted) {
        const response = projectAcceptedLocalEventsResponse(accepted.response, limit);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Facilabo-Local-Events-State', response.runtime.freshness);
        res.setHeader('X-Facilabo-Snapshot-Id', response.snapshotId ?? '');
        res.setHeader('X-Facilabo-Snapshot-Event-Digest', response.snapshotEventDigest ?? '');
        res.setHeader('X-Facilabo-Event-Digest', response.eventDigest ?? '');
        res.setHeader('X-Facilabo-Local-Events-Qualified', String(response.qualification.qualified));
        return res.status(200).json(response);
      }
    } catch (error) {
      console.error('[local-events] accepted snapshot read failed; direct mode remains fail-closed', error);
    }
  }

  const payload = await searchLocalEvents({
    target,
    city,
    lat,
    lng,
    radius,
    limit,
    from,
    to,
  });

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Facilabo-Local-Events-State', 'unavailable');
  res.setHeader('X-Facilabo-Local-Events-Qualified', 'false');
  if (payload.eventDigest) res.setHeader('X-Facilabo-Event-Digest', payload.eventDigest);
  return res.status(200).json(payload);
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyServiceCors, handleServiceOptions } from '../../../../lib/service-search-utils';
import { getLocalEventTarget, localEventsToIcs, searchLocalEvents } from '../../../../lib/local-events';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleServiceOptions(req, res)) {
    return;
  }

  applyServiceCors(res);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawTarget = req.query.target;
  const slug = Array.isArray(rawTarget) ? rawTarget[0] : rawTarget;
  if (!slug) {
    return res.status(400).json({ error: 'Missing local event target' });
  }

  const target = getLocalEventTarget(slug);
  if (!target) {
    return res.status(404).json({ error: 'Local event target not found' });
  }

  const response = await searchLocalEvents({
    target: target.slug,
    radius: target.radiusKm,
    limit: 80,
  });

  const note = response.note ? ` ${response.note}` : '';
  const description = `${target.title} via OpenAgenda.${note}`.trim();
  const ics = localEventsToIcs(target.title, description, response.events);

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${target.slug}.ics"`);
  res.setHeader('Cache-Control', response.runtime.degraded ? 's-maxage=60' : 's-maxage=1800, stale-while-revalidate=3600');
  res.setHeader('X-Facilabo-Local-Events-State', response.runtime.freshness);

  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  return res.status(200).send(ics);
}

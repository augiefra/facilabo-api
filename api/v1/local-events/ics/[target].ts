import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyServiceCors, handleServiceOptions } from '../../../../lib/service-search-utils';
import { fetchAllauchAgendaIcs } from '../../../../lib/allauch-events';
import { fetchAntibesAgendaIcs } from '../../../../lib/antibes-events';
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

  if (slug === 'allauch') {
    try {
      const ics = await fetchAllauchAgendaIcs();
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="allauch.ics"');
      res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400');
      res.setHeader('X-Facilabo-Calendar-Source', "Ville d'Allauch RSS");

      if (req.method === 'HEAD') {
        return res.status(200).end();
      }

      return res.status(200).send(ics);
    } catch (error) {
      return res.status(502).json({
        error: 'Allauch RSS source unavailable',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  if (slug === 'antibes') {
    try {
      const ics = await fetchAntibesAgendaIcs();
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="antibes.ics"');
      res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');

      if (req.method === 'HEAD') {
        return res.status(200).end();
      }

      return res.status(200).send(ics);
    } catch (error) {
      return res.status(502).json({
        error: 'Antibes RSS source unavailable',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
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

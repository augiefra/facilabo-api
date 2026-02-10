import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAbuseSummary } from '../../../lib/abuse-monitor';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Monitor-Key');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const expectedKey = process.env.MONITOR_API_KEY;
  if (expectedKey) {
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const monitorKey = String(req.headers['x-monitor-key'] || '').trim();
    if (bearer !== expectedKey && monitorKey !== expectedKey) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
  }

  const summary = await getAbuseSummary();
  return res.status(200).json({
    success: true,
    data: summary,
    meta: {
      version: '1.0',
      timestamp: new Date().toISOString(),
    },
  });
}

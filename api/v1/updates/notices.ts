import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CACHE_TTL, errorResponse, handleOptions, successResponse } from '../../../lib/v1-utils';

type UpdateNoticePriority = 'low' | 'normal' | 'high';

interface FacilAboUpdateNotice {
  id: string;
  title: string;
  titleEn?: string;
  message: string;
  messageEn?: string;
  feedSlugs?: string[];
  feedIds?: string[];
  categoryTypes?: string[];
  startsAt?: string;
  endsAt?: string;
  priority: UpdateNoticePriority;
  actionTitle?: string;
  actionURL?: string;
}

const UPDATE_NOTICES: FacilAboUpdateNotice[] = [
  {
    id: 'soldes-ete-2026-prolongation',
    title: "Soldes d'été prolongés",
    titleEn: 'Summer sales extended',
    message: "Les nouvelles dates sont déjà prises en compte dans FacilAbo.",
    messageEn: 'The updated dates are already available in FacilAbo.',
    feedSlugs: ['soldes-france'],
    categoryTypes: ['soldes'],
    startsAt: '2026-07-08T00:00:00.000Z',
    endsAt: '2026-08-01T23:59:59.000Z',
    priority: 'high',
  },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return handleOptions(res);
  }

  if (req.method !== 'GET') {
    return errorResponse(
      res,
      'METHOD_NOT_ALLOWED',
      'Only GET is supported for update notices.',
      undefined,
      405
    );
  }

  return successResponse(res, UPDATE_NOTICES, {
    source: 'facilabo-editorial-updates',
    ttl: CACHE_TTL.UPDATE_NOTICES,
  });
}

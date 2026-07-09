import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CACHE_TTL, errorResponse, handleOptions, successResponse } from '../../../lib/v1-utils';
import updateNotices from '../../../data/update-notices.json';

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

const UPDATE_NOTICES = updateNotices as FacilAboUpdateNotice[];

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

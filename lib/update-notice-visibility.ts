export interface TimedUpdateNotice {
  id: string;
  startsAt: string;
  endsAt: string;
  supersedesIds?: string[];
}

interface ParsedWindow {
  startsAt: number;
  endsAt: number;
}

function parsedWindow(notice: TimedUpdateNotice): ParsedWindow | null {
  const startsAt = Date.parse(notice.startsAt);
  const endsAt = Date.parse(notice.endsAt);
  if (Number.isNaN(startsAt) || Number.isNaN(endsAt) || endsAt <= startsAt) {
    return null;
  }
  return { startsAt, endsAt };
}

export function filterVisibleUpdateNotices<T extends TimedUpdateNotice>(
  notices: T[],
  now: Date = new Date()
): T[] {
  const nowTimestamp = now.getTime();
  const supersededIds = new Set(
    notices
      .filter((notice) => {
        const window = parsedWindow(notice);
        return window !== null && window.startsAt <= nowTimestamp;
      })
      .flatMap((notice) => notice.supersedesIds ?? [])
  );

  return notices.filter((notice) => {
    const window = parsedWindow(notice);
    return window !== null &&
      window.startsAt <= nowTimestamp &&
      nowTimestamp < window.endsAt &&
      !supersededIds.has(notice.id);
  });
}

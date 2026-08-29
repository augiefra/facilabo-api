export function validateNbaCalendar(icsContent: string): string | undefined {
  if (!/BEGIN:VCALENDAR\r?\n/i.test(icsContent) || !/END:VCALENDAR/i.test(icsContent)) {
    return 'NBA source is not a complete VCALENDAR';
  }

  const eventBlocks = icsContent.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
  if (eventBlocks.length < 1200) {
    return `NBA 2026-27 source has only ${eventBlocks.length} events`;
  }

  const uids: string[] = [];
  const dates: string[] = [];
  for (const eventBlock of eventBlocks) {
    const unfolded = eventBlock.replace(/\r?\n[ \t]/g, '');
    const uid = unfolded.match(/(?:^|\r?\n)UID:(.+?)(?:\r?\n|$)/i)?.[1].trim();
    const dtstart = unfolded.match(/(?:^|\r?\n)DTSTART[^:]*:(\d{8})/i)?.[1];
    if (!uid || !dtstart) {
      return 'NBA 2026-27 source contains an event without UID or DTSTART';
    }
    uids.push(uid);
    dates.push(dtstart);
  }

  if (new Set(uids).size !== uids.length) {
    return 'NBA 2026-27 source contains duplicate UIDs';
  }

  dates.sort();
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  if (firstDate !== '20261020') {
    return `NBA 2026-27 source starts on ${firstDate}, expected 20261020`;
  }
  if (lastDate < '20270411' || lastDate > '20270412') {
    return `NBA 2026-27 source ends on ${lastDate}, expected 20270411 or 20270412 UTC`;
  }

  return undefined;
}

export const NASCAR_CUP_2027_DATES = [
  '20270213', '20270218', '20270221', '20270228',
  '20270307', '20270314', '20270321',
  '20270404', '20270411', '20270418', '20270425',
  '20270502', '20270509', '20270516', '20270523', '20270530',
  '20270606', '20270613', '20270620', '20270627',
  '20270704', '20270711', '20270718', '20270725',
  '20270801', '20270814', '20270822', '20270828',
  '20270905', '20270911', '20270919', '20270926',
  '20271003', '20271010', '20271017', '20271024', '20271031',
  '20271107', '20271114',
] as const;

function nextDateOnlyValue(rawDate: string): string {
  const year = Number(rawDate.slice(0, 4));
  const month = Number(rawDate.slice(4, 6));
  const day = Number(rawDate.slice(6, 8));
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, '0'),
    String(next.getUTCDate()).padStart(2, '0'),
  ].join('');
}

export function validateNascarCalendar(icsContent: string): string | undefined {
  if (!/BEGIN:VCALENDAR\r?\n/i.test(icsContent) || !/END:VCALENDAR/i.test(icsContent)) {
    return 'NASCAR Cup 2027 source is not a complete VCALENDAR';
  }

  const eventBlocks = icsContent.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
  if (eventBlocks.length !== NASCAR_CUP_2027_DATES.length) {
    return `NASCAR Cup 2027 source has ${eventBlocks.length} events, expected ${NASCAR_CUP_2027_DATES.length}`;
  }

  const uids: string[] = [];
  const dates: string[] = [];
  for (const eventBlock of eventBlocks) {
    const unfolded = eventBlock.replace(/\r?\n[ \t]/g, '');
    const uid = unfolded.match(/(?:^|\r?\n)UID:(.+?)(?:\r?\n|$)/i)?.[1].trim();
    const dtstart = unfolded.match(/(?:^|\r?\n)DTSTART;VALUE=DATE:(\d{8})(?:\r?\n|$)/i)?.[1];
    const dtend = unfolded.match(/(?:^|\r?\n)DTEND;VALUE=DATE:(\d{8})(?:\r?\n|$)/i)?.[1];
    const summary = unfolded.match(/(?:^|\r?\n)SUMMARY:(.+?)(?:\r?\n|$)/i)?.[1].trim();

    if (!uid || !dtstart || !dtend || !summary) {
      return 'NASCAR Cup 2027 source contains an event without UID, date-only DTSTART/DTEND or SUMMARY';
    }
    if (!/^nascar-cup-[a-z0-9-]+-2027@facilabo\.app$/.test(uid)) {
      return `NASCAR Cup 2027 source contains an invalid UID: ${uid}`;
    }
    const expectedEnd = nextDateOnlyValue(dtstart);
    if (dtend !== expectedEnd) {
      return `NASCAR Cup 2027 event ${uid} ends on ${dtend}, expected exclusive ${expectedEnd}`;
    }

    uids.push(uid);
    dates.push(dtstart);
  }

  if (new Set(uids).size !== uids.length) {
    return 'NASCAR Cup 2027 source contains duplicate UIDs';
  }

  dates.sort();
  const expectedDates = [...NASCAR_CUP_2027_DATES];
  if (dates.some((date, index) => date !== expectedDates[index])) {
    return `NASCAR Cup 2027 source dates do not match the official schedule: ${dates.join(',')}`;
  }

  return undefined;
}

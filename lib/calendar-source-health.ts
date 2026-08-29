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

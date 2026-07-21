import * as cheerio from 'cheerio';

export interface MunicipalRssCalendarConfig {
  sourceUrl: string;
  userAgent: string;
  calendarName: string;
  calendarDescription: string;
  sourceAttribution: string;
  uidPrefix: string;
  prodId: string;
  fallbackLocation?: string;
  categories: string[];
}

interface MunicipalRssEvent {
  guid: string;
  title: string;
  link?: string;
  startRaw: string;
  endRaw?: string;
  startDate: Date;
  endDate: Date;
  isAllDay: boolean;
  category?: string;
  description?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
}

export async function fetchMunicipalRssAgendaIcs(
  config: MunicipalRssCalendarConfig,
): Promise<string> {
  const response = await fetch(config.sourceUrl, {
    headers: {
      'User-Agent': config.userAgent,
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
  });

  if (!response.ok) {
    throw new Error(`${config.calendarName} RSS fetch failed: ${response.status}`);
  }

  return municipalRssToIcs(await response.text(), config);
}

export function municipalRssToIcs(
  xml: string,
  config: MunicipalRssCalendarConfig,
): string {
  const $ = cheerio.load(xml, { xmlMode: true });
  const events: MunicipalRssEvent[] = [];

  $('item').each((_, item) => {
    const node = $(item);
    const startRaw = cleanText(node.find('ev\\:startdate').first().text());
    const title = cleanText(node.find('title').first().text());
    if (!startRaw || !title) return;

    const startDate = parseDate(startRaw);
    if (!startDate) return;

    const endRaw = cleanText(node.find('ev\\:enddate').first().text());
    const isAllDay = isMidnightValue(startRaw) && Boolean(endRaw && isMidnightValue(endRaw));
    const endDate = normalizedEndDate(startDate, startRaw, endRaw);
    const guid = cleanText(node.find('guid').first().text()) ?? stableFallbackGuid(title, startRaw);
    const latitude = parseCoordinate(node.find('geo\\:lat').first().text());
    const longitude = parseCoordinate(node.find('geo\\:long').first().text());

    events.push({
      guid,
      title,
      link: cleanText(node.find('link').first().text()),
      startRaw,
      endRaw,
      startDate,
      endDate,
      isAllDay,
      category: cleanText(node.find('category').first().text()),
      description: htmlToText(node.find('description').first().text()),
      location: cleanText(node.find('ev\\:location').first().text()) ?? config.fallbackLocation,
      latitude,
      longitude,
    });
  });

  events.sort((lhs, rhs) => lhs.startDate.getTime() - rhs.startDate.getTime());

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${config.prodId}`,
    'METHOD:PUBLISH',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcsText(config.calendarName)}`,
    `NAME:${escapeIcsText(config.calendarName)}`,
    `X-WR-CALDESC:${escapeIcsText(config.calendarDescription)}`,
    'X-WR-TIMEZONE:Europe/Paris',
  ];

  for (const event of events) {
    const description = [
      event.description,
      event.category ? `Catégorie: ${event.category}` : undefined,
      `Source: ${config.sourceAttribution}`,
      event.link,
    ].filter(Boolean).join('\\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcsText(`${config.uidPrefix}-${slugify(event.guid)}@facilabo.app`)}`,
      `DTSTAMP:${formatIcsDateTime(new Date())}`,
    );

    if (event.isAllDay) {
      lines.push(
        `DTSTART;VALUE=DATE:${formatIcsDateOnly(event.startRaw)}`,
        `DTEND;VALUE=DATE:${formatIcsDateOnly(addOneDayToDateOnly(event.endRaw ?? event.startRaw))}`,
      );
    } else {
      lines.push(
        `DTSTART:${formatIcsDateTime(event.startDate)}`,
        `DTEND:${formatIcsDateTime(event.endDate)}`,
      );
    }

    lines.push(
      `SUMMARY:${escapeIcsText(event.title)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
    );

    if (event.location) {
      lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    }
    if (event.latitude !== undefined && event.longitude !== undefined) {
      lines.push(`GEO:${event.latitude};${event.longitude}`);
    }
    if (event.link) {
      lines.push(`URL:${escapeIcsText(event.link)}`);
    }

    const eventCategories = [...config.categories, event.category].filter(Boolean) as string[];
    lines.push(
      `CATEGORIES:${eventCategories.map(escapeIcsText).join(',')}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

function normalizedEndDate(startDate: Date, startRaw: string, endRaw?: string): Date {
  const fallback = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
  if (!endRaw) return fallback;

  const parsed = parseDate(endRaw);
  if (!parsed) return fallback;
  if (parsed >= startDate) return parsed;

  if (sameDateOnly(startRaw, endRaw) && isMidnightValue(endRaw)) {
    return new Date(parsed.getTime() + 24 * 60 * 60 * 1000);
  }

  return fallback;
}

function parseDate(value: string): Date | undefined {
  const date = new Date(value.trim());
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseCoordinate(value: string): number | undefined {
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isMidnightValue(value: string): boolean {
  return /T00:00(?::00)?(?:[+-]\d{2}:?\d{2}|Z)?$/i.test(value.trim());
}

function sameDateOnly(lhs: string, rhs: string): boolean {
  return lhs.slice(0, 10) === rhs.slice(0, 10);
}

function formatIcsDateOnly(value: string): string {
  return value.slice(0, 10).replace(/-/g, '');
}

function addOneDayToDateOnly(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return date.toISOString().slice(0, 10);
}

function cleanText(value: string | undefined): string | undefined {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : undefined;
}

function htmlToText(html: string): string | undefined {
  const $ = cheerio.load(html);
  const text = $.root().text().replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : undefined;
}

function formatIcsDateTime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldIcsLine(line: string): string {
  const chunks: string[] = [];
  let current = '';
  let bytes = 0;

  for (const character of line) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (bytes + characterBytes > 74 && current) {
      chunks.push(current);
      current = character;
      bytes = characterBytes;
    } else {
      current += character;
      bytes += characterBytes;
    }
  }

  if (current) chunks.push(current);
  return chunks.join('\r\n ');
}

function stableFallbackGuid(title: string, startRaw: string): string {
  return slugify(`${title}-${startRaw}`);
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

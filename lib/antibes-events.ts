import * as cheerio from 'cheerio';

const ANTIBES_RSS_URL = 'https://www.antibes-juanlespins.com/information/agenda/rss';

interface AntibesRssEvent {
  guid: string;
  title: string;
  link?: string;
  startDate: Date;
  endDate: Date;
  category?: string;
  description?: string;
  location?: string;
}

export async function fetchAntibesAgendaIcs(): Promise<string> {
  const response = await fetch(ANTIBES_RSS_URL, {
    headers: {
      'User-Agent': 'FacilAbo/1.0 local-events-antibes',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
  });

  if (!response.ok) {
    throw new Error(`Antibes RSS fetch failed: ${response.status}`);
  }

  const xml = await response.text();
  return antibesRssToIcs(xml);
}

export function antibesRssToIcs(xml: string): string {
  const $ = cheerio.load(xml, { xmlMode: true });
  const events: AntibesRssEvent[] = [];

  $('item').each((_, item) => {
    const node = $(item);
    const startDate = parseDate(node.find('ev\\:startdate').first().text());
    if (!startDate) return;

    const endDate = parseDate(node.find('ev\\:enddate').first().text()) ?? new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
    const title = cleanText(node.find('title').first().text());
    if (!title) return;

    const guid = cleanText(node.find('guid').first().text()) || slugify(`${title}-${startDate.toISOString()}`);
    const descriptionHtml = node.find('description').first().text();

    events.push({
      guid,
      title,
      link: cleanText(node.find('link').first().text()),
      startDate,
      endDate,
      category: cleanText(node.find('category').first().text()),
      description: htmlToText(descriptionHtml),
      location: extractLocation(descriptionHtml),
    });
  });

  events.sort((lhs, rhs) => lhs.startDate.getTime() - rhs.startDate.getTime());

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FacilAbo//Sorties Antibes RSS//FR',
    'METHOD:PUBLISH',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Agenda Antibes',
    'NAME:Agenda Antibes',
    'X-WR-CALDESC:Agenda officiel Antibes Juan-les-Pins',
    'X-WR-TIMEZONE:Europe/Paris',
  ];

  for (const event of events) {
    const description = [
      event.description,
      event.category ? `Catégorie: ${event.category}` : undefined,
      'Source: Office de tourisme Antibes Juan-les-Pins',
      event.link,
    ].filter(Boolean).join('\\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcsText(`sorties-ville-antibes-${slugify(event.guid)}@facilabo.app`)}`,
      `DTSTAMP:${formatIcsDateTime(new Date())}`,
      `DTSTART:${formatIcsDateTime(event.startDate)}`,
      `DTEND:${formatIcsDateTime(event.endDate)}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
    );

    if (event.location) {
      lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    }
    if (event.link) {
      lines.push(`URL:${escapeIcsText(event.link)}`);
    }

    lines.push(
      'CATEGORIES:Sorties,Agenda ville,Antibes',
      'STATUS:CONFIRMED',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

function parseDate(value: string): Date | undefined {
  const date = new Date(value.trim());
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function cleanText(value: string | undefined): string | undefined {
  const text = (value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 0 ? text : undefined;
}

function htmlToText(html: string): string | undefined {
  const $ = cheerio.load(html);
  const text = $.root().text().replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : undefined;
}

function extractLocation(html: string): string | undefined {
  const normalized = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n');
  const text = cheerio.load(normalized).root().text();
  const match = text.match(/Lieu\s*:\s*([^\n]+(?:\n[^\n]+){0,2})/i);
  return cleanText(match?.[1]?.replace(/\n/g, ', '));
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

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

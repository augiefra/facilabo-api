import * as cheerio from 'cheerio';
import { Match, ChannelKey, CHANNEL_MAPPING, TVScheduleResponse } from './types';

const BASE_URL = 'https://www.footmercato.net/programme-tv/france/ligue-1';

/**
 * Parse French date string to ISO format
 */
function parseFrenchDate(text: string): string | null {
  const monthMap: Record<string, string> = {
    'janvier': '01', 'février': '02', 'mars': '03', 'avril': '04',
    'mai': '05', 'juin': '06', 'juillet': '07', 'août': '08',
    'septembre': '09', 'octobre': '10', 'novembre': '11', 'décembre': '12'
  };

  const dateMatch = text.match(/(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)/i);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, '0');
    const monthName = dateMatch[2].toLowerCase();
    const month = monthMap[monthName];
    if (month) {
      // Handle year rollover (if month is Jan-Feb and we're in Dec, use next year)
      const now = new Date();
      let year = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const parsedMonth = parseInt(month);

      if (currentMonth >= 11 && parsedMonth <= 2) {
        year += 1;
      }

      return `${year}-${month}-${day}`;
    }
  }
  return null;
}

/**
 * Scrape the TV schedule from footmercato.net
 */
export async function scrapeTVSchedule(): Promise<TVScheduleResponse> {
  const response = await fetch(BASE_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const matches: Match[] = [];
  const seenIds = new Set<string>();

  // Strategy: Walk through DOM sequentially, tracking current date
  // Date headers typically contain day names and month names
  let currentDate = new Date().toISOString().split('T')[0];

  // Get all elements in document order
  $('*').each((_, element) => {
    const el = $(element);
    const tagName = element.tagName?.toLowerCase();

    // Skip script, style, etc.
    if (['script', 'style', 'meta', 'link'].includes(tagName)) return;

    // Check if this element contains a date header
    // Look for elements that contain date text but are relatively short (headers, not full page text)
    const directText = el.clone().children().remove().end().text().trim();
    if (directText.length > 0 && directText.length < 100) {
      const possibleDate = parseFrenchDate(directText);
      if (possibleDate) {
        currentDate = possibleDate;
      }
    }

    // Check if this is a match link
    if (tagName === 'a') {
      const href = el.attr('href') || '';
      const matchIdMatch = href.match(/\/live\/(\d+)/);
      if (!matchIdMatch) return;

      const matchId = matchIdMatch[1];

      // Skip duplicates
      if (seenIds.has(matchId)) return;
      seenIds.add(matchId);

      const fullText = el.text().trim();

      // Extract time (format: HH:mm or H:mm)
      const timeMatch = fullText.match(/(\d{1,2}:\d{2})/);
      const time = timeMatch ? timeMatch[1] : '';
      if (!time) return;

      // Extract channel from img alt text
      let channel = 'unknown';
      let channelKey: ChannelKey = 'unknown';

      el.find('img').each((_, img) => {
        const alt = $(img).attr('alt')?.toLowerCase() || '';
        for (const [key, value] of Object.entries(CHANNEL_MAPPING)) {
          if (alt.includes(key)) {
            channel = value.name;
            channelKey = value.key;
            return false; // break
          }
        }
      });

      // Also check for text-based channel mentions
      if (channelKey === 'unknown') {
        const textLower = fullText.toLowerCase();
        for (const [key, value] of Object.entries(CHANNEL_MAPPING)) {
          if (textLower.includes(key)) {
            channel = value.name;
            channelKey = value.key;
            break;
          }
        }
      }

      // Extract team names
      const textWithoutTime = fullText.replace(/\d{1,2}:\d{2}/, '').trim();
      const teamParts = textWithoutTime.split(/\s+-\s+|\s{2,}/);

      let homeTeam = '';
      let awayTeam = '';

      if (teamParts.length >= 2) {
        homeTeam = teamParts[0].replace(/Logo\s*/gi, '').trim();
        awayTeam = teamParts[1].replace(/Logo\s*/gi, '').trim();
      }

      // Only add if we have valid data
      if (homeTeam && awayTeam) {
        matches.push({
          id: matchId,
          homeTeam,
          awayTeam,
          date: currentDate,
          time,
          channel,
          channelKey,
          competition: 'Ligue 1',
        });
      }
    }
  });

  // Sort by date and time
  matches.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.time.localeCompare(b.time);
  });

  // Limit to upcoming matches (next 2 weeks)
  const twoWeeksFromNow = new Date();
  twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
  const cutoffDate = twoWeeksFromNow.toISOString().split('T')[0];

  const upcomingMatches = matches.filter(m => m.date <= cutoffDate);

  return {
    competition: 'Ligue 1',
    matches: upcomingMatches.length > 0 ? upcomingMatches : matches.slice(0, 20),
    lastUpdated: new Date().toISOString(),
    source: 'footmercato.net',
  };
}

/**
 * Filter matches by team name
 */
export function filterByTeam(schedule: TVScheduleResponse, teamQuery: string): TVScheduleResponse {
  const query = teamQuery.toLowerCase();

  // Team name mappings for common abbreviations
  const teamAliases: Record<string, string[]> = {
    'psg': ['paris saint-germain', 'paris', 'psg'],
    'om': ['olympique de marseille', 'marseille', 'om'],
    'ol': ['olympique lyonnais', 'lyon', 'ol'],
    'asse': ['as saint-etienne', 'saint-etienne', 'asse'],
    'losc': ['lille', 'losc'],
    'ogcn': ['nice', 'ogc nice', 'ogcn'],
    'rcl': ['lens', 'rc lens', 'rcl'],
    'asm': ['monaco', 'as monaco', 'asm'],
    'fcn': ['nantes', 'fc nantes', 'fcn'],
    'srfc': ['rennes', 'stade rennais', 'srfc'],
    'mhsc': ['montpellier', 'mhsc'],
    'sco': ['angers', 'sco'],
    'sb29': ['brest', 'stade brest', 'sb29'],
    'tfc': ['toulouse', 'tfc'],
    'estac': ['troyes', 'estac'],
    'fcl': ['lorient', 'fc lorient', 'fcl'],
    'rcs': ['strasbourg', 'rc strasbourg', 'rcs'],
    'fcm': ['metz', 'fc metz', 'fcm'],
    'cf63': ['clermont', 'clermont foot', 'cf63'],
    'hac': ['le havre', 'hac'],
    'aja': ['auxerre', 'aj auxerre', 'aja'],
  };

  // Find all aliases for the query
  let searchTerms = [query];
  for (const [key, aliases] of Object.entries(teamAliases)) {
    if (key === query || aliases.some(a => a.includes(query) || query.includes(a))) {
      searchTerms = [...searchTerms, key, ...aliases];
      break;
    }
  }

  const filteredMatches = schedule.matches.filter(match => {
    const home = match.homeTeam.toLowerCase();
    const away = match.awayTeam.toLowerCase();

    return searchTerms.some(term =>
      home.includes(term) || away.includes(term) ||
      term.includes(home) || term.includes(away)
    );
  });

  return {
    ...schedule,
    matches: filteredMatches,
  };
}

/**
 * FacilAbo - TV Schedule Scraper
 *
 * Scrapes Ligue 1 TV schedule from footmercato.net
 *
 * @source footmercato.net
 * @fragility HIGH - Web scraping, HTML structure can change
 * @updated 2025-01
 */

import * as cheerio from 'cheerio';
import { Match, ChannelKey, CHANNEL_MAPPING, TVScheduleResponse } from './types';
import { fetchWithRetry, createRetryLogger, RETRY_CONFIGS } from './retry-utils';

const BASE_URL = 'https://www.footmercato.net/programme-tv/france/ligue-1';

const CHANNEL_PRIORITY: ChannelKey[] = [
  'ligue1plus',
  'canalplus',
  'beinsports',
  'amazonprime',
  'francetv',
  'dazn',
];

type ChannelCandidate = { name: string; key: ChannelKey };

function addMappedChannelsFromText(text: string, candidates: ChannelCandidate[]): void {
  if (!text) return;
  const textLower = text.toLowerCase();

  for (const [key, value] of Object.entries(CHANNEL_MAPPING)) {
    if (textLower.includes(key)) {
      const exists = candidates.some(c => c.key === value.key);
      if (!exists) {
        candidates.push({ name: value.name, key: value.key });
      }
    }
  }
}

function selectBestChannel(el: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): ChannelCandidate {
  const candidates: ChannelCandidate[] = [];

  // 1) Prefer explicit affiliation wording like "Ligue 1+ via DAZN"
  const affiliationLabel =
    el.nextAll('a.affiliationBroadcast').first().attr('data-track-label') ||
    el.nextAll('a.affiliationBroadcast').first().text() ||
    '';
  if (affiliationLabel) {
    const lower = affiliationLabel.toLowerCase();
    const viaIndex = lower.indexOf(' via ');
    if (viaIndex > 0) {
      addMappedChannelsFromText(lower.slice(0, viaIndex), candidates);
    }
    addMappedChannelsFromText(lower, candidates);
  }

  // 2) Then use explicit broadcast logos area (avoid team logos noise)
  el.find('.matchFull__broadcasts img').each((_, img) => {
    const alt = $(img).attr('alt') || '';
    addMappedChannelsFromText(alt, candidates);
  });

  // 3) Fallback: generic text in match block
  addMappedChannelsFromText(el.text(), candidates);

  for (const priority of CHANNEL_PRIORITY) {
    const matched = candidates.find(c => c.key === priority);
    if (matched) return matched;
  }

  return { name: 'unknown', key: 'unknown' };
}

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
 *
 * Uses retry with exponential backoff for reliability.
 * Updated Dec 2025: Uses <time datetime=""> and matchTeam__name selectors
 */
export async function scrapeTVSchedule(): Promise<TVScheduleResponse> {
  const retryLogger = createRetryLogger('scraper:tv-schedule');

  const response = await fetchWithRetry(
    BASE_URL,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    },
    {
      ...RETRY_CONFIGS.scraper,
      onRetry: retryLogger,
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const matches: Match[] = [];
  const seenIds = new Set<string>();

  // Strategy: Find all match containers (div.matchFull) and extract data
  $('div.matchFull').each((_, matchDiv) => {
    const el = $(matchDiv);

    // Get match ID from data attribute or link
    const matchId = el.attr('data-live-id') || '';
    if (!matchId || seenIds.has(matchId)) return;
    seenIds.add(matchId);

    // Extract date and time from <time datetime=""> element
    const timeEl = el.find('time[datetime]');
    const datetime = timeEl.attr('datetime') || '';

    let date = new Date().toISOString().split('T')[0];
    let time = '';

    if (datetime) {
      // datetime is in format: 2026-01-04T14:00:00+00:00 (UTC)
      const parsedDate = new Date(datetime);
      // Convert to Paris timezone (UTC+1)
      const parisTime = new Date(parsedDate.getTime() + (1 * 60 * 60 * 1000));
      date = parisTime.toISOString().split('T')[0];
      time = parisTime.toISOString().split('T')[1].substring(0, 5);
    } else {
      // Fallback: try to extract time from text
      const timeText = timeEl.text().trim() || el.text().match(/(\d{1,2}:\d{2})/)?.[1] || '';
      time = timeText;
    }

    if (!time) return;

    // Extract team names from matchTeam__name spans
    const teamNames = el.find('.matchTeam__name').map((_, span) => $(span).text().trim()).get();
    const homeTeam = teamNames[0] || '';
    const awayTeam = teamNames[1] || '';

    if (!homeTeam || !awayTeam) return;

    const selectedChannel = selectBestChannel(el, $);
    const channel = selectedChannel.name;
    const channelKey = selectedChannel.key;

    matches.push({
      id: matchId,
      homeTeam,
      awayTeam,
      date,
      time,
      channel,
      channelKey,
      competition: 'Ligue 1',
    });
  });

  // Sort by date and time
  matches.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.time.localeCompare(b.time);
  });

  // Limit to upcoming matches (next 4 weeks for better coverage)
  const fourWeeksFromNow = new Date();
  fourWeeksFromNow.setDate(fourWeeksFromNow.getDate() + 28);
  const cutoffDate = fourWeeksFromNow.toISOString().split('T')[0];

  const upcomingMatches = matches.filter(m => m.date <= cutoffDate);

  return {
    competition: 'Ligue 1',
    matches: upcomingMatches.length > 0 ? upcomingMatches : matches.slice(0, 30),
    lastUpdated: new Date().toISOString(),
    source: 'footmercato.net',
  };
}

/**
 * Filter matches by team name
 */
export function filterByTeam(schedule: TVScheduleResponse, teamQuery: string): TVScheduleResponse {
  const normalize = (value: string): string =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  const query = normalize(teamQuery);
  const containsTerm = (text: string, term: string): boolean => {
    if (!term) return false;
    return (
      text === term ||
      text.startsWith(`${term} `) ||
      text.endsWith(` ${term}`) ||
      text.includes(` ${term} `)
    );
  };

  // Team name mappings for common abbreviations
  const teamAliases: Record<string, string[]> = {
    'psg': ['paris saint germain', 'paris sg', 'psg'],
    'parisfc': ['paris fc', 'paris football club', 'pfc'],
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

  // Find all aliases for the query (exact match first to avoid ambiguous mappings)
  const searchTerms = new Set<string>([query]);
  let matchedKey: string | null = null;

  for (const [key, aliases] of Object.entries(teamAliases)) {
    const normalizedAliases = aliases.map(normalize);
    if (normalize(key) === query || normalizedAliases.includes(query)) {
      matchedKey = key;
      break;
    }
  }

  if (!matchedKey) {
    for (const [key, aliases] of Object.entries(teamAliases)) {
      const normalizedAliases = aliases.map(normalize);
      if (normalizedAliases.some(a => a.startsWith(query) || query.startsWith(a))) {
        matchedKey = key;
        break;
      }
    }
  }

  if (matchedKey) {
    searchTerms.add(normalize(matchedKey));
    for (const alias of teamAliases[matchedKey]) {
      searchTerms.add(normalize(alias));
    }
  }

  const normalizedTerms = Array.from(searchTerms).filter(Boolean);

  const filteredMatches = schedule.matches.filter(match => {
    const home = normalize(match.homeTeam);
    const away = normalize(match.awayTeam);

    return normalizedTerms.some(term =>
      containsTerm(home, term) || containsTerm(away, term)
    );
  });

  return {
    ...schedule,
    matches: filteredMatches,
  };
}

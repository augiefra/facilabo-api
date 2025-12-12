import * as cheerio from 'cheerio';
import { Match, ChannelKey, CHANNEL_MAPPING, TVScheduleResponse } from './types';

const BASE_URL = 'https://www.footmercato.net/programme-tv/france/ligue-1';

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

  // Find all match entries
  // The structure is: links with /live/ containing team names, time, and channel logo
  let currentDate = '';

  $('body').find('*').each((_, element) => {
    const el = $(element);
    const text = el.text().trim();

    // Check for date headers (e.g., "Aujourd'hui - vendredi 12 décembre")
    if (text.includes('décembre') || text.includes('janvier') || text.includes('février')) {
      const dateMatch = text.match(/(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)/i);
      if (dateMatch) {
        const day = dateMatch[1].padStart(2, '0');
        const monthName = dateMatch[2].toLowerCase();
        const monthMap: Record<string, string> = {
          'janvier': '01', 'février': '02', 'mars': '03', 'avril': '04',
          'mai': '05', 'juin': '06', 'juillet': '07', 'août': '08',
          'septembre': '09', 'octobre': '10', 'novembre': '11', 'décembre': '12'
        };
        const month = monthMap[monthName] || '01';
        const year = new Date().getFullYear();
        currentDate = `${year}-${month}-${day}`;
      }
    }
  });

  // Parse match links
  $('a[href*="/live/"]').each((_, element) => {
    const el = $(element);
    const href = el.attr('href') || '';
    const matchId = href.match(/\/live\/(\d+)/)?.[1] || '';

    if (!matchId) return;

    const fullText = el.text().trim();

    // Extract time (format: HH:mm or H:mm)
    const timeMatch = fullText.match(/(\d{1,2}:\d{2})/);
    const time = timeMatch ? timeMatch[1] : '';

    // Extract channel from img alt text
    let channel = 'unknown';
    let channelKey: ChannelKey = 'unknown';

    el.find('img').each((_, img) => {
      const alt = $(img).attr('alt')?.toLowerCase() || '';

      for (const [key, value] of Object.entries(CHANNEL_MAPPING)) {
        if (alt.includes(key)) {
          channel = value.name;
          channelKey = value.key;
          break;
        }
      }
    });

    // Also check for text-based channel mentions
    const textLower = fullText.toLowerCase();
    if (channelKey === 'unknown') {
      for (const [key, value] of Object.entries(CHANNEL_MAPPING)) {
        if (textLower.includes(key)) {
          channel = value.name;
          channelKey = value.key;
          break;
        }
      }
    }

    // Extract team names - they're usually separated by a hyphen or specific pattern
    // Look for patterns like "Team A Team B" or "Team A - Team B"
    const textWithoutTime = fullText.replace(/\d{1,2}:\d{2}/, '').trim();
    const teamParts = textWithoutTime.split(/\s+-\s+|\s{2,}/);

    let homeTeam = '';
    let awayTeam = '';

    if (teamParts.length >= 2) {
      homeTeam = teamParts[0].replace(/Logo\s*/gi, '').trim();
      awayTeam = teamParts[1].replace(/Logo\s*/gi, '').trim();
    }

    // Only add if we have valid data
    if (matchId && (homeTeam || awayTeam) && time) {
      matches.push({
        id: matchId,
        homeTeam: homeTeam || 'TBD',
        awayTeam: awayTeam || 'TBD',
        date: currentDate || new Date().toISOString().split('T')[0],
        time,
        channel,
        channelKey,
        competition: 'Ligue 1',
      });
    }
  });

  return {
    competition: 'Ligue 1',
    matches,
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

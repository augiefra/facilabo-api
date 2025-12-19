/**
 * Calendar source mappings for the ICS proxy
 * Maps slug to source URL and French display name
 *
 * IMPORTANT: Slugs must match the iOS enum rawValues exactly
 * See: FacilAbo/Models/Enums.swift
 */

export interface CalendarMapping {
  sourceUrl: string;
  frenchName: string;
  description?: string;
}

/**
 * F1 Calendar - Better F1 Calendar source
 */
export const F1_CALENDARS: Record<string, CalendarMapping> = {
  'f1': {
    sourceUrl: 'https://better-f1-calendar.vercel.app/api/calendar.ics',
    frenchName: 'Formule 1 - Calendrier complet',
    description: 'GP, Qualifications, Essais, Sprints'
  }
};

/**
 * MotoGP Calendar - Fixtur.es source
 */
export const MOTOGP_CALENDARS: Record<string, CalendarMapping> = {
  'motogp': {
    sourceUrl: 'https://ics.fixtur.es/v2/league/motogp.ics',
    frenchName: 'MotoGP - Grands Prix',
    description: 'Tous les Grands Prix MotoGP'
  }
};

/**
 * NASCAR Calendar - Google Calendar source (official)
 */
export const NASCAR_CALENDARS: Record<string, CalendarMapping> = {
  'nascar': {
    sourceUrl: 'https://calendar.google.com/calendar/ical/db8c47ne2bt9qbld2mhdabm0u8%40group.calendar.google.com/public/basic.ics',
    frenchName: 'NASCAR Cup Series',
    description: 'Toutes les courses NASCAR'
  }
};

/**
 * NBA Calendar - FixtureDownload.com source
 */
export const NBA_CALENDARS: Record<string, CalendarMapping> = {
  'basketball': {
    sourceUrl: 'https://fixturedownload.com/download/nba-2024-GMTStandardTime.ics',
    frenchName: 'NBA - Calendrier complet',
    description: 'Tous les matchs NBA 2024-25'
  }
};

/**
 * Football (Ligue 1) teams - Fixtur.es source
 * Slugs match FootballTeam.rawValue from iOS Enums.swift
 */
export const FOOTBALL_TEAMS: Record<string, CalendarMapping> = {
  'psg': {
    sourceUrl: 'https://ics.fixtur.es/v2/paris-saint-germain.ics',
    frenchName: 'Paris Saint-Germain'
  },
  'om': {
    sourceUrl: 'https://ics.fixtur.es/v2/olympique-marseille.ics',
    frenchName: 'Olympique de Marseille'
  },
  'ol': {
    sourceUrl: 'https://ics.fixtur.es/v2/olympique-lyon.ics',
    frenchName: 'Olympique Lyonnais'
  },
  'asMonaco': {
    sourceUrl: 'https://ics.fixtur.es/v2/as-monaco.ics',
    frenchName: 'AS Monaco'
  },
  'losc': {
    sourceUrl: 'https://ics.fixtur.es/v2/lille.ics',
    frenchName: 'LOSC Lille'
  },
  'rcLens': {
    sourceUrl: 'https://ics.fixtur.es/v2/lens.ics',
    frenchName: 'RC Lens'
  },
  'stadeRennais': {
    sourceUrl: 'https://ics.fixtur.es/v2/stade-rennes.ics',
    frenchName: 'Stade Rennais'
  },
  'nice': {
    sourceUrl: 'https://ics.fixtur.es/v2/ogc-nice.ics',
    frenchName: 'OGC Nice'
  },
  'rcStrasbourg': {
    sourceUrl: 'https://ics.fixtur.es/v2/rc-strasbourg.ics',
    frenchName: 'RC Strasbourg'
  },
  'fcNantes': {
    sourceUrl: 'https://ics.fixtur.es/v2/fc-nantes.ics',
    frenchName: 'FC Nantes'
  },
  'stadeReims': {
    sourceUrl: 'https://ics.fixtur.es/v2/stade-de-reims.ics',
    frenchName: 'Stade de Reims'
  },
  'montpellierHsc': {
    sourceUrl: 'https://ics.fixtur.es/v2/montpellier.ics',
    frenchName: 'Montpellier HSC'
  },
  'toulouseFc': {
    sourceUrl: 'https://ics.fixtur.es/v2/toulouse.ics',
    frenchName: 'Toulouse FC'
  },
  'stadeBrest': {
    sourceUrl: 'https://ics.fixtur.es/v2/stade-brestois-29.ics',
    frenchName: 'Stade Brestois'
  },
  'auxerre': {
    sourceUrl: 'https://ics.fixtur.es/v2/auxerre.ics',
    frenchName: 'AJ Auxerre'
  },
  'angers': {
    sourceUrl: 'https://ics.fixtur.es/v2/angers-sco.ics',
    frenchName: 'Angers SCO'
  },
  'saintEtienne': {
    sourceUrl: 'https://ics.fixtur.es/v2/saint-etienne.ics',
    frenchName: 'AS Saint-Étienne'
  },
  'lehavre': {
    sourceUrl: 'https://ics.fixtur.es/v2/le-havre.ics',
    frenchName: 'Le Havre AC'
  }
};

/**
 * Rugby (Top 14) teams - Fixtur.es source
 * Slugs match RugbyTeam.rawValue from iOS Enums.swift
 */
export const RUGBY_TEAMS: Record<string, CalendarMapping> = {
  'toulouse': {
    sourceUrl: 'https://ics.fixtur.es/v2/toulouse.ics',
    frenchName: 'Stade Toulousain'
  },
  'stadefrancais': {
    sourceUrl: 'https://ics.fixtur.es/v2/stade-francais.ics',
    frenchName: 'Stade Français Paris'
  },
  'racing92': {
    sourceUrl: 'https://ics.fixtur.es/v2/racing-92.ics',
    frenchName: 'Racing 92'
  },
  'laRochelle': {
    sourceUrl: 'https://ics.fixtur.es/v2/la-rochelle.ics',
    frenchName: 'Stade Rochelais'
  },
  'bordeaux': {
    sourceUrl: 'https://ics.fixtur.es/v2/bordeaux-begles.ics',
    frenchName: 'Union Bordeaux-Bègles'
  },
  'clermont': {
    sourceUrl: 'https://ics.fixtur.es/v2/clermont.ics',
    frenchName: 'ASM Clermont'
  },
  'toulon': {
    sourceUrl: 'https://ics.fixtur.es/v2/toulon.ics',
    frenchName: 'RC Toulon'
  },
  'lyon': {
    sourceUrl: 'https://ics.fixtur.es/v2/lyon.ics',
    frenchName: 'LOU Rugby'
  },
  'montpellier': {
    sourceUrl: 'https://ics.fixtur.es/v2/montpellier.ics',
    frenchName: 'Montpellier Hérault Rugby'
  },
  'castres': {
    sourceUrl: 'https://ics.fixtur.es/v2/castres.ics',
    frenchName: 'Castres Olympique'
  },
  'pau': {
    sourceUrl: 'https://ics.fixtur.es/v2/pau.ics',
    frenchName: 'Section Paloise'
  },
  'perpignan': {
    sourceUrl: 'https://ics.fixtur.es/v2/perpignan.ics',
    frenchName: 'USAP Perpignan'
  },
  'bayonne': {
    sourceUrl: 'https://ics.fixtur.es/v2/bayonne.ics',
    frenchName: 'Aviron Bayonnais'
  },
  'vannes': {
    sourceUrl: 'https://ics.fixtur.es/v2/vannes.ics',
    frenchName: 'RC Vannes'
  }
};

/**
 * Get all calendar mappings
 */
export function getAllMappings(): Record<string, CalendarMapping> {
  return {
    ...F1_CALENDARS,
    ...MOTOGP_CALENDARS,
    ...NASCAR_CALENDARS,
    ...NBA_CALENDARS,
    ...FOOTBALL_TEAMS,
    ...RUGBY_TEAMS
  };
}

/**
 * Get a specific calendar mapping by slug
 */
export function getMapping(slug: string): CalendarMapping | undefined {
  return getAllMappings()[slug];
}

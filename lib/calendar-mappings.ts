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
 * Self-hosted FacilAbo calendars (GitHub raw)
 * These sources are maintained by us and can be safely proxied with proper headers.
 */
export const FACILABO_CALENDARS: Record<string, CalendarMapping> = {
  'astronomie': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/astronomie/calendrier-astronomie.ics',
    frenchName: 'Astronomie',
    description: 'Phases lunaires, éclipses, météores et événements astronomiques'
  },
  'jardin-lunaire': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/jardin/lunaire.ics',
    frenchName: 'Calendrier Lunaire Jardin',
    description: 'Jours feuilles, fleurs, fruits, racines selon la lune'
  },
  'soldes-france': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/soldes/france.ics',
    frenchName: 'Soldes France',
    description: "Dates des soldes d'hiver et d'été en France"
  },
  'fiscal-france': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/fiscal/france.ics',
    frenchName: 'Calendrier Fiscal France',
    description: 'Déclarations de revenus, taxe foncière, IFI'
  },
  'culture-france': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/culture/france.ics',
    frenchName: 'Événements Culturels France',
    description: 'Nuit des Musées, Fête de la Musique, Journées du Patrimoine'
  },
  'culture-ceremonies': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/culture/ceremonies.ics',
    frenchName: 'Culture Cérémonies',
    description: 'Oscars, Césars, Grammys, Emmy Awards'
  },
  'religion-chretienne': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/religion/chretienne.ics',
    frenchName: 'Fêtes Chrétiennes',
    description: 'Paques et Noel'
  },
  'religion-musulmane': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/religion/musulmane.ics',
    frenchName: 'Fêtes Musulmanes',
    description: 'Aid al-Fitr et Aid al-Adha (dates lunaires susceptibles de varier)'
  },
  'religion-juive': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/religion/juive.ics',
    frenchName: 'Fêtes Juives',
    description: 'Rosh Hashanah et Yom Kippour'
  },
  'religion-hindoue': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/religion/hindoue.ics',
    frenchName: 'Fêtes Hindoues',
    description: 'Diwali'
  },
  'religion-bouddhiste': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/religion/bouddhiste.ics',
    frenchName: 'Fêtes Bouddhistes',
    description: 'Vesak'
  },
  'religion-sikhe': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/religion/sikhe.ics',
    frenchName: 'Fêtes Sikhes',
    description: 'Vaisakhi'
  },
  // Compatibilité legacy (ne pas supprimer avant migration complète des clients)
  'religion-multi-cultes': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/religion/multi-cultes.ics',
    frenchName: 'Fêtes religieuses (multi-cultes)',
    description: 'Fêtes majeures chrétiennes, musulmanes, juives, hindoues, bouddhistes et sikhes'
  },
  'ecommerce-blackfriday': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/ecommerce/blackfriday.ics',
    frenchName: 'Black Friday & Cyber Monday',
    description: 'Promotions Black Friday et Cyber Monday'
  },
  'ecommerce-primeday': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/ecommerce/primeday.ics',
    frenchName: 'Prime Day & Singles Day',
    description: 'Amazon Prime Day et Singles Day'
  },
  'ecommerce-frenchdays': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/ecommerce/frenchdays.ics',
    frenchName: 'French Days',
    description: 'Promotions French Days printemps et automne'
  },
  'ecommerce-fetes-commerciales': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/ecommerce/fetes-commerciales.ics',
    frenchName: 'Fêtes commerciales',
    description: 'Saint-Valentin, Fête des Mères, Fête des Pères, Halloween'
  },
  'tennis-atp-complet': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/tennis/atp-complet.ics',
    frenchName: 'Tennis ATP - Calendrier complet',
    description: 'ATP Tour 2026'
  },
  'tennis-wta-complet': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/tennis/wta-complet.ics',
    frenchName: 'Tennis WTA - Calendrier complet',
    description: 'WTA Tour 2026'
  },
  'tennis-atp-majeurs': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/tennis/atp-majeurs.ics',
    frenchName: 'Tennis ATP - Majeurs',
    description: 'Grand Chelem + tournois majeurs 2026'
  },
  'tennis-wta-majeurs': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/tennis/wta-majeurs.ics',
    frenchName: 'Tennis WTA - Majeurs',
    description: 'Grand Chelem + tournois majeurs 2026'
  }
};

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
 * Rugby (Top 14) teams - FacilAbo legacy proxy source
 * Slugs match RugbyTeam.rawValue from iOS Enums.swift
 */
export const RUGBY_TEAMS: Record<string, CalendarMapping> = {
  'toulouse': {
    sourceUrl: 'https://facilabo-api.vercel.app/api/calendar/rugby/toulouse',
    frenchName: 'Stade Toulousain'
  },
  'stadefrancais': {
    sourceUrl: 'https://facilabo-api.vercel.app/api/calendar/rugby/stadefrancais',
    frenchName: 'Stade Français Paris'
  },
  'racing92': {
    sourceUrl: 'https://facilabo-api.vercel.app/api/calendar/rugby/racing92',
    frenchName: 'Racing 92'
  },
  'laRochelle': {
    sourceUrl: 'https://facilabo-api.vercel.app/api/calendar/rugby/laRochelle',
    frenchName: 'Stade Rochelais'
  },
  'bordeaux': {
    sourceUrl: 'https://facilabo-api.vercel.app/api/calendar/rugby/bordeaux',
    frenchName: 'Union Bordeaux-Bègles'
  },
  'clermont': {
    sourceUrl: 'https://facilabo-api.vercel.app/api/calendar/rugby/clermont',
    frenchName: 'ASM Clermont'
  },
  'toulon': {
    sourceUrl: 'https://facilabo-api.vercel.app/api/calendar/rugby/toulon',
    frenchName: 'RC Toulon'
  },
  'lyon': {
    sourceUrl: 'https://facilabo-api.vercel.app/api/calendar/rugby/lyon',
    frenchName: 'LOU Rugby'
  },
  'montpellier': {
    sourceUrl: 'https://facilabo-api.vercel.app/api/calendar/rugby/montpellier',
    frenchName: 'Montpellier Hérault Rugby'
  },
  'castres': {
    sourceUrl: 'https://facilabo-api.vercel.app/api/calendar/rugby/castres',
    frenchName: 'Castres Olympique'
  },
  'pau': {
    sourceUrl: 'https://facilabo-api.vercel.app/api/calendar/rugby/pau',
    frenchName: 'Section Paloise'
  },
  'perpignan': {
    sourceUrl: 'https://facilabo-api.vercel.app/api/calendar/rugby/perpignan',
    frenchName: 'USAP Perpignan'
  },
  'bayonne': {
    sourceUrl: 'https://facilabo-api.vercel.app/api/calendar/rugby/bayonne',
    frenchName: 'Aviron Bayonnais'
  },
  'vannes': {
    sourceUrl: 'https://facilabo-api.vercel.app/api/calendar/rugby/vannes',
    frenchName: 'RC Vannes'
  }
};

/**
 * Get all calendar mappings
 */
export function getAllMappings(): Record<string, CalendarMapping> {
  return {
    ...FACILABO_CALENDARS,
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

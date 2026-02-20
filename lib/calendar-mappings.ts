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
  'changement-heure-france': {
    sourceUrl: 'https://www.data.gouv.fr/api/1/datasets/r/44a31e90-3391-41aa-9c6a-18fae257b9e4',
    frenchName: "Changement d'heure France",
    description: "Passage officiel heure d'été / heure d'hiver (Europe/Paris)"
  },
  'vacances-zone-a': {
    sourceUrl: 'https://fr.ftp.opendatasoft.com/openscol/fr-en-calendrier-scolaire/Zone-A.ics',
    frenchName: 'Vacances scolaires Zone A',
    description: "Calendrier scolaire officiel - Zone A (ministère de l'Éducation nationale)"
  },
  'vacances-zone-b': {
    sourceUrl: 'https://fr.ftp.opendatasoft.com/openscol/fr-en-calendrier-scolaire/Zone-B.ics',
    frenchName: 'Vacances scolaires Zone B',
    description: "Calendrier scolaire officiel - Zone B (ministère de l'Éducation nationale)"
  },
  'vacances-zone-c': {
    sourceUrl: 'https://fr.ftp.opendatasoft.com/openscol/fr-en-calendrier-scolaire/Zone-C.ics',
    frenchName: 'Vacances scolaires Zone C',
    description: "Calendrier scolaire officiel - Zone C (ministère de l'Éducation nationale)"
  },
  'vacances-corse': {
    sourceUrl: 'https://fr.ftp.opendatasoft.com/openscol/fr-en-calendrier-scolaire/Corse.ics',
    frenchName: 'Vacances scolaires Corse',
    description: 'Calendrier scolaire officiel - Académie de Corse'
  },
  'vacances-guadeloupe': {
    sourceUrl: 'https://fr.ftp.opendatasoft.com/openscol/fr-en-calendrier-scolaire/Guadeloupe.ics',
    frenchName: 'Vacances scolaires Guadeloupe',
    description: 'Calendrier scolaire officiel - Guadeloupe'
  },
  'vacances-guyane': {
    sourceUrl: 'https://fr.ftp.opendatasoft.com/openscol/fr-en-calendrier-scolaire/Guyane.ics',
    frenchName: 'Vacances scolaires Guyane',
    description: 'Calendrier scolaire officiel - Guyane'
  },
  'vacances-martinique': {
    sourceUrl: 'https://fr.ftp.opendatasoft.com/openscol/fr-en-calendrier-scolaire/Martinique.ics',
    frenchName: 'Vacances scolaires Martinique',
    description: 'Calendrier scolaire officiel - Martinique'
  },
  'vacances-mayotte': {
    sourceUrl: 'https://fr.ftp.opendatasoft.com/openscol/fr-en-calendrier-scolaire/Mayotte.ics',
    frenchName: 'Vacances scolaires Mayotte',
    description: 'Calendrier scolaire officiel - Mayotte'
  },
  'vacances-la-reunion': {
    sourceUrl: 'https://fr.ftp.opendatasoft.com/openscol/fr-en-calendrier-scolaire/Reunion.ics',
    frenchName: 'Vacances scolaires La Réunion',
    description: 'Calendrier scolaire officiel - La Réunion'
  },
  'vacances-polynesie': {
    sourceUrl: 'https://fr.ftp.opendatasoft.com/openscol/fr-en-calendrier-scolaire/Polynesie.ics',
    frenchName: 'Vacances scolaires Polynésie française',
    description: 'Calendrier scolaire officiel - Polynésie française'
  },
  'vacances-nouvelle-caledonie': {
    sourceUrl: 'https://fr.ftp.opendatasoft.com/openscol/fr-en-calendrier-scolaire/NouvelleCaledonie.ics',
    frenchName: 'Vacances scolaires Nouvelle-Calédonie',
    description: 'Calendrier scolaire officiel - Nouvelle-Calédonie'
  },
  'vacances-saint-pierre-et-miquelon': {
    sourceUrl: 'https://fr.ftp.opendatasoft.com/openscol/fr-en-calendrier-scolaire/SaintPierreEtMiquelon.ics',
    frenchName: 'Vacances scolaires Saint-Pierre-et-Miquelon',
    description: 'Calendrier scolaire officiel - Saint-Pierre-et-Miquelon'
  },
  'vacances-wallis-et-futuna': {
    sourceUrl: 'https://fr.ftp.opendatasoft.com/openscol/fr-en-calendrier-scolaire/WallisEtFutuna.ics',
    frenchName: 'Vacances scolaires Wallis-et-Futuna',
    description: 'Calendrier scolaire officiel - Wallis-et-Futuna'
  },
  'feries-metropole': {
    sourceUrl: 'https://etalab.github.io/jours-feries-france-data/ics/jours_feries_metropole.ics',
    frenchName: 'Jours fériés France',
    description: 'Tous les jours fériés en France métropolitaine'
  },
  'feries-alsace-moselle': {
    sourceUrl: 'https://etalab.github.io/jours-feries-france-data/ics/jours_feries_alsace-moselle.ics',
    frenchName: 'Jours fériés Alsace-Moselle',
    description: 'Jours fériés spécifiques (Vendredi Saint, Saint-Étienne)'
  },
  'feries-guadeloupe': {
    sourceUrl: 'https://etalab.github.io/jours-feries-france-data/ics/jours_feries_guadeloupe.ics',
    frenchName: 'Jours fériés Guadeloupe',
    description: "Jours fériés + abolition de l'esclavage (27 mai)"
  },
  'feries-guyane': {
    sourceUrl: 'https://etalab.github.io/jours-feries-france-data/ics/jours_feries_guyane.ics',
    frenchName: 'Jours fériés Guyane',
    description: "Jours fériés + abolition de l'esclavage (10 juin)"
  },
  'feries-martinique': {
    sourceUrl: 'https://etalab.github.io/jours-feries-france-data/ics/jours_feries_martinique.ics',
    frenchName: 'Jours fériés Martinique',
    description: "Jours fériés + abolition de l'esclavage (22 mai)"
  },
  'feries-la-reunion': {
    sourceUrl: 'https://etalab.github.io/jours-feries-france-data/ics/jours_feries_la-reunion.ics',
    frenchName: 'Jours fériés La Réunion',
    description: "Jours fériés + abolition de l'esclavage (20 décembre)"
  },
  'feries-mayotte': {
    sourceUrl: 'https://etalab.github.io/jours-feries-france-data/ics/jours_feries_mayotte.ics',
    frenchName: 'Jours fériés Mayotte',
    description: "Jours fériés + abolition de l'esclavage (27 avril)"
  },
  'feries-nouvelle-caledonie': {
    sourceUrl: 'https://etalab.github.io/jours-feries-france-data/ics/jours_feries_nouvelle-caledonie.ics',
    frenchName: 'Jours fériés Nouvelle-Calédonie',
    description: 'Jours fériés spécifiques à la Nouvelle-Calédonie'
  },
  'feries-polynesie-francaise': {
    sourceUrl: 'https://etalab.github.io/jours-feries-france-data/ics/jours_feries_polynesie-francaise.ics',
    frenchName: 'Jours fériés Polynésie',
    description: 'Jours fériés spécifiques à la Polynésie française'
  },
  'feries-saint-barthelemy': {
    sourceUrl: 'https://etalab.github.io/jours-feries-france-data/ics/jours_feries_saint-barthelemy.ics',
    frenchName: 'Jours fériés Saint-Barthélemy',
    description: "Jours fériés + abolition de l'esclavage (9 octobre)"
  },
  'feries-saint-martin': {
    sourceUrl: 'https://etalab.github.io/jours-feries-france-data/ics/jours_feries_saint-martin.ics',
    frenchName: 'Jours fériés Saint-Martin',
    description: "Jours fériés + abolition de l'esclavage (28 mai)"
  },
  'feries-saint-pierre-et-miquelon': {
    sourceUrl: 'https://etalab.github.io/jours-feries-france-data/ics/jours_feries_saint-pierre-et-miquelon.ics',
    frenchName: 'Jours fériés Saint-Pierre-et-Miquelon',
    description: 'Jours fériés spécifiques à Saint-Pierre-et-Miquelon'
  },
  'feries-wallis-et-futuna': {
    sourceUrl: 'https://etalab.github.io/jours-feries-france-data/ics/jours_feries_wallis-et-futuna.ics',
    frenchName: 'Jours fériés Wallis-et-Futuna',
    description: 'Jours fériés spécifiques à Wallis-et-Futuna'
  },
  'belgique-feries-remplacement': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/belgique/feries-remplacement.ics',
    frenchName: 'Belgique - Fériés et remplacement entreprises',
    description: 'Jours fériés légaux belges + rappels de remplacement en entreprise'
  },
  'belgique-vacances-fwb': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/belgique/vacances-fwb.ics',
    frenchName: 'Belgique - Vacances scolaires FWB',
    description: 'Vacances scolaires de la Fédération Wallonie-Bruxelles (2026-2031)'
  },
  'belgique-vacances-vlaanderen': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/belgique/vacances-vlaanderen.ics',
    frenchName: 'Belgique - Vacances scolaires Vlaanderen',
    description: 'Vacances scolaires en Flandre (2026-2031)'
  },
  'belgique-soldes-attente': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/belgique/soldes-attente.ics',
    frenchName: 'Belgique - Soldes et période d’attente',
    description: 'Soldes légaux belges et périodes d’attente pré-soldes'
  },
  'belgique-fetes-institutionnelles': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/belgique/fetes-institutionnelles.ics',
    frenchName: 'Belgique - Fêtes institutionnelles',
    description: 'Repères institutionnels belges (fédéral, régions, communautés)'
  },
  'belgique-grands-evenements': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/belgique/grands-evenements.ics',
    frenchName: 'Belgique - Grands événements',
    description: 'Festivals, traditions et événements sportifs belges'
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
  'culture-tech-gaming': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/culture/tech-gaming.ics',
    frenchName: 'Conférences Tech/Gaming',
    description: 'CES, NVIDIA GTC, PAX, Cloud Next, Summer Game Fest, SIGGRAPH, gamescom dev, BlizzCon'
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
  'religion-saints-francais': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/religion/saints-francais.ics',
    frenchName: 'Saints Français',
    description: 'Saint du jour (calendrier quotidien)'
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
  },
  'sport-france-foot-equipe-nationale': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/sport/france-foot-equipe-nationale.ics',
    frenchName: 'Equipe de France Football',
    description: 'Matchs de l equipe de France de football (fenetre glissante 24 mois)'
  },
  'sport-france-rugby-equipe-nationale': {
    sourceUrl: 'https://raw.githubusercontent.com/augiefra/facilabo/main/sport/france-rugby-equipe-nationale.ics',
    frenchName: 'Equipe de France Rugby',
    description: 'Matchs de l equipe de France de rugby (fenetre glissante 24 mois)'
  }
};

export interface CalendarCachePolicy {
  sMaxAge: number;
  staleWhileRevalidate: number;
  inMemoryTtl: number;
}

const DEFAULT_CALENDAR_CACHE_POLICY: CalendarCachePolicy = {
  sMaxAge: 3600,
  staleWhileRevalidate: 7200,
  inMemoryTtl: 3600
};

const CALENDAR_CACHE_POLICY_OVERRIDES: Record<string, Partial<CalendarCachePolicy>> = {
  'sport-france-foot-equipe-nationale': {
    sMaxAge: 900,
    staleWhileRevalidate: 3600,
    inMemoryTtl: 900
  },
  'sport-france-rugby-equipe-nationale': {
    sMaxAge: 900,
    staleWhileRevalidate: 3600,
    inMemoryTtl: 900
  }
};

export function getCalendarCachePolicy(slug: string): CalendarCachePolicy {
  const override = CALENDAR_CACHE_POLICY_OVERRIDES[slug];
  if (!override) {
    return DEFAULT_CALENDAR_CACHE_POLICY;
  }

  return {
    ...DEFAULT_CALENDAR_CACHE_POLICY,
    ...override
  };
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
  'lorient': {
    sourceUrl: 'https://ics.fixtur.es/v2/lorient.ics',
    frenchName: 'FC Lorient'
  },
  'metz': {
    sourceUrl: 'https://ics.fixtur.es/v2/fc-metz.ics',
    frenchName: 'FC Metz'
  },
  'parisFc': {
    sourceUrl: 'https://ics.fixtur.es/v2/paris-fc.ics',
    frenchName: 'Paris FC'
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
  // Backward compatibility for existing app versions still listing these teams.
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
  'montauban': {
    sourceUrl: 'https://facilabo-api.vercel.app/api/calendar/rugby/montauban',
    frenchName: 'US Montauban'
  },
  // Backward compatibility for existing app versions still subscribed to RC Vannes.
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

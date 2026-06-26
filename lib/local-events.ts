import { InMemoryTTLCache } from './service-search-utils';

export const LOCAL_EVENTS_CONTRACT_VERSION = '2026-06-23.local-events-v1';
const OPENAGENDA_BASE_URL = 'https://api.openagenda.com/v2';
const OPENAGENDA_SOURCE = 'OpenAgenda v2';

type TargetType = 'city' | 'metropole' | 'department' | 'region' | 'event';

export interface LocalEventTarget {
  slug: string;
  title: string;
  type: TargetType;
  city?: string;
  department?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  radiusKm: number;
  searchTerms: string[];
  seasonPeriod?: string;
}

export interface LocalEventItem {
  id: string;
  title: string;
  subtitle?: string;
  startDate?: string;
  endDate?: string;
  locationName?: string;
  address?: string;
  city?: string;
  department?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  sourceAgendaTitle?: string;
  sourceAgendaUid?: number | string;
  url?: string;
  imageUrl?: string;
  source: 'openagenda';
}

export interface LocalEventSearchQuery {
  target?: string;
  city?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  limit?: number;
  from?: string;
  to?: string;
}

export interface LocalEventSearchResponse {
  events: LocalEventItem[];
  targets: Pick<LocalEventTarget, 'slug' | 'title' | 'type' | 'city' | 'department' | 'region' | 'latitude' | 'longitude' | 'radiusKm'>[];
  total: number;
  query: LocalEventSearchQuery;
  limit: number;
  contractVersion: string;
  lastUpdated: string;
  source: string;
  note?: string;
  runtime: {
    freshness: 'fresh' | 'stale' | 'unavailable';
    degraded: boolean;
    fallbackUsed: boolean;
    lastUpdated: string;
  };
}

interface OpenAgendaAgenda {
  uid?: number | string;
  title?: unknown;
  name?: unknown;
  slug?: string;
}

interface EventFetchContext {
  target: LocalEventTarget;
  agenda: OpenAgendaAgenda;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  from?: string;
  to?: string;
}

const eventCache = new InMemoryTTLCache<LocalEventSearchResponse>(20 * 60 * 1000);
const agendaCache = new InMemoryTTLCache<OpenAgendaAgenda[]>(60 * 60 * 1000);

export const LOCAL_EVENT_TARGETS: LocalEventTarget[] = [
  {
    slug: 'allauch',
    title: 'Agenda Allauch',
    type: 'city',
    city: 'Allauch',
    department: 'Bouches-du-Rhône',
    region: 'Provence-Alpes-Côte d’Azur',
    latitude: 43.3353,
    longitude: 5.4820,
    radiusKm: 15,
    searchTerms: ['Allauch agenda', 'Allauch sorties', 'Ville Allauch'],
  },
  {
    slug: 'marseille',
    title: 'Agenda Marseille',
    type: 'city',
    city: 'Marseille',
    department: 'Bouches-du-Rhône',
    region: 'Provence-Alpes-Côte d’Azur',
    latitude: 43.2965,
    longitude: 5.3698,
    radiusKm: 20,
    searchTerms: ['Marseille agenda', 'Marseille sorties', 'Ville Marseille'],
  },
  {
    slug: 'aix-en-provence',
    title: 'Agenda Aix-en-Provence',
    type: 'city',
    city: 'Aix-en-Provence',
    department: 'Bouches-du-Rhône',
    region: 'Provence-Alpes-Côte d’Azur',
    latitude: 43.5297,
    longitude: 5.4474,
    radiusKm: 20,
    searchTerms: ['Aix-en-Provence agenda', 'Aix en Provence sorties', 'Ville Aix-en-Provence'],
  },
  {
    slug: 'aubagne',
    title: 'Agenda Aubagne',
    type: 'city',
    city: 'Aubagne',
    department: 'Bouches-du-Rhône',
    region: 'Provence-Alpes-Côte d’Azur',
    latitude: 43.2928,
    longitude: 5.5707,
    radiusKm: 15,
    searchTerms: ['Aubagne agenda', 'Aubagne sorties', 'Ville Aubagne'],
  },
  {
    slug: 'paris',
    title: 'Agenda Paris',
    type: 'city',
    city: 'Paris',
    department: 'Paris',
    region: 'Île-de-France',
    latitude: 48.8566,
    longitude: 2.3522,
    radiusKm: 15,
    searchTerms: ['Paris agenda', 'Que faire à Paris', 'Ville de Paris'],
  },
  {
    slug: 'lyon',
    title: 'Agenda Lyon',
    type: 'city',
    city: 'Lyon',
    department: 'Rhône',
    region: 'Auvergne-Rhône-Alpes',
    latitude: 45.7640,
    longitude: 4.8357,
    radiusKm: 15,
    searchTerms: ['Lyon agenda', 'Lyon sorties', 'Ville de Lyon'],
  },
  {
    slug: 'toulouse',
    title: 'Agenda Toulouse',
    type: 'city',
    city: 'Toulouse',
    department: 'Haute-Garonne',
    region: 'Occitanie',
    latitude: 43.6047,
    longitude: 1.4442,
    radiusKm: 18,
    searchTerms: ['Toulouse agenda', 'Toulouse sorties', 'Ville Toulouse', 'Toulouse Métropole agenda'],
  },
  {
    slug: 'nice',
    title: 'Agenda Nice',
    type: 'city',
    city: 'Nice',
    department: 'Alpes-Maritimes',
    region: 'Provence-Alpes-Côte d’Azur',
    latitude: 43.7102,
    longitude: 7.2620,
    radiusKm: 18,
    searchTerms: ['Nice agenda', 'Nice sorties', 'Ville Nice', 'Métropole Nice Côte d’Azur agenda'],
  },
  {
    slug: 'nantes',
    title: 'Agenda Nantes',
    type: 'city',
    city: 'Nantes',
    department: 'Loire-Atlantique',
    region: 'Pays de la Loire',
    latitude: 47.2184,
    longitude: -1.5536,
    radiusKm: 18,
    searchTerms: ['Nantes agenda', 'Nantes sorties', 'Ville Nantes', 'Nantes Métropole agenda'],
  },
  {
    slug: 'montpellier',
    title: 'Agenda Montpellier',
    type: 'city',
    city: 'Montpellier',
    department: 'Hérault',
    region: 'Occitanie',
    latitude: 43.6108,
    longitude: 3.8767,
    radiusKm: 18,
    searchTerms: ['Montpellier agenda', 'Montpellier sorties', 'Ville Montpellier', 'Montpellier Méditerranée Métropole agenda'],
  },
  {
    slug: 'strasbourg',
    title: 'Agenda Strasbourg',
    type: 'city',
    city: 'Strasbourg',
    department: 'Bas-Rhin',
    region: 'Grand Est',
    latitude: 48.5734,
    longitude: 7.7521,
    radiusKm: 18,
    searchTerms: ['Strasbourg agenda', 'Strasbourg sorties', 'Ville Strasbourg', 'Eurométropole Strasbourg agenda'],
  },
  {
    slug: 'bordeaux',
    title: 'Agenda Bordeaux',
    type: 'city',
    city: 'Bordeaux',
    department: 'Gironde',
    region: 'Nouvelle-Aquitaine',
    latitude: 44.8378,
    longitude: -0.5792,
    radiusKm: 18,
    searchTerms: ['Bordeaux agenda', 'Bordeaux sorties', 'Ville Bordeaux', 'Bordeaux Métropole agenda'],
  },
  {
    slug: 'lille',
    title: 'Agenda Lille',
    type: 'city',
    city: 'Lille',
    department: 'Nord',
    region: 'Hauts-de-France',
    latitude: 50.6292,
    longitude: 3.0573,
    radiusKm: 18,
    searchTerms: ['Lille agenda', 'Lille sorties', 'Ville Lille', 'Métropole Européenne de Lille agenda'],
  },
  {
    slug: 'rennes',
    title: 'Agenda Rennes',
    type: 'city',
    city: 'Rennes',
    department: 'Ille-et-Vilaine',
    region: 'Bretagne',
    latitude: 48.1173,
    longitude: -1.6778,
    radiusKm: 18,
    searchTerms: ['Rennes agenda', 'Rennes sorties', 'Ville Rennes', 'Rennes Métropole agenda'],
  },
  {
    slug: 'reims',
    title: 'Agenda Reims',
    type: 'city',
    city: 'Reims',
    department: 'Marne',
    region: 'Grand Est',
    latitude: 49.2583,
    longitude: 4.0317,
    radiusKm: 18,
    searchTerms: ['Reims agenda', 'Reims sorties', 'Ville Reims', 'Grand Reims agenda'],
  },
  {
    slug: 'saint-etienne',
    title: 'Agenda Saint-Étienne',
    type: 'city',
    city: 'Saint-Étienne',
    department: 'Loire',
    region: 'Auvergne-Rhône-Alpes',
    latitude: 45.4397,
    longitude: 4.3872,
    radiusKm: 18,
    searchTerms: ['Saint-Étienne agenda', 'Saint Etienne sorties', 'Ville Saint-Étienne', 'Saint-Étienne Métropole agenda'],
  },
  {
    slug: 'toulon',
    title: 'Agenda Toulon',
    type: 'city',
    city: 'Toulon',
    department: 'Var',
    region: 'Provence-Alpes-Côte d’Azur',
    latitude: 43.1242,
    longitude: 5.9280,
    radiusKm: 18,
    searchTerms: ['Toulon agenda', 'Toulon sorties', 'Ville Toulon', 'Métropole Toulon Provence Méditerranée agenda'],
  },
  {
    slug: 'le-havre',
    title: 'Agenda Le Havre',
    type: 'city',
    city: 'Le Havre',
    department: 'Seine-Maritime',
    region: 'Normandie',
    latitude: 49.4944,
    longitude: 0.1079,
    radiusKm: 18,
    searchTerms: ['Le Havre agenda', 'Le Havre sorties', 'Ville Le Havre', 'Le Havre Seine Métropole agenda'],
  },
  {
    slug: 'grenoble',
    title: 'Agenda Grenoble',
    type: 'city',
    city: 'Grenoble',
    department: 'Isère',
    region: 'Auvergne-Rhône-Alpes',
    latitude: 45.1885,
    longitude: 5.7245,
    radiusKm: 18,
    searchTerms: ['Grenoble agenda', 'Grenoble sorties', 'Ville Grenoble', 'Grenoble Alpes Métropole agenda'],
  },
  {
    slug: 'dijon',
    title: 'Agenda Dijon',
    type: 'city',
    city: 'Dijon',
    department: 'Côte-d’Or',
    region: 'Bourgogne-Franche-Comté',
    latitude: 47.3220,
    longitude: 5.0415,
    radiusKm: 18,
    searchTerms: ['Dijon agenda', 'Dijon sorties', 'Ville Dijon', 'Dijon Métropole agenda'],
  },
  {
    slug: 'angers',
    title: 'Agenda Angers',
    type: 'city',
    city: 'Angers',
    department: 'Maine-et-Loire',
    region: 'Pays de la Loire',
    latitude: 47.4784,
    longitude: -0.5632,
    radiusKm: 18,
    searchTerms: ['Angers agenda', 'Angers sorties', 'Ville Angers', 'Angers Loire Métropole agenda'],
  },
  {
    slug: 'nimes',
    title: 'Agenda Nîmes',
    type: 'city',
    city: 'Nîmes',
    department: 'Gard',
    region: 'Occitanie',
    latitude: 43.8367,
    longitude: 4.3601,
    radiusKm: 18,
    searchTerms: ['Nîmes agenda', 'Nimes sorties', 'Ville Nîmes', 'Nîmes Métropole agenda'],
  },
  {
    slug: 'villeurbanne',
    title: 'Agenda Villeurbanne',
    type: 'city',
    city: 'Villeurbanne',
    department: 'Rhône',
    region: 'Auvergne-Rhône-Alpes',
    latitude: 45.7719,
    longitude: 4.8902,
    radiusKm: 12,
    searchTerms: ['Villeurbanne agenda', 'Villeurbanne sorties', 'Ville Villeurbanne'],
  },
  {
    slug: 'grand-paris',
    title: 'Métropole du Grand Paris',
    type: 'metropole',
    department: 'Paris',
    region: 'Île-de-France',
    latitude: 48.8566,
    longitude: 2.3522,
    radiusKm: 45,
    searchTerms: ['Métropole du Grand Paris agenda', 'Grand Paris sorties', 'Grand Paris culture'],
  },
  {
    slug: 'metropole-aix-marseille-provence',
    title: 'Métropole Aix-Marseille-Provence',
    type: 'metropole',
    department: 'Bouches-du-Rhône',
    region: 'Provence-Alpes-Côte d’Azur',
    latitude: 43.40,
    longitude: 5.30,
    radiusKm: 75,
    searchTerms: ['Métropole Aix-Marseille-Provence agenda', 'Aix Marseille Provence sorties'],
  },
  {
    slug: 'grand-lyon',
    title: 'Métropole de Lyon',
    type: 'metropole',
    department: 'Rhône',
    region: 'Auvergne-Rhône-Alpes',
    latitude: 45.7640,
    longitude: 4.8357,
    radiusKm: 45,
    searchTerms: ['Métropole de Lyon agenda', 'Grand Lyon sorties', 'Lyon métropole culture'],
  },
  {
    slug: 'metropole-europeenne-lille',
    title: 'Métropole Européenne de Lille',
    type: 'metropole',
    department: 'Nord',
    region: 'Hauts-de-France',
    latitude: 50.6292,
    longitude: 3.0573,
    radiusKm: 45,
    searchTerms: ['Métropole Européenne de Lille agenda', 'MEL sorties', 'Lille métropole culture'],
  },
  {
    slug: 'toulouse-metropole',
    title: 'Toulouse Métropole',
    type: 'metropole',
    department: 'Haute-Garonne',
    region: 'Occitanie',
    latitude: 43.6047,
    longitude: 1.4442,
    radiusKm: 45,
    searchTerms: ['Toulouse Métropole agenda', 'Toulouse métropole sorties', 'Toulouse culture métropole'],
  },
  {
    slug: 'bordeaux-metropole',
    title: 'Bordeaux Métropole',
    type: 'metropole',
    department: 'Gironde',
    region: 'Nouvelle-Aquitaine',
    latitude: 44.8378,
    longitude: -0.5792,
    radiusKm: 45,
    searchTerms: ['Bordeaux Métropole agenda', 'Bordeaux métropole sorties', 'Bordeaux culture métropole'],
  },
  {
    slug: 'nantes-metropole',
    title: 'Nantes Métropole',
    type: 'metropole',
    department: 'Loire-Atlantique',
    region: 'Pays de la Loire',
    latitude: 47.2184,
    longitude: -1.5536,
    radiusKm: 45,
    searchTerms: ['Nantes Métropole agenda', 'Nantes métropole sorties', 'Nantes culture métropole'],
  },
  {
    slug: 'eurometropole-strasbourg',
    title: 'Eurométropole de Strasbourg',
    type: 'metropole',
    department: 'Bas-Rhin',
    region: 'Grand Est',
    latitude: 48.5734,
    longitude: 7.7521,
    radiusKm: 45,
    searchTerms: ['Eurométropole Strasbourg agenda', 'Strasbourg métropole sorties', 'Strasbourg culture métropole'],
  },
  {
    slug: 'montpellier-mediterranee-metropole',
    title: 'Montpellier Méditerranée Métropole',
    type: 'metropole',
    department: 'Hérault',
    region: 'Occitanie',
    latitude: 43.6108,
    longitude: 3.8767,
    radiusKm: 45,
    searchTerms: ['Montpellier Méditerranée Métropole agenda', 'Montpellier métropole sorties', 'Montpellier culture métropole'],
  },
  {
    slug: 'rennes-metropole',
    title: 'Rennes Métropole',
    type: 'metropole',
    department: 'Ille-et-Vilaine',
    region: 'Bretagne',
    latitude: 48.1173,
    longitude: -1.6778,
    radiusKm: 45,
    searchTerms: ['Rennes Métropole agenda', 'Rennes métropole sorties', 'Rennes culture métropole'],
  },
  {
    slug: 'bouches-du-rhone',
    title: 'Département Bouches-du-Rhône',
    type: 'department',
    department: 'Bouches-du-Rhône',
    region: 'Provence-Alpes-Côte d’Azur',
    latitude: 43.45,
    longitude: 5.10,
    radiusKm: 110,
    searchTerms: ['Bouches-du-Rhône agenda', 'Département Bouches-du-Rhône sorties', 'Provence agenda'],
  },
  {
    slug: 'region-sud',
    title: 'Région Sud',
    type: 'region',
    region: 'Provence-Alpes-Côte d’Azur',
    latitude: 43.90,
    longitude: 6.20,
    radiusKm: 220,
    searchTerms: ['Région Sud agenda', 'Provence-Alpes-Côte d’Azur sorties', 'PACA agenda'],
  },
  {
    slug: 'carnaval-nice',
    title: 'Carnaval de Nice',
    type: 'event',
    city: 'Nice',
    department: 'Alpes-Maritimes',
    region: 'Provence-Alpes-Côte d’Azur',
    latitude: 43.7102,
    longitude: 7.2620,
    radiusKm: 15,
    searchTerms: ['Carnaval de Nice'],
  },
  {
    slug: 'braderie-lille',
    title: 'Braderie de Lille',
    type: 'event',
    city: 'Lille',
    department: 'Nord',
    region: 'Hauts-de-France',
    latitude: 50.6292,
    longitude: 3.0573,
    radiusKm: 15,
    searchTerms: ['Braderie de Lille'],
  },
  {
    slug: 'strasbourg-noel-2026',
    title: 'Strasbourg Noël 2026',
    type: 'event',
    city: 'Strasbourg',
    department: 'Bas-Rhin',
    region: 'Grand Est',
    latitude: 48.5734,
    longitude: 7.7521,
    radiusKm: 18,
    searchTerms: ['Noël Strasbourg 2026', 'Marché de Noël Strasbourg'],
    seasonPeriod: '2026',
  },
  {
    slug: 'armada-rouen-2027',
    title: 'Armada de Rouen 2027',
    type: 'event',
    city: 'Rouen',
    department: 'Seine-Maritime',
    region: 'Normandie',
    latitude: 49.4431,
    longitude: 1.0993,
    radiusKm: 20,
    searchTerms: ['Armada Rouen 2027', 'Armada de Rouen'],
    seasonPeriod: '2027',
  },
  {
    slug: 'cannes-2027',
    title: 'Cannes 2027',
    type: 'event',
    city: 'Cannes',
    department: 'Alpes-Maritimes',
    region: 'Provence-Alpes-Côte d’Azur',
    latitude: 43.5528,
    longitude: 7.0174,
    radiusKm: 15,
    searchTerms: ['Festival de Cannes 2027', 'Cannes 2027'],
    seasonPeriod: '2027',
  },
  {
    slug: 'foire-paris-2027',
    title: 'Foire de Paris 2027',
    type: 'event',
    city: 'Paris',
    department: 'Paris',
    region: 'Île-de-France',
    latitude: 48.8306,
    longitude: 2.2872,
    radiusKm: 12,
    searchTerms: ['Foire de Paris 2027', 'Foire de Paris'],
    seasonPeriod: '2027',
  },
  {
    slug: 'salon-agriculture-2027',
    title: 'Salon de l’Agriculture 2027',
    type: 'event',
    city: 'Paris',
    department: 'Paris',
    region: 'Île-de-France',
    latitude: 48.8306,
    longitude: 2.2872,
    radiusKm: 12,
    searchTerms: ['Salon International de l’Agriculture 2027', 'Salon de l’Agriculture'],
    seasonPeriod: '2027',
  },
  {
    slug: 'rencontres-arles',
    title: 'Rencontres d’Arles',
    type: 'event',
    city: 'Arles',
    department: 'Bouches-du-Rhône',
    region: 'Provence-Alpes-Côte d’Azur',
    latitude: 43.6766,
    longitude: 4.6278,
    radiusKm: 18,
    searchTerms: ['Rencontres d’Arles', 'Les Rencontres de la photographie Arles'],
  },
  {
    slug: 'journees-nationales-architecture-2026',
    title: 'Journées nationales de l’architecture 2026',
    type: 'event',
    region: 'France',
    radiusKm: 300,
    searchTerms: ['Journées nationales de l’architecture 2026', 'Journées architecture'],
    seasonPeriod: '2026',
  },
];

export function getLocalEventTarget(slug: string): LocalEventTarget | undefined {
  return LOCAL_EVENT_TARGETS.find((target) => target.slug === slug);
}

export function getLocalEventTargetSummaries() {
  return LOCAL_EVENT_TARGETS.map(toTargetSummary);
}

export function buildLocalEventsCacheKey(query: LocalEventSearchQuery): string {
  return [
    query.target ?? '',
    query.city ?? '',
    query.lat?.toFixed(3) ?? '',
    query.lng?.toFixed(3) ?? '',
    query.radius ?? '',
    query.limit ?? '',
    query.from ?? '',
    query.to ?? '',
  ].join(':');
}

export async function searchLocalEvents(query: LocalEventSearchQuery): Promise<LocalEventSearchResponse> {
  const limit = clampInt(query.limit, 1, 80, 30);
  const cacheKey = buildLocalEventsCacheKey({ ...query, limit });
  const cached = eventCache.get(cacheKey);
  if (cached) {
    return {
      ...cached,
      runtime: {
        ...cached.runtime,
        freshness: 'fresh',
      },
    };
  }

  const now = new Date().toISOString();
  const apiKey = openAgendaKey();
  const targets = resolveTargets(query);

  if (!apiKey) {
    return makeResponse({
      events: [],
      targets,
      query: { ...query, limit },
      limit,
      lastUpdated: now,
      freshness: 'unavailable',
      degraded: true,
      fallbackUsed: true,
      note: 'OPENAGENDA_PUBLIC_KEY non configuree cote API FacilAbo.',
    });
  }

  try {
    const agendaLists = await Promise.all(
      targets.map(async (target) => ({
        target,
        agendas: await findAgendasForTarget(target, apiKey),
      })),
    );

    const contexts = agendaLists.flatMap(({ target, agendas }) =>
      agendas.slice(0, 3).map((agenda) => ({
        target,
        agenda,
        lat: query.lat,
        lng: query.lng,
        radiusKm: query.radius,
        from: query.from,
        to: query.to,
      })),
    );

    const eventLists = await Promise.all(
      contexts.map((context) => fetchEventsForAgenda(context, apiKey, Math.min(limit, 40))),
    );

    const events = dedupeEvents(eventLists.flat())
      .map((event) => addDistance(event, query.lat, query.lng))
      .filter((event) => withinRadius(event, query))
      .sort(compareEvents)
      .slice(0, limit);

    const response = makeResponse({
      events,
      targets,
      query: { ...query, limit },
      limit,
      lastUpdated: now,
      freshness: 'fresh',
      degraded: false,
      fallbackUsed: false,
    });

    eventCache.set(cacheKey, response);
    return response;
  } catch (error) {
    const stale = eventCache.getStale(cacheKey);
    if (stale) {
      return {
        ...stale,
        note: 'Resultats issus du cache stale suite a une indisponibilite OpenAgenda.',
        runtime: {
          freshness: 'stale',
          degraded: true,
          fallbackUsed: true,
          lastUpdated: stale.lastUpdated,
        },
      };
    }

    return makeResponse({
      events: [],
      targets,
      query: { ...query, limit },
      limit,
      lastUpdated: now,
      freshness: 'unavailable',
      degraded: true,
      fallbackUsed: true,
      note: error instanceof Error ? error.message : 'OpenAgenda indisponible.',
    });
  }
}

export function localEventsToIcs(
  calendarName: string,
  calendarDescription: string,
  events: LocalEventItem[],
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FacilAbo//Local Events OpenAgenda//FR',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    `NAME:${escapeIcsText(calendarName)}`,
    `X-WR-CALDESC:${escapeIcsText(calendarDescription)}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const event of events) {
    const start = parseDate(event.startDate);
    if (!start) continue;

    const end = parseDate(event.endDate) ?? new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const uid = `${slugify(event.id)}@facilabo-local-events`;
    const description = [
      event.subtitle,
      event.locationName,
      event.city,
      event.sourceAgendaTitle ? `Source: ${event.sourceAgendaTitle}` : undefined,
      event.url,
    ].filter(Boolean).join('\\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcsText(uid)}`,
      `DTSTAMP:${formatIcsDateTime(new Date())}`,
      `DTSTART:${formatIcsDateTime(start)}`,
      `DTEND:${formatIcsDateTime(end)}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
    );

    const location = [event.locationName, event.address, event.city].filter(Boolean).join(', ');
    if (location) {
      lines.push(`LOCATION:${escapeIcsText(location)}`);
    }
    if (event.url) {
      lines.push(`URL:${escapeIcsText(event.url)}`);
    }
    if (event.latitude !== undefined && event.longitude !== undefined) {
      lines.push(`GEO:${event.latitude};${event.longitude}`);
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

function resolveTargets(query: LocalEventSearchQuery): LocalEventTarget[] {
  if (query.target) {
    const target = getLocalEventTarget(query.target);
    return target ? [target] : [];
  }

  if (query.city) {
    const normalizedCity = normalize(query.city);
    const exact = LOCAL_EVENT_TARGETS.filter((target) => normalize(target.city ?? target.title).includes(normalizedCity));
    if (exact.length > 0) return exact.slice(0, 6);
  }

  if (query.lat !== undefined && query.lng !== undefined) {
    const radius = query.radius ?? 50;
    const nearby = LOCAL_EVENT_TARGETS
      .filter((target) => target.latitude !== undefined && target.longitude !== undefined)
      .map((target) => ({
        target,
        distance: distanceKm(query.lat!, query.lng!, target.latitude!, target.longitude!),
      }))
      .filter(({ target, distance }) => distance <= Math.max(radius, target.type === 'city' ? 30 : target.radiusKm))
      .sort((a, b) => {
        const typeRank = rankTarget(a.target.type) - rankTarget(b.target.type);
        return typeRank !== 0 ? typeRank : a.distance - b.distance;
      })
      .map(({ target }) => target)
      .slice(0, 8);

    if (nearby.length > 0) {
      return nearby;
    }
  }

  return LOCAL_EVENT_TARGETS.filter((target) => ['allauch', 'marseille', 'aix-en-provence', 'aubagne', 'paris', 'lyon'].includes(target.slug));
}

async function findAgendasForTarget(target: LocalEventTarget, apiKey: string): Promise<OpenAgendaAgenda[]> {
  const envUidList = process.env[`OPENAGENDA_TARGET_${target.slug.toUpperCase().replace(/-/g, '_')}_UIDS`];
  if (envUidList) {
    return envUidList.split(',').map((uid) => ({ uid: uid.trim(), title: target.title })).filter((agenda) => agenda.uid);
  }

  const cacheKey = `agendas:${target.slug}`;
  const cached = agendaCache.get(cacheKey);
  if (cached) return cached;

  const agendasByUid = new Map<string, OpenAgendaAgenda>();
  for (const term of target.searchTerms.slice(0, 3)) {
    const url = new URL(`${OPENAGENDA_BASE_URL}/agendas`);
    url.searchParams.set('official', '1');
    url.searchParams.set('search', term);
    url.searchParams.set('size', '8');
    url.searchParams.append('includeFields[]', 'uid');
    url.searchParams.append('includeFields[]', 'title');
    url.searchParams.append('includeFields[]', 'slug');
    url.searchParams.append('includeFields[]', 'official');

    const json = await fetchOpenAgendaJson(url, apiKey);
    for (const agenda of extractArray<OpenAgendaAgenda>(json, ['agendas', 'data', 'items'])) {
      if (agenda.uid === undefined || agenda.uid === null) continue;
      agendasByUid.set(String(agenda.uid), agenda);
    }
  }

  const agendas = Array.from(agendasByUid.values()).slice(0, 8);
  agendaCache.set(cacheKey, agendas);
  return agendas;
}

async function fetchEventsForAgenda(context: EventFetchContext, apiKey: string, size: number): Promise<LocalEventItem[]> {
  if (context.agenda.uid === undefined || context.agenda.uid === null) {
    return [];
  }

  const url = new URL(`${OPENAGENDA_BASE_URL}/agendas/${context.agenda.uid}/events`);
  url.searchParams.set('size', String(Math.min(size, 300)));
  url.searchParams.set('sort', 'timings.asc');
  url.searchParams.append('relative[]', 'upcoming');
  url.searchParams.append('includeFields[]', 'uid');
  url.searchParams.append('includeFields[]', 'title');
  url.searchParams.append('includeFields[]', 'description');
  url.searchParams.append('includeFields[]', 'longDescription');
  url.searchParams.append('includeFields[]', 'timings');
  url.searchParams.append('includeFields[]', 'location');
  url.searchParams.append('includeFields[]', 'image');
  url.searchParams.append('includeFields[]', 'canonicalUrl');
  url.searchParams.append('includeFields[]', 'registrationUrl');

  if (context.from) url.searchParams.set('timings[gte]', context.from);
  if (context.to) url.searchParams.set('timings[lte]', context.to);

  const bbox = context.lat !== undefined && context.lng !== undefined
    ? boundingBox(context.lat, context.lng, context.radiusKm ?? context.target.radiusKm)
    : boundingBoxForTarget(context.target);

  if (bbox) {
    url.searchParams.set('geo[northEast][lat]', String(bbox.north));
    url.searchParams.set('geo[northEast][lng]', String(bbox.east));
    url.searchParams.set('geo[southWest][lat]', String(bbox.south));
    url.searchParams.set('geo[southWest][lng]', String(bbox.west));
  }

  if (context.target.city) {
    url.searchParams.append('adminLevel4[]', context.target.city);
  } else if (context.target.department) {
    url.searchParams.append('adminLevel2[]', context.target.department);
  } else if (context.target.region && context.target.region !== 'France') {
    url.searchParams.append('adminLevel1[]', context.target.region);
  }

  if (context.target.type === 'event') {
    url.searchParams.set('search', context.target.searchTerms[0]);
  }

  const json = await fetchOpenAgendaJson(url, apiKey);
  const events = extractArray<Record<string, unknown>>(json, ['events', 'data', 'items']);
  const agendaTitle = textOf(context.agenda.title ?? context.agenda.name) ?? context.target.title;
  const agendaUid = context.agenda.uid;

  if (agendaUid === undefined || agendaUid === null) {
    return [];
  }

  return events.map((event) => mapOpenAgendaEvent(event, context.target, agendaUid, agendaTitle));
}

async function fetchOpenAgendaJson(url: URL, apiKey: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      key: apiKey,
      accept: 'application/json',
      'user-agent': 'FacilAbo/1.0 local-events',
    },
  });

  if (!response.ok) {
    throw new Error(`OpenAgenda ${response.status} pour ${url.pathname}`);
  }

  return response.json();
}

function mapOpenAgendaEvent(
  event: Record<string, unknown>,
  target: LocalEventTarget,
  agendaUid: number | string,
  agendaTitle: string,
): LocalEventItem {
  const location = objectOf(event.location) ?? {};
  const timing = Array.isArray(event.timings) ? objectOf(event.timings[0]) ?? {} : {};
  const title = textOf(event.title) ?? 'Événement local';
  const subtitle = textOf(event.description) ?? textOf(event.longDescription);
  const image = objectOf(event.image);

  const latitude = numberOf(location.latitude ?? location.lat ?? event.latitude);
  const longitude = numberOf(location.longitude ?? location.lng ?? location.lon ?? event.longitude);
  const startDate = stringOf(timing.begin ?? timing.start ?? event.startDate);
  const endDate = stringOf(timing.end ?? timing.finish ?? event.endDate);
  const id = stringOf(event.uid ?? event.id) ?? `${target.slug}-${title}-${startDate ?? ''}`;

  return {
    id: `${agendaUid}-${id}`,
    title,
    subtitle,
    startDate,
    endDate,
    locationName: textOf(location.name ?? event.locationName),
    address: textOf(location.address ?? event.address),
    city: textOf(location.city ?? event.city) ?? target.city,
    department: textOf(location.department ?? event.department) ?? target.department,
    region: textOf(location.region ?? event.region) ?? target.region,
    latitude,
    longitude,
    sourceAgendaTitle: agendaTitle,
    sourceAgendaUid: String(agendaUid),
    url: stringOf(event.canonicalUrl ?? event.registrationUrl ?? event.url),
    imageUrl: stringOf(image?.base ?? image?.url ?? event.imageUrl),
    source: 'openagenda',
  };
}

function makeResponse(args: {
  events: LocalEventItem[];
  targets: LocalEventTarget[];
  query: LocalEventSearchQuery;
  limit: number;
  lastUpdated: string;
  freshness: 'fresh' | 'stale' | 'unavailable';
  degraded: boolean;
  fallbackUsed: boolean;
  note?: string;
}): LocalEventSearchResponse {
  return {
    events: args.events,
    targets: args.targets.map(toTargetSummary),
    total: args.events.length,
    query: args.query,
    limit: args.limit,
    contractVersion: LOCAL_EVENTS_CONTRACT_VERSION,
    lastUpdated: args.lastUpdated,
    source: OPENAGENDA_SOURCE,
    note: args.note,
    runtime: {
      freshness: args.freshness,
      degraded: args.degraded,
      fallbackUsed: args.fallbackUsed,
      lastUpdated: args.lastUpdated,
    },
  };
}

function toTargetSummary(target: LocalEventTarget) {
  return {
    slug: target.slug,
    title: target.title,
    type: target.type,
    city: target.city,
    department: target.department,
    region: target.region,
    latitude: target.latitude,
    longitude: target.longitude,
    radiusKm: target.radiusKm,
  };
}

function openAgendaKey(): string | undefined {
  return process.env.OPENAGENDA_PUBLIC_KEY
    ?? process.env.OPENAGENDA_API_KEY
    ?? process.env.OPENAGENDA_KEY;
}

function extractArray<T>(value: unknown, keys: string[]): T[] {
  if (Array.isArray(value)) return value as T[];
  const obj = objectOf(value);
  if (!obj) return [];

  for (const key of keys) {
    const nested = obj[key];
    if (Array.isArray(nested)) return nested as T[];
  }

  return [];
}

function textOf(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  const obj = objectOf(value);
  if (!obj) return undefined;
  for (const key of ['fr', 'en', 'value', 'html']) {
    const candidate = obj[key];
    if (typeof candidate === 'string' && candidate.trim()) return stripHtml(candidate.trim());
  }
  for (const candidate of Object.values(obj)) {
    if (typeof candidate === 'string' && candidate.trim()) return stripHtml(candidate.trim());
  }
  return undefined;
}

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberOf(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function objectOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function addDistance(event: LocalEventItem, lat?: number, lng?: number): LocalEventItem {
  if (lat === undefined || lng === undefined || event.latitude === undefined || event.longitude === undefined) {
    return event;
  }

  return {
    ...event,
    distanceKm: Math.round(distanceKm(lat, lng, event.latitude, event.longitude) * 10) / 10,
  };
}

function withinRadius(event: LocalEventItem, query: LocalEventSearchQuery): boolean {
  if (query.lat === undefined || query.lng === undefined || query.radius === undefined) return true;
  if (event.distanceKm === undefined) return true;
  return event.distanceKm <= query.radius;
}

function compareEvents(a: LocalEventItem, b: LocalEventItem): number {
  const dateA = parseDate(a.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const dateB = parseDate(b.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (dateA !== dateB) return dateA - dateB;
  return (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999);
}

function dedupeEvents(events: LocalEventItem[]): LocalEventItem[] {
  const seen = new Set<string>();
  const result: LocalEventItem[] = [];
  for (const event of events) {
    const key = normalize(`${event.title}:${event.startDate}:${event.city}`);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(event);
  }
  return result;
}

function boundingBoxForTarget(target: LocalEventTarget) {
  if (target.latitude === undefined || target.longitude === undefined) return undefined;
  return boundingBox(target.latitude, target.longitude, target.radiusKm);
}

function boundingBox(lat: number, lng: number, radiusKm: number) {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
  return {
    north: roundCoord(lat + latDelta),
    south: roundCoord(lat - latDelta),
    east: roundCoord(lng + lngDelta),
    west: roundCoord(lng - lngDelta),
  };
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2))
    * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function roundCoord(value: number): number {
  return Math.round(value * 100000) / 100000;
}

function rankTarget(type: TargetType): number {
  switch (type) {
    case 'city': return 0;
    case 'metropole': return 1;
    case 'department': return 2;
    case 'region': return 3;
    case 'event': return 4;
  }
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugify(value: string): string {
  return normalize(value).replace(/\s+/g, '-').slice(0, 120) || 'event';
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatIcsDateTime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

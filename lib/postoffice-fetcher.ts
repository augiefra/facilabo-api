import {
  calculateDistance,
  InMemoryTTLCache,
  normalizeCity,
  UpstreamServiceError,
} from './service-search-utils';

const POST_OFFICE_API_URL = 'https://datanova.laposte.fr/data-fair/api/v1/datasets/laposte-poincont2/lines';
const POST_OFFICE_SOURCE = 'DataNova La Poste - laposte-poincont2';
const POST_OFFICE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface PostOfficeApiRecord {
  identifiant_a?: string;
  libelle_du_site?: string;
  adresse?: string;
  code_postal?: string;
  localite?: string;
  numero_de_telephone?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  _geopoint?: string;
  caracteristique_du_site?: string;
}

interface PostOfficeApiResponse {
  total: number;
  next?: string;
  results: PostOfficeApiRecord[];
}

export interface PostOfficeServiceItem {
  id: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  siteType: string;
  distance?: number;
}

const postOfficeCache = new InMemoryTTLCache<PostOfficeServiceItem[]>(POST_OFFICE_CACHE_TTL_MS);
const allPostOfficesCache = new InMemoryTTLCache<PostOfficeServiceItem[]>(POST_OFFICE_CACHE_TTL_MS);

function parseCoordinate(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

function parseGeoPoint(value: string | undefined): { lat: number; lon: number } | null {
  if (!value) {
    return null;
  }

  const [latRaw, lonRaw] = value.split(',');
  const lat = Number.parseFloat(latRaw ?? '');
  const lon = Number.parseFloat(lonRaw ?? '');

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return null;
  }

  return { lat, lon };
}

function recordToPostOffice(record: PostOfficeApiRecord): PostOfficeServiceItem {
  const geopoint = parseGeoPoint(record._geopoint);
  const latitude = parseCoordinate(record.latitude) ?? geopoint?.lat ?? null;
  const longitude = parseCoordinate(record.longitude) ?? geopoint?.lon ?? null;

  return {
    id: record.identifiant_a ?? `${record.code_postal ?? '00000'}-${record.libelle_du_site ?? 'site'}`,
    name: record.libelle_du_site ?? 'Point La Poste',
    address: record.adresse ?? 'Adresse non disponible',
    postalCode: record.code_postal ?? '',
    city: record.localite ?? '',
    phone: record.numero_de_telephone ?? null,
    latitude,
    longitude,
    siteType: record.caracteristique_du_site ?? 'Point de contact',
  };
}

function buildFilter(field: 'code_postal' | 'localite', value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${field}:"${escaped}"`;
}

async function fetchPostOfficesPage(url: string): Promise<PostOfficeApiResponse> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'FacilAbo-API/1.0',
    },
  });

  if (!response.ok) {
    throw new UpstreamServiceError(
      `Post offices upstream failed with HTTP ${response.status}`,
      {
        status: response.status,
        upstream: 'datanova.laposte.fr',
      },
    );
  }

  return response.json();
}

async function fetchFilteredPostOffices(url: string): Promise<PostOfficeServiceItem[]> {
  const payload = await fetchPostOfficesPage(url);
  return payload.results.map(recordToPostOffice);
}

async function fetchAllPostOffices(): Promise<PostOfficeServiceItem[]> {
  const cached = allPostOfficesCache.get('all_post_offices');
  if (cached) {
    return cached;
  }

  const all: PostOfficeServiceItem[] = [];
  let nextUrl: string | undefined = `${POST_OFFICE_API_URL}?size=1000`;
  let page = 0;

  while (nextUrl && page < 30) {
    const payload = await fetchPostOfficesPage(nextUrl);
    all.push(...payload.results.map(recordToPostOffice));
    nextUrl = payload.next;
    page += 1;
  }

  allPostOfficesCache.set('all_post_offices', all);
  return all;
}

function rankByDistance(items: PostOfficeServiceItem[], lat: number, lng: number, radiusKm: number, limit: number): PostOfficeServiceItem[] {
  const radiusMeters = radiusKm * 1000;

  return items
    .filter((item) => item.latitude !== null && item.longitude !== null)
    .map((item) => {
      const distance = calculateDistance(lat, lng, item.latitude as number, item.longitude as number);
      return {
        ...item,
        distance,
      };
    })
    .filter((item) => (item.distance ?? Number.MAX_SAFE_INTEGER) <= radiusMeters)
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
    .slice(0, limit);
}

export function getPostOfficeStale(cacheKey: string): PostOfficeServiceItem[] | null {
  return postOfficeCache.getStale(cacheKey);
}

export function postOfficeSourceName(): string {
  return POST_OFFICE_SOURCE;
}

export async function searchPostOfficesByPostalCode(postalCode: string, limit: number, cacheKey: string): Promise<PostOfficeServiceItem[]> {
  const cached = postOfficeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const query = encodeURIComponent(buildFilter('code_postal', postalCode));
  const url = `${POST_OFFICE_API_URL}?qs=${query}&size=${Math.min(limit, 100)}`;

  const results = await fetchFilteredPostOffices(url);
  postOfficeCache.set(cacheKey, results.slice(0, limit));
  return results.slice(0, limit);
}

export async function searchPostOfficesByCity(city: string, limit: number, cacheKey: string): Promise<PostOfficeServiceItem[]> {
  const cached = postOfficeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const query = encodeURIComponent(buildFilter('localite', city.toUpperCase()));
  const url = `${POST_OFFICE_API_URL}?qs=${query}&size=${Math.min(limit, 150)}`;

  const results = await fetchFilteredPostOffices(url)
    .then((items) => {
      const normalizedQuery = normalizeCity(city);
      return items.filter((item) => normalizeCity(item.city) === normalizedQuery).slice(0, limit);
    });

  postOfficeCache.set(cacheKey, results);
  return results;
}

export async function searchPostOfficesNearLocation(
  lat: number,
  lng: number,
  radiusKm: number,
  limit: number,
  cacheKey: string,
): Promise<PostOfficeServiceItem[]> {
  const cached = postOfficeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const allPostOffices = await fetchAllPostOffices();
  const results = rankByDistance(allPostOffices, lat, lng, radiusKm, limit);

  postOfficeCache.set(cacheKey, results);
  return results;
}

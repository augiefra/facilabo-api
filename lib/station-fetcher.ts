import {
  calculateDistance,
  InMemoryTTLCache,
  UpstreamServiceError,
} from './service-search-utils';

const STATIONS_API_URL = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records';
const STATION_SOURCE = 'Ministère de l\'Économie - prix des carburants';
const STATION_CACHE_TTL_MS = 30 * 60 * 1000;

interface StationApiRecord {
  id: number | string;
  cp?: string;
  ville?: string;
  adresse?: string;
  geom?: { lat?: number; lon?: number };
  latitude?: number | string | null;
  longitude?: number | string | null;
  services_service?: string[];
  carburants_disponibles?: string[];
  carburants_indisponibles?: string[];
  horaires_automate_24_24?: string | null;
  [key: string]: unknown;
}

interface StationApiResponse {
  total_count: number;
  results: StationApiRecord[];
}

export interface StationFuelPrice {
  fuel: string;
  price: number | null;
  updatedAt: string | null;
  available: boolean;
}

export interface StationServiceItem {
  id: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  distance?: number;
  fuels: StationFuelPrice[];
  services: string[];
  open24h: boolean;
}

const stationCache = new InMemoryTTLCache<StationServiceItem[]>(STATION_CACHE_TTL_MS);

const FUEL_FIELDS = [
  { label: 'Gazole', key: 'gazole' },
  { label: 'SP95', key: 'sp95' },
  { label: 'E10', key: 'e10' },
  { label: 'SP98', key: 'sp98' },
  { label: 'E85', key: 'e85' },
  { label: 'GPLc', key: 'gplc' },
] as const;

function parseCoordinate(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (Number.isNaN(parsed)) {
    return null;
  }

  // Some records expose coordinates multiplied by 100000.
  if (Math.abs(parsed) > 180) {
    return parsed / 100000;
  }

  return parsed;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((entry): entry is string => typeof entry === 'string');
      }

      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { service?: string[] }).service)) {
        return (parsed as { service: string[] }).service;
      }
    } catch {
      return [];
    }
  }

  return [];
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

function buildFuels(record: StationApiRecord): StationFuelPrice[] {
  const explicitAvailable = new Set(parseStringArray(record.carburants_disponibles));
  const explicitUnavailable = new Set(parseStringArray(record.carburants_indisponibles));

  const fuels: StationFuelPrice[] = [];

  for (const fuelField of FUEL_FIELDS) {
    const price = toNumber(record[`${fuelField.key}_prix`]);
    const updatedAtValue = record[`${fuelField.key}_maj`];
    const updatedAt = typeof updatedAtValue === 'string' ? updatedAtValue : null;
    const ruptureType = String(record[`${fuelField.key}_rupture_type`] ?? '').trim();

    const available = ruptureType.length > 0
      ? false
      : explicitUnavailable.has(fuelField.label)
        ? false
        : explicitAvailable.has(fuelField.label)
          ? true
          : price !== null;

    const shouldExpose =
      price !== null ||
      explicitAvailable.has(fuelField.label) ||
      explicitUnavailable.has(fuelField.label) ||
      ruptureType.length > 0;

    if (!shouldExpose) {
      continue;
    }

    fuels.push({
      fuel: fuelField.label,
      price,
      updatedAt,
      available,
    });
  }

  return fuels;
}

function recordToStation(record: StationApiRecord): StationServiceItem {
  const lat = record.geom?.lat ?? parseCoordinate(record.latitude);
  const lng = record.geom?.lon ?? parseCoordinate(record.longitude);

  const stationId = String(record.id);
  const postalCode = (record.cp ?? '').trim();
  const city = (record.ville ?? '').trim();
  const locality = [postalCode, city].filter((part) => part.length > 0).join(' ');
  const readableName = locality.length > 0
    ? `Station-service ${locality}`
    : 'Station-service';

  return {
    id: stationId,
    name: readableName,
    address: record.adresse ?? 'Adresse non disponible',
    postalCode,
    city,
    phone: null,
    latitude: lat ?? null,
    longitude: lng ?? null,
    fuels: buildFuels(record),
    services: parseStringArray(record.services_service),
    open24h: String(record.horaires_automate_24_24 ?? '').toLowerCase() === 'oui',
  };
}

function escapeOdsString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function fetchStations(
  where: string,
  limit: number,
  options: { orderBy?: string } = {},
): Promise<StationServiceItem[]> {
  const params = new URLSearchParams({
    where,
    limit: String(Math.min(Math.max(limit, 1), 100)),
  });

  if (options.orderBy) {
    params.set('order_by', options.orderBy);
  }

  const url = `${STATIONS_API_URL}?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'FacilAbo-API/1.0',
    },
  });

  if (!response.ok) {
    throw new UpstreamServiceError(
      `Stations upstream failed with HTTP ${response.status}`,
      {
        status: response.status,
        upstream: 'data.economie.gouv.fr',
      },
    );
  }

  const payload: StationApiResponse = await response.json();
  return payload.results.map(recordToStation);
}

function assignGeoDistance(items: StationServiceItem[], lat: number, lng: number): StationServiceItem[] {
  return items
    .filter((item) => item.latitude !== null && item.longitude !== null)
    .map((item) => ({
      ...item,
      distance: calculateDistance(lat, lng, item.latitude as number, item.longitude as number),
    }))
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
}

export function getStationStale(cacheKey: string): StationServiceItem[] | null {
  return stationCache.getStale(cacheKey);
}

export function stationSourceName(): string {
  return STATION_SOURCE;
}

export async function searchStationsByPostalCode(postalCode: string, limit: number, cacheKey: string): Promise<StationServiceItem[]> {
  const cached = stationCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const where = `cp="${escapeOdsString(postalCode)}"`;
  const stations = await fetchStations(where, limit);
  stationCache.set(cacheKey, stations);
  return stations;
}

export async function searchStationsByCity(city: string, limit: number, cacheKey: string): Promise<StationServiceItem[]> {
  const cached = stationCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const escapedCity = escapeOdsString(city);
  const where = `lower(ville)=lower("${escapedCity}")`;
  const filtered = await fetchStations(where, limit);

  stationCache.set(cacheKey, filtered);
  return filtered;
}

export async function searchStationsNearLocation(
  lat: number,
  lng: number,
  radiusKm: number,
  limit: number,
  cacheKey: string,
): Promise<StationServiceItem[]> {
  const cached = stationCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const radiusMeters = Math.max(500, Math.round(radiusKm * 1000));
  const orderBy = `distance(geom, geom'POINT(${lng} ${lat})')`;
  const candidates = await fetchStations('cp is not null', Math.min(limit * 4, 100), { orderBy });
  const withDistance = assignGeoDistance(candidates, lat, lng)
    .filter((item) => (item.distance ?? Number.POSITIVE_INFINITY) <= radiusMeters)
    .slice(0, limit);

  stationCache.set(cacheKey, withDistance);
  return withDistance;
}

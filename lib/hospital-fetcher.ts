import {
  calculateDistance,
  InMemoryTTLCache,
  normalizeCity,
  UpstreamServiceError,
} from './service-search-utils';

const FINESS_API_URL = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/healthref-france-finess/records';
const HOSPITAL_SOURCE = 'FINESS - public.opendatasoft.com';
const HOSPITAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const HOSPITAL_CATEGORY_CODES = [101, 106, 292, 355];

interface FinessHospitalRecord {
  nofinesset: string;
  rs?: string;
  rslongue?: string;
  numvoie?: number;
  typvoie?: string;
  voie?: string;
  compvoie?: string;
  address?: string;
  ligneacheminement?: string;
  com_code?: string;
  com_name?: string;
  telephone?: string;
  coord?: {
    lon?: number;
    lat?: number;
  };
  categetab?: number;
  libcategetab?: string;
}

interface FinessHospitalResponse {
  total_count: number;
  results: FinessHospitalRecord[];
}

export interface HospitalServiceItem {
  id: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  finess: string;
  categoryCode: number | null;
  categoryLabel: string | null;
  distance?: number;
}

const hospitalCache = new InMemoryTTLCache<HospitalServiceItem[]>(HOSPITAL_CACHE_TTL_MS);

function escapeOdsString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function hospitalCategoriesWhereClause(): string {
  return `categetab in (${HOSPITAL_CATEGORY_CODES.join(',')})`;
}

function recordToHospital(record: FinessHospitalRecord): HospitalServiceItem {
  const postalMatch = record.ligneacheminement?.match(/^(\d{5})/);
  const postalCode = postalMatch ? postalMatch[1] : record.com_code?.substring(0, 5) ?? '';

  let address = record.address ?? '';
  if (!address && record.voie) {
    const pieces = [record.numvoie, record.typvoie, record.voie, record.compvoie].filter(Boolean);
    address = pieces.join(' ');
  }

  const city = record.com_name ?? record.ligneacheminement?.replace(/^\d{5}\s*/, '') ?? '';

  return {
    id: record.nofinesset,
    name: record.rs ?? record.rslongue ?? 'Hôpital',
    address: address || 'Adresse non disponible',
    postalCode,
    city,
    phone: record.telephone ?? null,
    latitude: record.coord?.lat ?? null,
    longitude: record.coord?.lon ?? null,
    finess: record.nofinesset,
    categoryCode: record.categetab ?? null,
    categoryLabel: record.libcategetab ?? null,
  };
}

async function fetchHospitals(whereSuffix: string, limit: number): Promise<HospitalServiceItem[]> {
  const where = whereSuffix.length > 0
    ? `${hospitalCategoriesWhereClause()} AND ${whereSuffix}`
    : hospitalCategoriesWhereClause();

  const url = `${FINESS_API_URL}?where=${encodeURIComponent(where)}&limit=${Math.min(Math.max(limit, 1), 100)}`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'FacilAbo-API/1.0',
    },
  });

  if (!response.ok) {
    throw new UpstreamServiceError(
      `Hospitals upstream failed with HTTP ${response.status}`,
      {
        status: response.status,
        upstream: 'public.opendatasoft.com',
      },
    );
  }

  const payload: FinessHospitalResponse = await response.json();
  return payload.results.map(recordToHospital);
}

function withGeoDistance(items: HospitalServiceItem[], lat: number, lng: number, limit: number): HospitalServiceItem[] {
  return items
    .filter((item) => item.latitude !== null && item.longitude !== null)
    .map((item) => ({
      ...item,
      distance: calculateDistance(lat, lng, item.latitude as number, item.longitude as number),
    }))
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
    .slice(0, limit);
}

export function getHospitalStale(cacheKey: string): HospitalServiceItem[] | null {
  return hospitalCache.getStale(cacheKey);
}

export function hospitalSourceName(): string {
  return HOSPITAL_SOURCE;
}

export async function searchHospitalsByPostalCode(postalCode: string, limit: number, cacheKey: string): Promise<HospitalServiceItem[]> {
  const cached = hospitalCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const where = `startswith(ligneacheminement, "${escapeOdsString(postalCode)}")`;
  const hospitals = await fetchHospitals(where, limit);
  hospitalCache.set(cacheKey, hospitals);
  return hospitals;
}

export async function searchHospitalsByCity(city: string, limit: number, cacheKey: string): Promise<HospitalServiceItem[]> {
  const cached = hospitalCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const normalizedQuery = normalizeCity(city);

  // FINESS city match is case-sensitive, so we query wider and filter locally.
  const hospitals = await fetchHospitals('com_name is not null', 100);
  const filtered = hospitals
    .filter((hospital) => normalizeCity(hospital.city) === normalizedQuery)
    .slice(0, limit);

  hospitalCache.set(cacheKey, filtered);
  return filtered;
}

export async function searchHospitalsNearLocation(
  lat: number,
  lng: number,
  radiusKm: number,
  limit: number,
  cacheKey: string,
): Promise<HospitalServiceItem[]> {
  const cached = hospitalCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const radiusMeters = Math.max(500, Math.round(radiusKm * 1000));
  const where = `within_distance(coord, GEOM'POINT(${lng} ${lat})', ${radiusMeters}m)`;
  const hospitals = await fetchHospitals(where, Math.min(limit * 4, 100));
  const ranked = withGeoDistance(hospitals, lat, lng, limit);

  hospitalCache.set(cacheKey, ranked);
  return ranked;
}

import { Pharmacy, getPharmacyCached, setPharmacyCache } from './pharmacy-types';
import { calculateDistance, normalizeCity, UpstreamServiceError } from './service-search-utils';

// API endpoint for France-wide FINESS pharmacy data
const FINESS_API_URL = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/healthref-france-finess/records';

// Category code for pharmacies in FINESS
const PHARMACY_CATEGORY = 620;

interface FinessApiRecord {
  nofinesset: string;
  rs: string;
  rslongue?: string;
  numvoie?: number;
  typvoie?: string;
  voie?: string;
  compvoie?: string;
  address?: string;
  ligneacheminement?: string;
  com_code?: string;
  com_name?: string;
  dep_code?: string;
  dep_name?: string;
  reg_name?: string;
  telephone?: string;
  telecopie?: string;
  coord?: {
    lon: number;
    lat: number;
  };
  categetab?: number;
  libcategetab?: string;
}

interface FinessApiResponse {
  total_count: number;
  results: FinessApiRecord[];
}

/**
 * Convert FINESS record to Pharmacy object
 */
function recordToPharmacy(record: FinessApiRecord): Pharmacy {
  // Parse postal code from ligneacheminement (e.g., "59187 DECHY")
  const postalMatch = record.ligneacheminement?.match(/^(\d{5})/);
  const postalCode = postalMatch ? postalMatch[1] : record.com_code?.substring(0, 5) || '';

  // Build address
  let address = record.address || '';
  if (!address && record.voie) {
    const parts = [record.numvoie, record.typvoie, record.voie, record.compvoie].filter(Boolean);
    address = parts.join(' ');
  }

  // City name
  const city = record.com_name || record.ligneacheminement?.replace(/^\d{5}\s*/, '') || '';

  return {
    id: record.nofinesset,
    name: formatPharmacyName(record.rs || record.rslongue || 'Pharmacie'),
    address: address || 'Adresse non disponible',
    postalCode,
    city,
    phone: record.telephone || null,
    latitude: record.coord?.lat || null,
    longitude: record.coord?.lon || null,
    finess: record.nofinesset,
    distance: undefined,
  };
}

/**
 * Format pharmacy name (remove SELARL, SARL, etc. prefixes)
 */
function formatPharmacyName(name: string): string {
  return name
    .replace(/^(SELARL|SARL|SNC|EURL|SAS)\s+/i, '')
    .replace(/^PHARMACIE\s+/i, 'Pharmacie ')
    .trim();
}

/**
 * Fetch pharmacies from FINESS open data
 */
async function fetchFinessPharmacies(params: {
  where?: string;
  limit?: number;
  geoFilter?: { lat: number; lon: number; distance: number };
}): Promise<Pharmacy[]> {
  // Build query parameters manually for proper encoding
  const queryParts: string[] = [`limit=${params.limit || 100}`];

  // Always filter for pharmacies only
  let whereClause = `categetab=${PHARMACY_CATEGORY}`;

  if (params.where) {
    whereClause += ` AND ${params.where}`;
  }

  // Add geo filter if provided (for location-based search)
  if (params.geoFilter) {
    const { lat, lon, distance } = params.geoFilter;
    whereClause += ` AND within_distance(coord, GEOM'POINT(${lon} ${lat})', ${distance}m)`;
  }

  // Encode the where clause properly
  queryParts.push(`where=${encodeURIComponent(whereClause)}`);

  const url = `${FINESS_API_URL}?${queryParts.join('&')}`;

  console.log('FINESS API URL:', url);

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'FacilAbo-API/1.0',
    },
  });

  if (!response.ok) {
    throw new UpstreamServiceError(
      `Pharmacies upstream failed with HTTP ${response.status}`,
      {
        status: response.status,
        upstream: 'public.opendatasoft.com',
      },
    );
  }

  const data: FinessApiResponse = await response.json();

  return data.results.map(recordToPharmacy);
}

/**
 * Search pharmacies by postal code (all of France)
 */
export async function searchByPostalCode(postalCode: string, limit: number = 100): Promise<Pharmacy[]> {
  const cacheKey = `postal_${postalCode}_${limit}`;
  const cached = getPharmacyCached(cacheKey);
  if (cached) return cached;

  // Search by postal code using startswith function (cleaner than LIKE)
  // API limit is 100, but most postal codes have fewer pharmacies
  const pharmacies = await fetchFinessPharmacies({
    where: `startswith(ligneacheminement, "${postalCode}")`,
    limit,
  });

  setPharmacyCache(cacheKey, pharmacies);
  return pharmacies;
}

/**
 * Search pharmacies by city name (all of France)
 */
export async function searchByCity(city: string, limit: number = 100): Promise<Pharmacy[]> {
  const normalizedCity = normalizeCity(city);
  const cacheKey = `city_${normalizedCity}_${limit}`;
  const cached = getPharmacyCached(cacheKey);
  if (cached) return cached;

  // Capitalize city name for matching (French cities are capitalized)
  const capitalizedCity = city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();

  // Search by exact city name match (case-sensitive in API)
  // API limit is 100, may not return all for large cities
  const pharmacies = await fetchFinessPharmacies({
    where: `com_name="${capitalizedCity}"`,
    limit,
  });

  setPharmacyCache(cacheKey, pharmacies);
  return pharmacies;
}

/**
 * Search pharmacies near coordinates (all of France)
 */
export async function searchNearLocation(
  lat: number,
  lng: number,
  radiusKm: number = 5,
  limit: number = 100,
): Promise<Pharmacy[]> {
  const cacheKey = `loc_${lat.toFixed(3)}_${lng.toFixed(3)}_${radiusKm}_${limit}`;
  const cached = getPharmacyCached(cacheKey);
  if (cached) return cached;

  const radiusMeters = radiusKm * 1000;

  // Use geo filter to find pharmacies within radius
  const pharmacies = await fetchFinessPharmacies({
    geoFilter: { lat, lon: lng, distance: radiusMeters },
    limit,
  });

  // Calculate and add distances
  const withDistances = pharmacies
    .filter((p) => p.latitude !== null && p.longitude !== null)
    .map((p) => ({
      ...p,
      distance: calculateDistance(lat, lng, p.latitude!, p.longitude!),
    }))
    .sort((a, b) => (a.distance || 0) - (b.distance || 0));

  setPharmacyCache(cacheKey, withDistances);
  return withDistances;
}

/**
 * Get all pharmacies for a department (all of France)
 * Note: Limited to 100 results per API constraints
 */
export async function getPharmaciesByDepartment(deptCode: string, limit: number = 100): Promise<Pharmacy[]> {
  const cacheKey = `dept_${deptCode}_${limit}`;
  const cached = getPharmacyCached(cacheKey);
  if (cached) return cached;

  // Filter by department code (limited to 100 results)
  const pharmacies = await fetchFinessPharmacies({
    where: `dep_code="${deptCode}"`,
    limit,
  });

  setPharmacyCache(cacheKey, pharmacies);
  return pharmacies;
}

/**
 * Search pharmacies by region name
 * Note: Limited to 100 results per API constraints
 */
export async function searchByRegion(regionName: string, limit: number = 100): Promise<Pharmacy[]> {
  const cacheKey = `region_${regionName.toLowerCase()}_${limit}`;
  const cached = getPharmacyCached(cacheKey);
  if (cached) return cached;

  const pharmacies = await fetchFinessPharmacies({
    where: `reg_name="${regionName}"`,
    limit,
  });

  setPharmacyCache(cacheKey, pharmacies);
  return pharmacies;
}

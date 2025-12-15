// Types for Pharmacy API

export interface Pharmacy {
  id: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  finess: string; // FINESS establishment number
  distance?: number; // in meters, if location search
}

export interface PharmacySearchResponse {
  pharmacies: Pharmacy[];
  total: number;
  query: {
    postalCode?: string;
    city?: string;
    lat?: number;
    lng?: number;
    radius?: number;
  };
  gardeInfo: {
    message: string;
    url: string;
  };
  lastUpdated: string;
  source: string;
}

// Cache for pharmacy data
interface PharmacyCacheEntry {
  data: Pharmacy[];
  timestamp: number;
}

const pharmacyCache: Map<string, PharmacyCacheEntry> = new Map();
const PHARMACY_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours (pharmacy data doesn't change often)

export function getPharmacyCached(key: string): Pharmacy[] | null {
  const entry = pharmacyCache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > PHARMACY_CACHE_TTL) {
    pharmacyCache.delete(key);
    return null;
  }

  return entry.data;
}

export function setPharmacyCache(key: string, data: Pharmacy[]): void {
  pharmacyCache.set(key, { data, timestamp: Date.now() });
}

// Calculate distance between two coordinates using Haversine formula
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

// Normalize city name for comparison
export function normalizeCity(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/-/g, ' ')
    .trim();
}

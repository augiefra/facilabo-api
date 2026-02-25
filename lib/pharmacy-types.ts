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
    limit?: number;
  };
  gardeInfo: {
    message: string;
    url: string;
  };
  contractVersion?: string;
  limit?: number;
  lastUpdated: string;
  source: string;
  note?: string;
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

// Return cached data even if expired (anti-panne fallback)
export function getPharmacyStale(key: string): Pharmacy[] | null {
  const entry = pharmacyCache.get(key);
  return entry?.data ?? null;
}

export function setPharmacyCache(key: string, data: Pharmacy[]): void {
  pharmacyCache.set(key, { data, timestamp: Date.now() });
}

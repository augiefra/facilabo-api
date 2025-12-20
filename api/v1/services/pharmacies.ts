/**
 * FacilAbo API v1 - Pharmacy Search
 *
 * Search pharmacies in France using the FINESS database
 * via OpenDataSoft.
 *
 * @endpoint GET /api/v1/services/pharmacies
 * @query cp - Postal code (e.g., "75001")
 * @query city - City name (e.g., "Paris")
 * @query lat, lng, radius - Coordinates search
 *
 * @source FINESS via public.opendatasoft.com
 * @reliability HIGH - Official government data
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PharmacySearchResponse } from '../../../lib/pharmacy-types';
import {
  searchByPostalCode,
  searchByCity,
  searchNearLocation,
} from '../../../lib/pharmacy-fetcher';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Only GET requests are supported',
    });
  }

  try {
    const { cp, city, lat, lng, radius } = req.query;

    // Validate that at least one search parameter is provided
    if (!cp && !city && (!lat || !lng)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Provide at least one search parameter: cp (postal code), city, or lat+lng coordinates',
        examples: [
          '/api/v1/services/pharmacies?cp=75001',
          '/api/v1/services/pharmacies?city=Paris',
          '/api/v1/services/pharmacies?lat=48.8566&lng=2.3522&radius=3',
        ],
      });
    }

    let pharmacies: PharmacySearchResponse['pharmacies'] = [];
    const query: PharmacySearchResponse['query'] = {};

    // Search by postal code
    if (cp && typeof cp === 'string') {
      query.postalCode = cp;
      pharmacies = await searchByPostalCode(cp);
    }
    // Search by city
    else if (city && typeof city === 'string') {
      query.city = city;
      pharmacies = await searchByCity(city);
    }
    // Search by coordinates
    else if (lat && lng) {
      const latitude = parseFloat(lat as string);
      const longitude = parseFloat(lng as string);
      const radiusKm = radius ? parseFloat(radius as string) : 5;

      if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'lat and lng must be valid numbers',
        });
      }

      query.lat = latitude;
      query.lng = longitude;
      query.radius = radiusKm;

      pharmacies = await searchNearLocation(latitude, longitude, radiusKm);
    } else {
      pharmacies = [];
    }

    // Return iOS-compatible format
    const response: PharmacySearchResponse = {
      pharmacies,
      total: pharmacies.length,
      query,
      gardeInfo: {
        message: "Pour les pharmacies de garde, appelez le 3237 ou consultez le site officiel",
        url: "https://www.3237.fr",
      },
      lastUpdated: new Date().toISOString(),
      source: 'FINESS - public.opendatasoft.com',
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('Pharmacy search error:', error);

    return res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to search pharmacies',
    });
  }
}

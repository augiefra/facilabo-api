export const SERVICE_CONTRACT_VERSION = '2026-02-24.services-v1';

export interface ServiceSearchQuery {
  postalCode?: string;
  city?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  limit?: number;
}

export interface ServiceErrorPayload {
  error: string;
  message: string;
  retryable: boolean;
  upstream?: string;
  contractVersion: string;
  examples?: string[];
}

export interface ServiceResponseBase {
  contractVersion: string;
  total: number;
  query: ServiceSearchQuery;
  lastUpdated: string;
  source: string;
  limit: number;
  note?: string;
}

import { createRetryLogger, fetchWithRetry, RETRY_CONFIGS } from './retry-utils';

const SOURCE_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'FacilAbo/1.0 (+https://www.facilabo.com)',
};

/** Fetch structured race data with retries; sport adapters validate their schema. */
export async function fetchRaceResultsJson<T>(url: string, sourceLabel: string): Promise<T> {
  const response = await fetchWithRetry(
    url,
    { headers: SOURCE_HEADERS },
    {
      ...RETRY_CONFIGS.stableApi,
      onRetry: createRetryLogger(`race-results:${sourceLabel}`),
    },
  );

  if (!response.ok) {
    throw new Error(`${sourceLabel} fetch failed: ${response.status}`);
  }

  try {
    return await response.json() as T;
  } catch {
    throw new Error(`${sourceLabel} returned invalid JSON`);
  }
}

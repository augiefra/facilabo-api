/**
 * Upstash Redis REST helper (fail-open).
 */

interface UpstashConfig {
  url: string;
  token: string;
}

function getConfig(): UpstashConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ''), token };
}

export function isUpstashConfigured(): boolean {
  return getConfig() !== null;
}

function normalizePipelineResponse(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload.map((item) => {
      if (item && typeof item === 'object' && 'result' in item) {
        return (item as { result: unknown }).result;
      }
      return item;
    });
  }

  if (payload && typeof payload === 'object') {
    const maybeResult = payload as { result?: unknown; results?: unknown };
    if (Array.isArray(maybeResult.result)) {
      return normalizePipelineResponse(maybeResult.result);
    }
    if (Array.isArray(maybeResult.results)) {
      return normalizePipelineResponse(maybeResult.results);
    }
  }

  return [];
}

export async function executeUpstashPipeline(commands: unknown[][]): Promise<unknown[] | null> {
  const config = getConfig();
  if (!config) return null;

  try {
    const response = await fetch(`${config.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    return normalizePipelineResponse(payload);
  } catch {
    return null;
  }
}

export async function executeUpstashCommand(command: unknown[]): Promise<unknown | null> {
  const results = await executeUpstashPipeline([command]);
  if (!results || results.length === 0) return null;
  return results[0];
}

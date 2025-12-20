/**
 * FacilAbo - Retry Utilities
 *
 * Provides robust retry mechanisms with exponential backoff
 * for unreliable external sources.
 *
 * @version 1.0.0
 */

/**
 * Options for retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in ms between retries (default: 10000) */
  maxDelay?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Timeout per request in ms (default: 10000) */
  timeout?: number;
  /** Whether to add jitter to delay (default: true) */
  jitter?: boolean;
  /** Custom function to determine if error is retryable */
  isRetryable?: (error: Error) => boolean;
  /** Callback on each retry attempt */
  onRetry?: (attempt: number, error: Error, nextDelay: number) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  timeout: 10000,
  jitter: true,
  isRetryable: () => true,
  onRetry: () => {},
};

/**
 * Calculate delay with optional jitter
 */
function calculateDelay(
  attempt: number,
  options: Required<RetryOptions>
): number {
  let delay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt);
  delay = Math.min(delay, options.maxDelay);

  if (options.jitter) {
    // Add random jitter between 0-25% of delay
    delay = delay * (1 + Math.random() * 0.25);
  }

  return Math.round(delay);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  userOptions: RetryOptions = {}
): Promise<T> {
  const options: Required<RetryOptions> = {
    ...DEFAULT_OPTIONS,
    ...userOptions,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      // Execute the function with timeout
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Request timeout after ${options.timeout}ms`)),
            options.timeout
          )
        ),
      ]);

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      const isLastAttempt = attempt === options.maxRetries;
      const shouldRetry = !isLastAttempt && options.isRetryable(lastError);

      if (!shouldRetry) {
        break;
      }

      // Calculate delay for next attempt
      const delay = calculateDelay(attempt, options);

      // Call onRetry callback
      options.onRetry(attempt + 1, lastError, delay);

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError || new Error('Unknown error during retry');
}

/**
 * Fetch with automatic retry
 */
export async function fetchWithRetry(
  url: string,
  fetchOptions: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const isRetryable = (error: Error): boolean => {
    // Network errors are retryable
    if (error.message.includes('fetch') || error.message.includes('network')) {
      return true;
    }
    // Timeout errors are retryable
    if (error.message.includes('timeout')) {
      return true;
    }
    // ECONNRESET, ETIMEDOUT, etc.
    if (error.message.includes('ECONNRESET') || error.message.includes('ETIMEDOUT')) {
      return true;
    }
    return false;
  };

  return withRetry(
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        retryOptions.timeout || DEFAULT_OPTIONS.timeout
      );

      try {
        const response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal,
        });

        // Treat 5xx as retryable
        if (response.status >= 500) {
          throw new Error(`Server error: ${response.status}`);
        }

        return response;
      } finally {
        clearTimeout(timeout);
      }
    },
    {
      ...retryOptions,
      isRetryable: retryOptions.isRetryable || isRetryable,
    }
  );
}

/**
 * Create a logger for retry events
 */
export function createRetryLogger(endpoint: string) {
  return (attempt: number, error: Error, nextDelay: number) => {
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        endpoint,
        message: `Retry attempt ${attempt}`,
        error: error.message,
        nextDelayMs: nextDelay,
      })
    );
  };
}

/**
 * Predefined retry configurations for different source types
 */
export const RETRY_CONFIGS = {
  /** For stable API sources (OpenDataSoft, Etalab) */
  stableApi: {
    maxRetries: 2,
    initialDelay: 500,
    maxDelay: 2000,
    timeout: 8000,
  } as RetryOptions,

  /** For web scrapers (footmercato, flashscore) */
  scraper: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 5000,
    timeout: 15000,
  } as RetryOptions,

  /** For calendar ICS sources */
  calendar: {
    maxRetries: 2,
    initialDelay: 500,
    maxDelay: 3000,
    timeout: 10000,
  } as RetryOptions,

  /** For critical sources - more aggressive retry */
  critical: {
    maxRetries: 4,
    initialDelay: 500,
    maxDelay: 8000,
    timeout: 20000,
  } as RetryOptions,
} as const;

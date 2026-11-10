/**
 * Sync reliability utilities — timeout wrapper, retry with backoff.
 *
 * Addresses issue #6 sub-items 3 and 4:
 *  - Supabase call timeouts: wraps calls with a configurable timeout
 *  - Offline retry with backoff: retries failed saves with exponential backoff
 */

// ────────────────────────────────────────────────────────────
// Timeout wrapper (sub-item 4)
// ────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 15_000;

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Wraps a promise with a timeout. Rejects with TimeoutError if the
 * promise doesn't settle within `ms` milliseconds.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// ────────────────────────────────────────────────────────────
// Retry with exponential backoff (sub-item 3)
// ────────────────────────────────────────────────────────────

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
  timeoutMs: DEFAULT_TIMEOUT_MS,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries an async operation with exponential backoff.
 * Each attempt is wrapped with a timeout.
 * Returns the result on success, or throws after exhausting all retries.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const { maxAttempts, initialDelayMs, maxDelayMs, timeoutMs } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (err) {
      lastError = err;

      if (attempt === maxAttempts) break;

      // Exponential backoff: 1s, 2s, 4s, 8s, ... capped at maxDelayMs
      const delay = Math.min(
        initialDelayMs * Math.pow(2, attempt - 1),
        maxDelayMs
      );
      console.warn(
        `[sync-manager] Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms`,
        err instanceof Error ? err.message : err
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

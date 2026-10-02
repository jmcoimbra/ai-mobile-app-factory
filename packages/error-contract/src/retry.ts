import { AppError, toAppError } from './app-error.ts';

/** RFC 9110, section 9.2.2: PUT, DELETE and the safe methods are idempotent. */
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE', 'PUT', 'DELETE']);
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export function isIdempotent(method: string): boolean {
  return IDEMPOTENT_METHODS.has(method.toUpperCase());
}

/** Whether repeating the request could help. Says nothing about whether it is safe. */
export function isTransient(error: AppError): boolean {
  if (error.status === undefined) {
    return error.code === 'network.offline' || error.code === 'network.timeout';
  }
  return RETRYABLE_STATUS.has(error.status);
}

export interface RetryOptions {
  method: string;
  /** Total tries, the first one included. */
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Returns a number in [0, 1). Injected so tests are deterministic. */
  random?: () => number;
}

/**
 * Exponential backoff with full jitter: a random wait between zero and
 * base * 2^(attempt - 1), capped. A server-sent Retry-After wins when it is
 * longer.
 */
export function retryDelayMs(
  attempt: number,
  error: AppError,
  { baseDelayMs = 300, maxDelayMs = 5_000, random = Math.random }: Partial<RetryOptions> = {},
): number {
  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  const jittered = Math.floor(random() * ceiling);
  const requested = (error.retryAfterSeconds ?? 0) * 1000;
  return Math.max(jittered, requested);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run `operation`, repeating it only when the method is idempotent and the
 * failure is transient. A non-idempotent request runs exactly once.
 */
export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { method, maxAttempts = 3, sleep = defaultSleep } = options;
  const attempts = isIdempotent(method) ? maxAttempts : 1;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (thrown) {
      const error = toAppError(thrown);
      if (attempt >= attempts || !isTransient(error)) throw error;
      await sleep(retryDelayMs(attempt, error, options));
    }
  }
}

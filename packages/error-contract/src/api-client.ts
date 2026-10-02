import { appErrorFromResponse, toAppError, type ResponseLike } from './app-error.ts';
import { withRetry, type RetryOptions } from './retry.ts';

interface FetchResponse extends ResponseLike {
  ok: boolean;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<FetchResponse>;

export interface ApiClientOptions {
  baseUrl: string;
  fetch: FetchLike;
  timeoutMs?: number;
  retry?: Omit<RetryOptions, 'method'>;
}

export interface ApiClient {
  request<T>(method: string, path: string, body?: unknown): Promise<T>;
}

/**
 * The single way the app talks to an API. Every failure leaves here as an
 * AppError, and retries follow the idempotency rule in retry.ts.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const { baseUrl, fetch, timeoutMs = 10_000, retry } = options;

  async function send<T>(method: string, path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          accept: 'application/json, application/problem+json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw await appErrorFromResponse(response);
      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    } catch (thrown) {
      throw toAppError(thrown);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    request: <T>(method: string, path: string, body?: unknown) =>
      withRetry(() => send<T>(method, path, body), { ...retry, method }),
  };
}

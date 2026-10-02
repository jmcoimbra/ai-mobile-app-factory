import { codeForStatus, type ErrorCode } from './codes.ts';
import { PROBLEM_CONTENT_TYPE, parseProblem } from './problem.ts';

interface AppErrorInit {
  code: ErrorCode;
  /** HTTP status, when the failure came from a response. */
  status?: number;
  /** The problem `type` URI, when the response was problem details. */
  type?: string;
  /** Technical text for logs. Never rendered, and never sent to telemetry. */
  detail?: string;
  /** Seconds the server asked the client to wait, from `Retry-After`. */
  retryAfterSeconds?: number;
  cause?: unknown;
}

/**
 * The one error type the app handles. Screens read `code` and look the
 * message up in the catalog; they never read `detail`.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number | undefined;
  readonly type: string | undefined;
  readonly detail: string | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(init: AppErrorInit) {
    // The message is the code on purpose: it is safe to log anywhere.
    super(init.code, { cause: init.cause });
    this.name = 'AppError';
    this.code = init.code;
    this.status = init.status;
    this.type = init.type;
    this.detail = init.detail;
    this.retryAfterSeconds = init.retryAfterSeconds;
  }
}

/** What the API client needs from a fetch Response to build an AppError. */
export interface ResponseLike {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

function parseRetryAfter(value: string | null, now: () => number): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value.trim())) return Number(value.trim());
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - now()) / 1000));
}

/** Turn a failed HTTP response into an AppError. Never throws. */
export async function appErrorFromResponse(
  response: ResponseLike,
  now: () => number = Date.now,
): Promise<AppError> {
  const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'), now);
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.toLowerCase().startsWith(PROBLEM_CONTENT_TYPE)) {
    try {
      const problem = parseProblem(JSON.parse(await response.text()));
      if (problem) {
        return new AppError({
          code: problem.code ?? codeForStatus(response.status),
          status: response.status,
          type: problem.type,
          detail: problem.detail ?? problem.title,
          retryAfterSeconds,
        });
      }
    } catch {
      // A body that claims to be problem details and does not parse is
      // handled as any other unreadable body, below.
    }
  }

  return new AppError({
    code: codeForStatus(response.status),
    status: response.status,
    retryAfterSeconds,
  });
}

/** Turn anything thrown into an AppError. An AppError passes through. */
export function toAppError(thrown: unknown): AppError {
  if (thrown instanceof AppError) return thrown;
  if (thrown instanceof Error && thrown.name === 'AbortError') {
    return new AppError({ code: 'network.timeout', cause: thrown });
  }
  // fetch rejects with a TypeError when the request never got a response.
  if (thrown instanceof TypeError) {
    return new AppError({ code: 'network.offline', cause: thrown });
  }
  return new AppError({ code: 'unknown', cause: thrown });
}

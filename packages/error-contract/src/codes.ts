/**
 * Stable, machine-readable error codes. The API sends one in the `code`
 * member of a problem details body; the client assigns one when the failure
 * never reached the API. Adding a code means adding its user message in
 * messages.ts: the compiler and a test both refuse a code without one.
 */
export const ERROR_CODES = [
  'network.offline',
  'network.timeout',
  'request.invalid',
  'auth.required',
  'auth.forbidden',
  'resource.not_found',
  'resource.conflict',
  'rate.limited',
  'server.unavailable',
  'server.error',
  'checklist.task_not_found',
  'unknown',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}

/** The code for a response that carried no usable `code` of its own. */
export function codeForStatus(status: number): ErrorCode {
  if (status === 400 || status === 422) return 'request.invalid';
  if (status === 401) return 'auth.required';
  if (status === 403) return 'auth.forbidden';
  if (status === 404) return 'resource.not_found';
  if (status === 408) return 'network.timeout';
  if (status === 409) return 'resource.conflict';
  if (status === 429) return 'rate.limited';
  if (status === 502 || status === 503 || status === 504) return 'server.unavailable';
  if (status >= 500) return 'server.error';
  return 'unknown';
}

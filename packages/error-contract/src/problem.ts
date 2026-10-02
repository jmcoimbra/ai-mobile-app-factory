import { isErrorCode, type ErrorCode } from './codes.ts';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/**
 * RFC 9457 problem details, plus the one extension member this contract
 * adds: `code`.
 */
export interface ProblemDetails {
  type: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: ErrorCode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Read a decoded JSON body as problem details. Returns null when it is not
 * one. RFC 9457 makes every member optional and defaults `type` to
 * "about:blank", so the test for "is this a problem" is the object shape
 * plus at least one member the RFC defines.
 */
export function parseProblem(body: unknown): ProblemDetails | null {
  if (!isRecord(body)) return null;
  const known = ['type', 'title', 'status', 'detail', 'instance'];
  if (!known.some((member) => member in body)) return null;
  if ('type' in body && typeof body.type !== 'string') return null;
  if ('status' in body && typeof body.status !== 'number') return null;

  return {
    type: optionalString(body.type) ?? 'about:blank',
    title: optionalString(body.title),
    status: typeof body.status === 'number' ? body.status : undefined,
    detail: optionalString(body.detail),
    instance: optionalString(body.instance),
    code: isErrorCode(body.code) ? body.code : undefined,
  };
}

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
 * plus at least one member of the contract: the RFC's five or `code`. A
 * member of the wrong type makes the whole body fail the schema.
 */
export function parseProblem(body: unknown): ProblemDetails | null {
  if (!isRecord(body)) return null;
  const strings = ['type', 'title', 'detail', 'instance', 'code'];
  const known = [...strings, 'status'];
  if (!known.some((member) => member in body)) return null;
  for (const member of strings) {
    if (member in body && typeof body[member] !== 'string') return null;
  }
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

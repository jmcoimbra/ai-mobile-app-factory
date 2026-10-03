/**
 * The PII guard. It runs inside the port, before any adapter sees an event.
 *
 * The allowlist is the control. Redaction of free text is a second line of
 * defence: patterns catch e-mail addresses, phone numbers and long digit
 * runs, and miss names and addresses. That is why free text is not sent by
 * default.
 */

export type AttributeValue = string | number | boolean;
export type Attributes = Record<string, AttributeValue>;

/** Keys an event may carry. Add a key here on purpose, never in passing. */
export const DEFAULT_ALLOWED_KEYS: readonly string[] = [
  'app.flavor',
  'app.version',
  'app.build',
  'platform',
  'screen',
  'feature',
  'action',
  'result',
  'error.code',
  'error.type',
  'http.method',
  'http.status_code',
  'http.route',
  'retry.attempt',
  'duration_ms',
  'count',
];

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// A leading + or digit, then at least seven more digits with common separators.
const PHONE = /\+?\d[\d\s().-]{6,}\d/g;
const LONG_DIGITS = /\d{6,}/g;
const MAX_TEXT_LENGTH = 200;

export function redactText(text: string): string {
  return text
    .replace(EMAIL, '[email]')
    .replace(PHONE, '[number]')
    .replace(LONG_DIGITS, '[number]')
    .slice(0, MAX_TEXT_LENGTH);
}

/**
 * Keep the attributes whose key is on the allowlist and whose value is a
 * primitive. String values are redacted too, in case an allowed key is fed
 * something it should not carry.
 */
export function sanitizeAttributes(
  attributes: Record<string, unknown> | undefined,
  allowedKeys: readonly string[] = DEFAULT_ALLOWED_KEYS,
): Attributes {
  const clean: Attributes = {};
  if (!attributes) return clean;
  for (const [key, value] of Object.entries(attributes)) {
    if (!allowedKeys.includes(key)) continue;
    if (typeof value === 'string') clean[key] = redactText(value);
    else if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === 'boolean') clean[key] = value;
  }
  return clean;
}

/**
 * Keep the path from the last repository segment on. A path with no such
 * segment keeps its last two parts: an absolute path or a URL can carry a
 * user name or a query string.
 */
function shortFile(file: string): string {
  const fromSegment = /(?:^|\/)((?:node_modules|src|packages|apps)\/.*)$/.exec(file)?.[1];
  if (fromSegment) return fromSegment;
  const withoutQuery = file.replace(/[?#].*$/, '');
  return withoutQuery.split('/').filter(Boolean).slice(-2).join('/');
}

export interface StackFrame {
  function: string;
  file: string;
  line: number;
}

/**
 * Parse a stack trace into frames, dropping its first line. The first line
 * of `error.stack` repeats the error message, which is free text.
 */
export function stackFrames(stack: string | undefined, limit = 30): StackFrame[] {
  if (!stack) return [];
  const frames: StackFrame[] = [];
  for (const line of stack.split('\n')) {
    // V8 and Hermes: "    at fn (file:line:col)" or "    at file:line:col".
    const match = /^\s*at (?:(.+?) \()?(.+?):(\d+):\d+\)?$/.exec(line);
    if (!match) continue;
    frames.push({
      function: match[1] ?? '<anonymous>',
      file: shortFile(match[2] ?? ''),
      line: Number(match[3]),
    });
    if (frames.length >= limit) break;
  }
  return frames;
}

import {
  DEFAULT_ALLOWED_KEYS,
  redactText,
  sanitizeAttributes,
  stackFrames,
  type Attributes,
  type StackFrame,
} from './pii.ts';

/** An error, as adapters receive it. Already through the PII guard. */
export interface ErrorRecord {
  /** The class of the error: `AppError`, `TypeError`. */
  type: string;
  /** The contract's error code, when the error carried one. */
  code?: string;
  status?: number;
  frames: StackFrame[];
  /** Present only when `sendMessages` is on, and redacted. */
  message?: string;
  attributes: Attributes;
  sessionId: string;
  timeUnixMs: number;
}

export interface UsageEventRecord {
  name: string;
  attributes: Attributes;
  sessionId: string;
  timeUnixMs: number;
}

export interface SpanRecord {
  name: string;
  traceId: string;
  spanId: string;
  startUnixMs: number;
  endUnixMs: number;
  ok: boolean;
  attributes: Attributes;
  sessionId: string;
}

/** What a backend integration implements. It only ever sees clean records. */
export interface TelemetryAdapter {
  readonly name: string;
  captureError(record: ErrorRecord): void;
  trackEvent(record: UsageEventRecord): void;
  recordSpan(record: SpanRecord): void;
  flush?(): Promise<void>;
}

/** What the app calls. */
export interface Telemetry {
  readonly adapterNames: readonly string[];
  captureError(error: unknown, attributes?: Record<string, unknown>): void;
  trackEvent(name: string, attributes?: Record<string, unknown>): void;
  /** Time an operation. The span records failure when the operation throws. */
  withSpan<T>(
    name: string,
    operation: () => Promise<T>,
    attributes?: Record<string, unknown>,
  ): Promise<T>;
  flush(): Promise<void>;
}

export interface TelemetryOptions {
  adapters: readonly TelemetryAdapter[];
  allowedKeys?: readonly string[];
  /**
   * Send exception messages, redacted. Off by default: a message is free
   * text, and redaction by pattern cannot promise it is clean.
   */
  sendMessages?: boolean;
  now?: () => number;
  /** Returns `bytes` random bytes as lowercase hex. */
  randomHex?: (bytes: number) => string;
}

function defaultRandomHex(bytes: number): string {
  let hex = '';
  for (let index = 0; index < bytes; index += 1) {
    hex += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0');
  }
  return hex;
}

function readString(source: unknown, key: string): string | undefined {
  if (typeof source !== 'object' || source === null) return undefined;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function readNumber(source: unknown, key: string): number | undefined {
  if (typeof source !== 'object' || source === null) return undefined;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : undefined;
}

/** A name is an identifier chosen by a developer: letters, digits, dots, dashes, underscores. */
function cleanName(name: string): string {
  return /^[\w.-]{1,64}$/.test(name) ? name : 'invalid.name';
}

export function createTelemetry(options: TelemetryOptions): Telemetry {
  const {
    adapters,
    allowedKeys = DEFAULT_ALLOWED_KEYS,
    sendMessages = false,
    now = Date.now,
    randomHex = defaultRandomHex,
  } = options;
  // Random per launch and never stored: it groups the events of one run of
  // the app and identifies nobody across runs.
  const sessionId = randomHex(16);

  /** A failing adapter must never take the app down with it. */
  function each(call: (adapter: TelemetryAdapter) => void): void {
    for (const adapter of adapters) {
      try {
        call(adapter);
      } catch {
        // Dropped on purpose.
      }
    }
  }

  return {
    adapterNames: adapters.map((adapter) => adapter.name),

    captureError(error, attributes) {
      const record: ErrorRecord = {
        type: readString(error, 'name') ?? typeof error,
        code: readString(error, 'code'),
        status: readNumber(error, 'status'),
        frames: stackFrames(readString(error, 'stack')),
        attributes: sanitizeAttributes(attributes, allowedKeys),
        sessionId,
        timeUnixMs: now(),
      };
      const message = readString(error, 'message');
      if (sendMessages && message) record.message = redactText(message);
      each((adapter) => adapter.captureError(record));
    },

    trackEvent(name, attributes) {
      const record: UsageEventRecord = {
        name: cleanName(name),
        attributes: sanitizeAttributes(attributes, allowedKeys),
        sessionId,
        timeUnixMs: now(),
      };
      each((adapter) => adapter.trackEvent(record));
    },

    async withSpan(name, operation, attributes) {
      const startUnixMs = now();
      let ok = true;
      try {
        return await operation();
      } catch (error) {
        ok = false;
        throw error;
      } finally {
        const record: SpanRecord = {
          name: cleanName(name),
          traceId: randomHex(16),
          spanId: randomHex(8),
          startUnixMs,
          endUnixMs: now(),
          ok,
          attributes: sanitizeAttributes(attributes, allowedKeys),
          sessionId,
        };
        each((adapter) => adapter.recordSpan(record));
      }
    },

    async flush() {
      await Promise.all(
        adapters.map(async (adapter) => {
          try {
            await adapter.flush?.();
          } catch {
            // Dropped on purpose.
          }
        }),
      );
    },
  };
}

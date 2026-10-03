import type { ErrorRecord, TelemetryAdapter } from '../port.ts';

/**
 * The part of the Sentry SDK this adapter needs. The app passes
 * `@sentry/react-native`; this package does not depend on it, so the same
 * adapter serves any SDK that speaks the Sentry protocol.
 */
export interface SentryLike {
  captureEvent(event: Record<string, unknown>): unknown;
  addBreadcrumb(breadcrumb: Record<string, unknown>): void;
  flush?(timeout?: number): Promise<boolean>;
}

function toSentryEvent(record: ErrorRecord): Record<string, unknown> {
  return {
    level: 'error',
    timestamp: record.timeUnixMs / 1000,
    exception: {
      values: [
        {
          type: record.type,
          // The value is the error code or the redacted message. Never raw text.
          value: record.message ?? record.code ?? record.type,
          stacktrace: {
            // Sentry wants the most recent call last.
            frames: [...record.frames].reverse().map((frame) => ({
              function: frame.function,
              filename: frame.file,
              lineno: frame.line,
            })),
          },
        },
      ],
    },
    tags: {
      ...record.attributes,
      ...(record.code ? { 'error.code': record.code } : {}),
      ...(record.status === undefined ? {} : { 'http.status_code': record.status }),
      session_id: record.sessionId,
    },
  };
}

/**
 * Errors go out as Sentry events and usage events as breadcrumbs, so a
 * crash report shows the steps that led to it. Spans are left to the OTLP
 * adapter.
 */
export function createSentryAdapter(sentry: SentryLike): TelemetryAdapter {
  return {
    name: 'sentry',
    captureError: (record) => void sentry.captureEvent(toSentryEvent(record)),
    trackEvent: (record) =>
      sentry.addBreadcrumb({
        category: 'usage',
        message: record.name,
        data: record.attributes,
        timestamp: record.timeUnixMs / 1000,
      }),
    recordSpan() {},
    flush: async () => void (await sentry.flush?.(2000)),
  };
}

/**
 * A `beforeSend` hook for the Sentry SDK. Events this package builds are
 * already clean; this covers the ones the SDK captures by itself, such as
 * unhandled promise rejections. It removes the user, the request, extra
 * context and breadcrumbs the SDK collected automatically, and replaces
 * exception messages with the exception type.
 */
export function scrubSentryEvent<T extends Record<string, unknown>>(event: T): T {
  const scrubbed: Record<string, unknown> = { ...event };
  delete scrubbed.user;
  delete scrubbed.request;
  delete scrubbed.extra;
  delete scrubbed.message;
  delete scrubbed.server_name;

  const breadcrumbs = scrubbed.breadcrumbs;
  if (Array.isArray(breadcrumbs)) {
    scrubbed.breadcrumbs = breadcrumbs.filter(
      (crumb) => (crumb as { category?: unknown })?.category === 'usage',
    );
  }

  const exception = scrubbed.exception as { values?: Record<string, unknown>[] } | undefined;
  if (exception?.values) {
    scrubbed.exception = {
      ...exception,
      values: exception.values.map((value) => ({
        ...value,
        value: typeof value.type === 'string' ? value.type : 'Error',
      })),
    };
  }
  return scrubbed as T;
}

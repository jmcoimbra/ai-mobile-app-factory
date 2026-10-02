import type { Attributes } from '../pii.ts';
import type { SpanRecord, TelemetryAdapter, UsageEventRecord } from '../port.ts';

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>;

export interface OtlpAdapterOptions {
  /** Base URL of an OTLP/HTTP receiver, for example `https://collector.example.com:4318`. */
  endpoint: string;
  serviceName: string;
  /** Resource attributes, such as the app version and flavor. */
  resource?: Attributes;
  /** Extra request headers, such as an ingestion key. */
  headers?: Record<string, string>;
  fetch?: FetchLike;
  /** Records held before a send is forced. */
  maxBatchSize?: number;
}

const SCOPE = { name: '@maf/telemetry' };
const SPAN_KIND_INTERNAL = 1;
const STATUS_OK = 1;
const STATUS_ERROR = 2;
const SEVERITY_INFO = 9;

function toAnyValue(value: string | number | boolean) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { boolValue: value };
  return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
}

function toKeyValues(attributes: Attributes) {
  return Object.entries(attributes).map(([key, value]) => ({ key, value: toAnyValue(value) }));
}

/** OTLP JSON carries 64-bit nanosecond timestamps as decimal strings. */
function toUnixNano(unixMs: number): string {
  return `${Math.trunc(unixMs)}000000`;
}

/**
 * Sends spans to `/v1/traces` and usage events, as log records, to
 * `/v1/logs`, in the JSON encoding of OTLP over HTTP.
 *
 * The OpenTelemetry JavaScript SDK is not used: OpenTelemetry does not list
 * React Native among its supported runtimes. The wire format is the stable
 * part, and `fetch` is enough to speak it. Marked experimental, as the
 * platform support is.
 */
export function createOtlpAdapter(options: OtlpAdapterOptions): TelemetryAdapter {
  const { serviceName, resource = {}, headers = {}, maxBatchSize = 20 } = options;
  const endpoint = options.endpoint.replace(/\/+$/, '');
  const send: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const resourceAttributes = toKeyValues({ 'service.name': serviceName, ...resource });

  let spans: SpanRecord[] = [];
  let events: UsageEventRecord[] = [];

  async function post(path: string, body: unknown): Promise<void> {
    await send(`${endpoint}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  async function flush(): Promise<void> {
    const [spanBatch, eventBatch] = [spans, events];
    spans = [];
    events = [];
    const requests: Promise<void>[] = [];

    if (spanBatch.length > 0) {
      requests.push(
        post('/v1/traces', {
          resourceSpans: [
            {
              resource: { attributes: resourceAttributes },
              scopeSpans: [
                {
                  scope: SCOPE,
                  spans: spanBatch.map((span) => ({
                    traceId: span.traceId,
                    spanId: span.spanId,
                    name: span.name,
                    kind: SPAN_KIND_INTERNAL,
                    startTimeUnixNano: toUnixNano(span.startUnixMs),
                    endTimeUnixNano: toUnixNano(span.endUnixMs),
                    attributes: toKeyValues({ ...span.attributes, 'session.id': span.sessionId }),
                    status: { code: span.ok ? STATUS_OK : STATUS_ERROR },
                  })),
                },
              ],
            },
          ],
        }),
      );
    }

    if (eventBatch.length > 0) {
      requests.push(
        post('/v1/logs', {
          resourceLogs: [
            {
              resource: { attributes: resourceAttributes },
              scopeLogs: [
                {
                  scope: SCOPE,
                  logRecords: eventBatch.map((event) => ({
                    timeUnixNano: toUnixNano(event.timeUnixMs),
                    severityNumber: SEVERITY_INFO,
                    severityText: 'INFO',
                    body: { stringValue: event.name },
                    attributes: toKeyValues({
                      ...event.attributes,
                      'event.name': event.name,
                      'session.id': event.sessionId,
                    }),
                  })),
                },
              ],
            },
          ],
        }),
      );
    }

    // A failed export is dropped: telemetry never retries at the cost of the app.
    await Promise.allSettled(requests);
  }

  function flushWhenFull(): void {
    if (spans.length + events.length >= maxBatchSize) void flush();
  }

  return {
    name: 'otlp',
    // Errors travel through the Sentry-protocol adapter (ADR 0005).
    captureError() {},
    trackEvent(record) {
      events.push(record);
      flushWhenFull();
    },
    recordSpan(record) {
      spans.push(record);
      flushWhenFull();
    },
    flush,
  };
}

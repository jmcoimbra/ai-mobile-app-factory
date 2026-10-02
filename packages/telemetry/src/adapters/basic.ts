import type { ErrorRecord, SpanRecord, TelemetryAdapter, UsageEventRecord } from '../port.ts';

/** Sends nothing. The default when no backend is configured. */
export const noopAdapter: TelemetryAdapter = {
  name: 'noop',
  captureError() {},
  trackEvent() {},
  recordSpan() {},
};

/** Prints records. For development builds. */
export function createConsoleAdapter(
  log: (...args: unknown[]) => void = console.log,
): TelemetryAdapter {
  return {
    name: 'console',
    captureError: (record) => log('[telemetry] error', record),
    trackEvent: (record) => log('[telemetry] event', record),
    recordSpan: (record) => log('[telemetry] span', record),
  };
}

export interface MemoryAdapter extends TelemetryAdapter {
  errors: ErrorRecord[];
  events: UsageEventRecord[];
  spans: SpanRecord[];
}

/** Keeps records in memory. For tests. */
export function createMemoryAdapter(): MemoryAdapter {
  const adapter: MemoryAdapter = {
    name: 'memory',
    errors: [],
    events: [],
    spans: [],
    captureError: (record) => void adapter.errors.push(record),
    trackEvent: (record) => void adapter.events.push(record),
    recordSpan: (record) => void adapter.spans.push(record),
  };
  return adapter;
}

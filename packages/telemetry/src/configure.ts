import { createConsoleAdapter, noopAdapter } from './adapters/basic.ts';
import { createOtlpAdapter } from './adapters/otlp.ts';
import { createSentryAdapter, type SentryLike } from './adapters/sentry.ts';
import type { Attributes } from './pii.ts';
import { createTelemetry, type Telemetry, type TelemetryAdapter } from './port.ts';

export interface TelemetryConfig {
  /** Present when crash reporting is on. The app initialises the SDK with its DSN first. */
  sentry?: SentryLike;
  /** Base URL of an OTLP/HTTP receiver. Empty or missing means no traces or usage events. */
  otlpEndpoint?: string;
  otlpHeaders?: Record<string, string>;
  serviceName?: string;
  resource?: Attributes;
  /** Print records to the console. For development builds. */
  debug?: boolean;
  sendMessages?: boolean;
}

/**
 * Build the telemetry of an app from its configuration. With nothing
 * configured the result sends nothing: telemetry is opt-in per backend.
 */
export function configureTelemetry(config: TelemetryConfig = {}): Telemetry {
  const adapters: TelemetryAdapter[] = [];
  if (config.sentry) adapters.push(createSentryAdapter(config.sentry));
  if (config.otlpEndpoint) {
    adapters.push(
      createOtlpAdapter({
        endpoint: config.otlpEndpoint,
        headers: config.otlpHeaders,
        serviceName: config.serviceName ?? 'mobile-app',
        resource: config.resource,
      }),
    );
  }
  if (config.debug) adapters.push(createConsoleAdapter());
  if (adapters.length === 0) adapters.push(noopAdapter);

  return createTelemetry({ adapters, sendMessages: config.sendMessages });
}

import { configureTelemetry, scrubSentryEvent, type Telemetry } from '@maf/telemetry';

/** Telemetry settings of a build. They come from app.config.ts, per flavor. */
export interface AppTelemetryConfig {
  /** Sentry-protocol DSN. Empty means no crash reporting. */
  sentryDsn?: string;
  /** Base URL of an OTLP/HTTP receiver. Empty means no traces or usage events. */
  otlpEndpoint?: string;
  debug?: boolean;
  flavor?: string;
  version?: string;
  platform?: string;
}

/** The part of `@sentry/react-native` the app uses. Injected so tests need no native module. */
export interface SentrySdk {
  init(options: Record<string, unknown>): void;
  captureEvent(event: Record<string, unknown>): unknown;
  addBreadcrumb(breadcrumb: Record<string, unknown>): void;
  flush?(timeout?: number): Promise<boolean>;
}

/**
 * Build the app's telemetry. With no DSN and no endpoint nothing is
 * initialised and nothing is sent.
 */
export function createAppTelemetry(config: AppTelemetryConfig, loadSentry: () => SentrySdk) {
  let sentry: SentrySdk | undefined;

  if (config.sentryDsn) {
    sentry = loadSentry();
    sentry.init({
      dsn: config.sentryDsn,
      environment: config.flavor,
      release: config.version,
      // No IP address, cookies or user on events.
      sendDefaultPii: false,
      // The SDK captures some events by itself; they pass the same scrubber.
      beforeSend: scrubSentryEvent,
      // Automatic breadcrumbs (console, navigation, HTTP) can carry free
      // text and URLs. Only the ones the telemetry port adds are kept.
      beforeBreadcrumb: (breadcrumb: { category?: string }) =>
        breadcrumb.category === 'usage' ? breadcrumb : null,
      // Traces and usage events go through OTLP, not through this SDK.
      tracesSampleRate: 0,
    });
  }

  const telemetry: Telemetry = configureTelemetry({
    sentry,
    otlpEndpoint: config.otlpEndpoint,
    serviceName: 'factory-reference',
    resource: {
      ...(config.flavor ? { 'app.flavor': config.flavor } : {}),
      ...(config.version ? { 'app.version': config.version } : {}),
      ...(config.platform ? { platform: config.platform } : {}),
    },
    debug: config.debug,
  });
  return telemetry;
}

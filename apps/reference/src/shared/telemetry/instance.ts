import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { createAppTelemetry, type AppTelemetryConfig, type SentrySdk } from './app-telemetry';

const extra = (Constants.expoConfig?.extra ?? {}) as { telemetry?: AppTelemetryConfig };

/** The telemetry of the running app. Routes reach it through useTelemetry(). */
export const telemetry = createAppTelemetry(
  {
    ...extra.telemetry,
    version: Constants.expoConfig?.version,
    platform: Platform.OS,
    debug: __DEV__,
  },
  () => Sentry as unknown as SentrySdk,
);

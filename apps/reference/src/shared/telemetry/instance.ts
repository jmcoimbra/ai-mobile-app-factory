import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';

import { appConfig } from '@/shared/config/app-config';

import { createAppTelemetry, type SentrySdk } from './app-telemetry';

/** The telemetry of the running app. Routes reach it through useTelemetry(). */
export const telemetry = createAppTelemetry(
  {
    ...appConfig.telemetry,
    flavor: appConfig.flavor,
    version: appConfig.version,
    platform: Platform.OS,
    debug: __DEV__,
  },
  () => Sentry as unknown as SentrySdk,
);

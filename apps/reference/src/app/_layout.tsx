import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppErrorBoundary } from '@/shared/errors/app-error-boundary';
import { ErrorFallback } from '@/shared/errors/error-fallback';
import { telemetry } from '@/shared/telemetry/instance';
import { ScreenTracker, TelemetryProvider } from '@/shared/telemetry/telemetry-provider';
import { ThemeProvider } from '@/shared/theme/theme-provider';

/**
 * Expo Router renders this when a route below the root layout throws. It
 * sits outside RootLayout, so it brings its own theme and reports the error
 * itself.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  telemetry.captureError(error);
  return (
    <ThemeProvider>
      <ErrorFallback error={error} onRetry={retry} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <TelemetryProvider telemetry={telemetry}>
        <AppErrorBoundary onError={(error) => telemetry.captureError(error)}>
          <ScreenTracker />
          <Stack screenOptions={{ headerShown: false }} />
        </AppErrorBoundary>
      </TelemetryProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppErrorBoundary } from '@/shared/errors/app-error-boundary';
import { ErrorFallback } from '@/shared/errors/error-fallback';
import { ThemeProvider } from '@/shared/theme/theme-provider';

/**
 * Expo Router renders this when a route below the root layout throws. It
 * sits outside RootLayout, so it brings its own theme.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ThemeProvider>
      <ErrorFallback error={error} onRetry={retry} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppErrorBoundary>
        <Stack screenOptions={{ headerShown: false }} />
      </AppErrorBoundary>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

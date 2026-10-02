import type { Telemetry } from '@maf/telemetry';
import { useSegments } from 'expo-router';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { AppState } from 'react-native';

const TelemetryContext = createContext<Telemetry | null>(null);

interface TelemetryProviderProps {
  telemetry: Telemetry;
  children: ReactNode;
}

export function TelemetryProvider({ telemetry, children }: TelemetryProviderProps) {
  // Send what is buffered when the app leaves the foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void telemetry.flush();
    });
    return () => subscription.remove();
  }, [telemetry]);

  return <TelemetryContext.Provider value={telemetry}>{children}</TelemetryContext.Provider>;
}

export function useTelemetry(): Telemetry {
  const telemetry = useContext(TelemetryContext);
  if (!telemetry) {
    throw new Error('useTelemetry must be used inside a TelemetryProvider');
  }
  return telemetry;
}

/**
 * Reports a `screen.view` event on every navigation. It reads the route
 * pattern (`tasks/[id]`), never the concrete path, so no identifier that
 * appears in a URL reaches an event.
 */
export function ScreenTracker() {
  const telemetry = useTelemetry();
  const route = useSegments().join('/') || 'index';
  useEffect(() => {
    telemetry.trackEvent('screen.view', { screen: route });
  }, [telemetry, route]);
  return null;
}

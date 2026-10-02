import { createMemoryAdapter, createTelemetry } from '@maf/telemetry';
import { AppError } from '@maf/error-contract';
import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AppErrorBoundary } from '@/shared/errors/app-error-boundary';
import { renderWithProviders } from '@/shared/testing/render';

import { createAppTelemetry, type SentrySdk } from './app-telemetry';

function fakeSentry(): jest.Mocked<SentrySdk> {
  return { init: jest.fn(), captureEvent: jest.fn(), addBreadcrumb: jest.fn(), flush: jest.fn() };
}

test('app telemetry stays off without configuration', () => {
  const loadSentry = jest.fn(fakeSentry);

  const telemetry = createAppTelemetry({ sentryDsn: '', otlpEndpoint: '' }, loadSentry);

  expect(telemetry.adapterNames).toEqual(['noop']);
  expect(loadSentry).not.toHaveBeenCalled();
});

test('app telemetry starts the crash SDK with personal data off', () => {
  const sentry = fakeSentry();

  const telemetry = createAppTelemetry(
    { sentryDsn: 'https://key@errors.example.com/1', flavor: 'corporate', version: '1.2.3' },
    () => sentry,
  );

  expect(telemetry.adapterNames).toEqual(['sentry']);
  const options = sentry.init.mock.calls[0]?.[0] as {
    sendDefaultPii: boolean;
    beforeSend: (event: Record<string, unknown>) => Record<string, unknown>;
    beforeBreadcrumb: (breadcrumb: { category?: string }) => unknown;
  };
  expect(options.sendDefaultPii).toBe(false);
  expect(options.beforeSend({ user: { email: 'a@example.com' }, message: 'secret' })).toEqual({});
  expect(options.beforeBreadcrumb({ category: 'console' })).toBeNull();
  expect(options.beforeBreadcrumb({ category: 'usage' })).toEqual({ category: 'usage' });
});

test('an error caught by the boundary reaches telemetry without its detail', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const memory = createMemoryAdapter();
  const telemetry = createTelemetry({ adapters: [memory] });
  function Broken(): never {
    throw new AppError({ code: 'server.error', status: 500, detail: 'stack overflow in db-7' });
  }

  await renderWithProviders(
    <AppErrorBoundary onError={(error) => telemetry.captureError(error)}>
      <Broken />
      <Text>never shown</Text>
    </AppErrorBoundary>,
  );

  expect(
    screen.getByRole('header', { name: 'Something went wrong on our side' }),
  ).toBeOnTheScreen();
  expect(memory.errors).toHaveLength(1);
  expect(memory.errors[0]).toMatchObject({ code: 'server.error', status: 500, type: 'AppError' });
  expect(JSON.stringify(memory.errors[0])).not.toMatch(/db-7/);
  jest.restoreAllMocks();
});

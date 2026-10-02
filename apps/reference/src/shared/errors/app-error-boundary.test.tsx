import { AppError } from '@maf/error-contract';
import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@/shared/testing/render';

import { AppErrorBoundary } from './app-error-boundary';

const TECHNICAL_DETAIL = 'task 42 does not exist in checklist 7 (db-replica-3)';

let shouldThrow = true;

function Flaky() {
  if (shouldThrow) {
    throw new AppError({
      code: 'server.unavailable',
      status: 503,
      detail: TECHNICAL_DETAIL,
    });
  }
  return <Text>Checklist loaded</Text>;
}

beforeEach(() => {
  shouldThrow = true;
  // React logs every caught render error; keep the test output readable.
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

test('error boundary shows the user message and hides the technical detail', async () => {
  const onError = jest.fn();
  await renderWithProviders(
    <AppErrorBoundary onError={onError}>
      <Flaky />
    </AppErrorBoundary>,
  );

  expect(screen.getByRole('header', { name: 'The service is unavailable' })).toBeOnTheScreen();
  expect(screen.queryByText(TECHNICAL_DETAIL, { exact: false })).not.toBeOnTheScreen();
  expect(screen.queryByText(/503|server\.unavailable|db-replica/)).not.toBeOnTheScreen();
  expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'server.unavailable' }));
});

test('error boundary recovers when the person tries again', async () => {
  await renderWithProviders(
    <AppErrorBoundary>
      <Flaky />
    </AppErrorBoundary>,
  );

  shouldThrow = false;
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

  expect(screen.getByText('Checklist loaded')).toBeOnTheScreen();
});

test('an error that is not an AppError still gets a safe message', async () => {
  function Broken(): never {
    throw new Error('Cannot read properties of undefined (reading "tasks")');
  }
  await renderWithProviders(
    <AppErrorBoundary>
      <Broken />
    </AppErrorBoundary>,
  );

  expect(screen.getByRole('header', { name: 'Something went wrong' })).toBeOnTheScreen();
  expect(screen.queryByText(/Cannot read properties/)).not.toBeOnTheScreen();
});

test('no retry is offered when retrying cannot help', async () => {
  function Forbidden(): never {
    throw new AppError({ code: 'auth.forbidden', status: 403 });
  }
  await renderWithProviders(
    <AppErrorBoundary>
      <Forbidden />
    </AppErrorBoundary>,
  );

  expect(screen.getByRole('header', { name: 'You do not have access to this' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
});

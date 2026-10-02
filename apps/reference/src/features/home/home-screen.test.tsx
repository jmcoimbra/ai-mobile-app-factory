import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/shared/testing/render';

import { APP_TITLE, HomeScreen } from './home-screen';

test('home screen renders the app title', async () => {
  await renderWithProviders(<HomeScreen />);

  expect(screen.getByRole('header', { name: APP_TITLE })).toBeOnTheScreen();
});

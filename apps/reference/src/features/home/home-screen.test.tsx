import { render, screen } from '@testing-library/react-native';

import { APP_TITLE, HomeScreen } from './home-screen';

test('home screen renders the app title', async () => {
  await render(<HomeScreen />);

  expect(screen.getByRole('header', { name: APP_TITLE })).toBeOnTheScreen();
});

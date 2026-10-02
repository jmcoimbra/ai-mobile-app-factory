import { createThemes } from '@maf/design-tokens';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import * as ReactNative from 'react-native';

import { ThemeProvider, useTheme } from './theme-provider';

function Probe() {
  const theme = useTheme();
  return <Text>{`${theme.scheme}:${theme.colors.surface}`}</Text>;
}

const themes = createThemes();

test('theme follows the system color scheme', async () => {
  const useColorScheme = jest.spyOn(ReactNative, 'useColorScheme');

  useColorScheme.mockReturnValue('dark');
  const view = await render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  expect(screen.getByText(`dark:${themes.dark.colors.surface}`)).toBeOnTheScreen();

  useColorScheme.mockReturnValue('light');
  await view.rerender(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  expect(screen.getByText(`light:${themes.light.colors.surface}`)).toBeOnTheScreen();

  // No preference reported by the system falls back to light.
  useColorScheme.mockReturnValue('unspecified');
  await view.rerender(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
  expect(screen.getByText(`light:${themes.light.colors.surface}`)).toBeOnTheScreen();
});

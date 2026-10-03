import { minTouchTarget } from '@maf/design-tokens';
import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { renderWithProviders } from '@/shared/testing/render';

import { Button } from './button';

test('interactive elements expose a role and an accessible name', async () => {
  const onPress = jest.fn();
  await renderWithProviders(<Button label="Start checklist" onPress={onPress} />);

  const button = screen.getByRole('button', { name: 'Start checklist' });
  expect(button).toBeEnabled();

  await fireEvent.press(button);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('a disabled button says so and ignores presses', async () => {
  const onPress = jest.fn();
  await renderWithProviders(<Button label="Submit" disabled onPress={onPress} />);

  const button = screen.getByRole('button', { name: 'Submit' });
  expect(button).toBeDisabled();

  await fireEvent.press(button);
  expect(onPress).not.toHaveBeenCalled();
});

test('button meets the minimum touch target', async () => {
  await renderWithProviders(<Button label="OK" />);

  const style = StyleSheet.flatten(screen.getByRole('button', { name: 'OK' }).props.style);
  expect(style.minHeight).toBeGreaterThanOrEqual(minTouchTarget);
  expect(style.minWidth).toBeGreaterThanOrEqual(minTouchTarget);
});

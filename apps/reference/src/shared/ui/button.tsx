import { minTouchTarget, radius, spacing } from '@maf/design-tokens';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { useTheme } from '@/shared/theme/theme-provider';

import { AppText } from './app-text';

interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  /** Visible text. It is also the accessible name unless `accessibilityLabel` is set. */
  label: string;
}

export function Button({ label, disabled, accessibilityLabel, ...rest }: ButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? colors.brandPressed : colors.brand },
        disabled ? styles.disabled : null,
      ]}
      {...rest}
    >
      <AppText variant="label" tone="onBrand">
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  disabled: { opacity: 0.5 },
});

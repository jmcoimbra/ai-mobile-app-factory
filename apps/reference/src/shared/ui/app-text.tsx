import { typography } from '@maf/design-tokens';
import { Text, type TextProps } from 'react-native';

import { useTheme } from '@/shared/theme/theme-provider';

type Variant = keyof typeof typography;
type Tone = 'primary' | 'secondary' | 'brand' | 'danger' | 'onBrand';

interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
}

const toneToRole = {
  primary: 'textPrimary',
  secondary: 'textSecondary',
  brand: 'brandText',
  danger: 'danger',
  onBrand: 'onBrand',
} as const;

/** Text that takes its size from a typography token and its colour from a role. */
export function AppText({ variant = 'body', tone = 'primary', style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  const isHeading = variant === 'title' || variant === 'heading';
  return (
    <Text
      accessibilityRole={isHeading ? 'header' : undefined}
      style={[typography[variant], { color: colors[toneToRole[tone]] }, style]}
      {...rest}
    />
  );
}

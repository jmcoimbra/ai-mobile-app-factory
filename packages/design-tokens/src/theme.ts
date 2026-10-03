import { defaultBrand, type Brand, type BrandColors } from './brand.ts';
import { feedback, neutral } from './primitives.ts';

export type ColorScheme = 'light' | 'dark';

/** Semantic colour roles. Screens read these and never a primitive. */
export interface ThemeColors extends BrandColors {
  surface: string;
  surfaceRaised: string;
  border: string;
  /** Outline of inputs and other controls that need to be told apart from the surface. */
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  danger: string;
  success: string;
  warning: string;
  focusRing: string;
}

export interface Theme {
  scheme: ColorScheme;
  brandName: string;
  colors: ThemeColors;
}

const neutrals: Record<ColorScheme, Omit<ThemeColors, keyof BrandColors | 'focusRing'>> = {
  light: {
    surface: neutral[0],
    surfaceRaised: neutral[50],
    border: neutral[200],
    borderStrong: neutral[500],
    textPrimary: neutral[900],
    textSecondary: neutral[600],
    danger: feedback.danger.light,
    success: feedback.success.light,
    warning: feedback.warning.light,
  },
  dark: {
    surface: neutral[950],
    surfaceRaised: neutral[900],
    border: neutral[800],
    borderStrong: neutral[400],
    textPrimary: neutral[50],
    textSecondary: neutral[300],
    danger: feedback.danger.dark,
    success: feedback.success.dark,
    warning: feedback.warning.dark,
  },
};

export function createTheme(scheme: ColorScheme, brand: Brand = defaultBrand): Theme {
  const brandColors = brand[scheme];
  return {
    scheme,
    brandName: brand.name,
    colors: { ...neutrals[scheme], ...brandColors, focusRing: brandColors.brandText },
  };
}

export function createThemes(brand: Brand = defaultBrand): Record<ColorScheme, Theme> {
  return { light: createTheme('light', brand), dark: createTheme('dark', brand) };
}

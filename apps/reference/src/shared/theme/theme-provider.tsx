import { createThemes, defaultBrand, type Brand, type Theme } from '@maf/design-tokens';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

const ThemeContext = createContext<Theme | null>(null);

interface ThemeProviderProps {
  /** The brand to paint the app with. Each flavor passes its own. */
  brand?: Brand;
  children: ReactNode;
}

/** Follows the system colour scheme and exposes the matching theme. */
export function ThemeProvider({ brand = defaultBrand, children }: ThemeProviderProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const themes = useMemo(() => createThemes(brand), [brand]);
  return <ThemeContext.Provider value={themes[scheme]}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }
  return theme;
}

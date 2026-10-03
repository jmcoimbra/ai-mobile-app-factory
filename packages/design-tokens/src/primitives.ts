/**
 * Raw values. Nothing in the app reads these directly: screens use the
 * semantic roles of a Theme, which are built from primitives in theme.ts.
 */

export const neutral = {
  0: '#FFFFFF',
  50: '#F8FAFC',
  100: '#F1F5F9',
  200: '#E2E8F0',
  300: '#CBD5E1',
  400: '#94A3B8',
  500: '#64748B',
  600: '#475569',
  700: '#334155',
  800: '#1E293B',
  900: '#0F172A',
  950: '#020617',
} as const;

export const feedback = {
  danger: { light: '#B91C1C', dark: '#FCA5A5' },
  success: { light: '#15803D', dark: '#86EFAC' },
  warning: { light: '#A16207', dark: '#FDE047' },
} as const;

export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 16,
  pill: 999,
} as const;

/** Sizes in density-independent pixels; the platform applies font scaling. */
export const typography = {
  title: { fontSize: 28, lineHeight: 36, fontWeight: '700' },
  heading: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  caption: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
} as const;

/** Smallest side of anything a finger has to hit. */
export const minTouchTarget = 48;

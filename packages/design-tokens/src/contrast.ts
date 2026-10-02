import type { Theme, ThemeColors } from './theme.ts';

/** WCAG 2.2 success criterion 1.4.3: normal text. */
export const AA_TEXT = 4.5;
/** WCAG 2.2 success criterion 1.4.11: user interface components and graphics. */
export const AA_NON_TEXT = 3;

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of a `#RRGGBB` colour, as WCAG defines it. */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) {
    throw new Error(`expected a #RRGGBB colour, got "${hex}"`);
  }
  const value = Number.parseInt(match[1], 16);
  const red = channel((value >> 16) & 0xff);
  const green = channel((value >> 8) & 0xff);
  const blue = channel(value & 0xff);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (lighter + 0.05) / (darker + 0.05);
}

export interface ContrastPair {
  foreground: keyof ThemeColors;
  background: keyof ThemeColors;
  minimum: number;
}

/**
 * Every foreground role with the surfaces it is allowed to sit on. A role
 * used on a surface that is not listed here is a design error: add the pair
 * first, and let the test say whether the colours hold.
 */
export const contrastPairs: readonly ContrastPair[] = [
  { foreground: 'textPrimary', background: 'surface', minimum: AA_TEXT },
  { foreground: 'textPrimary', background: 'surfaceRaised', minimum: AA_TEXT },
  { foreground: 'textSecondary', background: 'surface', minimum: AA_TEXT },
  { foreground: 'textSecondary', background: 'surfaceRaised', minimum: AA_TEXT },
  { foreground: 'brandText', background: 'surface', minimum: AA_TEXT },
  { foreground: 'brandText', background: 'surfaceRaised', minimum: AA_TEXT },
  { foreground: 'onBrand', background: 'brand', minimum: AA_TEXT },
  { foreground: 'onBrand', background: 'brandPressed', minimum: AA_TEXT },
  { foreground: 'danger', background: 'surface', minimum: AA_TEXT },
  { foreground: 'danger', background: 'surfaceRaised', minimum: AA_TEXT },
  { foreground: 'success', background: 'surface', minimum: AA_TEXT },
  { foreground: 'warning', background: 'surface', minimum: AA_TEXT },
  { foreground: 'brand', background: 'surface', minimum: AA_NON_TEXT },
  { foreground: 'borderStrong', background: 'surface', minimum: AA_NON_TEXT },
  { foreground: 'focusRing', background: 'surface', minimum: AA_NON_TEXT },
];

export interface ContrastFailure extends ContrastPair {
  scheme: Theme['scheme'];
  brandName: string;
  ratio: number;
}

/** The pairs of a theme that fall below their minimum. Empty means AA holds. */
export function contrastFailures(theme: Theme): ContrastFailure[] {
  return contrastPairs
    .map((pair) => ({
      ...pair,
      scheme: theme.scheme,
      brandName: theme.brandName,
      ratio: contrastRatio(theme.colors[pair.foreground], theme.colors[pair.background]),
    }))
    .filter((result) => result.ratio < result.minimum);
}

/**
 * The part of a theme a brand owns. Swapping the brand changes these values
 * and nothing else: the semantic roles and every neutral stay as they are.
 */
export interface BrandColors {
  /** Fill of primary actions and selected states. */
  brand: string;
  /** The same fill while pressed. */
  brandPressed: string;
  /** Text and icons drawn on top of `brand`. */
  onBrand: string;
  /** Brand-coloured text and icons drawn on the page surface. */
  brandText: string;
}

export interface Brand {
  name: string;
  light: BrandColors;
  dark: BrandColors;
}

export const defaultBrand: Brand = {
  name: 'default',
  light: { brand: '#0F766E', brandPressed: '#115E59', onBrand: '#FFFFFF', brandText: '#0F766E' },
  dark: { brand: '#5EEAD4', brandPressed: '#2DD4BF', onBrand: '#042F2E', brandText: '#5EEAD4' },
};

export const corporateBrand: Brand = {
  name: 'corporate',
  light: { brand: '#3730A3', brandPressed: '#312E81', onBrand: '#FFFFFF', brandText: '#3730A3' },
  dark: { brand: '#A5B4FC', brandPressed: '#818CF8', onBrand: '#1E1B4B', brandText: '#A5B4FC' },
};

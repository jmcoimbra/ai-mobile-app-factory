import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { corporateBrand, defaultBrand, type Brand } from './brand.ts';
import { contrastFailures, contrastRatio } from './contrast.ts';
import { createThemes } from './theme.ts';

const brands: Brand[] = [defaultBrand, corporateBrand];

describe('contrast', () => {
  test('contrast ratio matches the WCAG reference values', () => {
    assert.ok(Math.abs(contrastRatio('#000000', '#FFFFFF') - 21) < 1e-9);
    assert.ok(Math.abs(contrastRatio('#FFFFFF', '#FFFFFF') - 1) < 1e-9);
    // #767676 on white is the well-known lightest grey that passes AA text.
    assert.ok(contrastRatio('#767676', '#FFFFFF') >= 4.5);
    assert.ok(contrastRatio('#777777', '#FFFFFF') < 4.5);
  });

  test('every text and surface pair meets WCAG AA contrast in light and dark', () => {
    for (const brand of brands) {
      const themes = createThemes(brand);
      assert.deepEqual(contrastFailures(themes.light), []);
      assert.deepEqual(contrastFailures(themes.dark), []);
    }
  });

  test('a brand that is too light is reported', () => {
    const washedOut: Brand = {
      name: 'washed-out',
      light: { ...defaultBrand.light, brand: '#99F6E4', brandText: '#99F6E4' },
      dark: defaultBrand.dark,
    };
    const failures = contrastFailures(createThemes(washedOut).light);
    assert.ok(failures.some((failure) => failure.foreground === 'brandText'));
  });
});

describe('brand override', () => {
  test('brand override replaces brand tokens and keeps the semantic roles', () => {
    const base = createThemes(defaultBrand);
    const branded = createThemes(corporateBrand);

    for (const scheme of ['light', 'dark'] as const) {
      const before = base[scheme].colors;
      const after = branded[scheme].colors;
      // The same roles exist, whatever the brand.
      assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
      // Every brand-owned role follows the brand.
      for (const role of ['brand', 'brandPressed', 'onBrand', 'brandText'] as const) {
        assert.equal(after[role], corporateBrand[scheme][role], `${scheme} ${role}`);
      }
      assert.equal(after.focusRing, corporateBrand[scheme].brandText);
      // And the two brands are told apart on the roles where they differ.
      assert.notEqual(after.brand, before.brand);
      assert.notEqual(after.brandText, before.brandText);
      // Everything the brand does not own is untouched.
      const brandOwned = new Set(['brand', 'brandPressed', 'onBrand', 'brandText', 'focusRing']);
      for (const role of Object.keys(before) as (keyof typeof before)[]) {
        if (!brandOwned.has(role)) {
          assert.equal(after[role], before[role]);
        }
      }
    }
  });
});

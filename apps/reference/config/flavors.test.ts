import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { ConfigContext } from 'expo/config';

import appConfig from '../app.config';
import { FLAVORS, UnknownFlavorError, resolveFlavor } from './flavors';

const APP_ROOT = join(__dirname, '..');
const ICON_FILES = [
  'icon.png',
  'adaptive-foreground.png',
  'adaptive-monochrome.png',
  'splash-icon.png',
];
const savedEnv = { ...process.env };

function configFor(env: Record<string, string>) {
  process.env = { ...savedEnv, ...env };
  return appConfig({} as ConfigContext);
}

afterEach(() => {
  process.env = { ...savedEnv };
});

test('public and corporate flavors resolve distinct ids, names and icons', () => {
  const [publicFlavor, corporate] = FLAVORS.map((flavor) => resolveFlavor({ APP_VARIANT: flavor }));

  expect(publicFlavor!.appId).not.toBe(corporate!.appId);
  expect(publicFlavor!.name).not.toBe(corporate!.name);
  expect(publicFlavor!.scheme).not.toBe(corporate!.scheme);
  expect(publicFlavor!.assets).not.toBe(corporate!.assets);

  // The icons each flavor points at exist on disk.
  for (const flavor of [publicFlavor!, corporate!]) {
    for (const file of ICON_FILES) {
      expect(existsSync(join(APP_ROOT, flavor.assets, file))).toBe(true);
    }
  }

  // And the real Expo config carries them through to both platforms.
  const publicConfig = configFor({ APP_VARIANT: 'public' });
  const corporateConfig = configFor({ APP_VARIANT: 'corporate' });
  expect(publicConfig.ios?.bundleIdentifier).toBe(publicFlavor!.appId);
  expect(publicConfig.android?.package).toBe(publicFlavor!.appId);
  expect(corporateConfig.ios?.bundleIdentifier).toBe(corporate!.appId);
  expect(corporateConfig.android?.package).toBe(corporate!.appId);
  expect(corporateConfig.name).toBe('Factory Staff');
  expect(corporateConfig.icon).toContain('brand/corporate');
  expect(corporateConfig.extra?.flavor).toBe('corporate');
});

test('unknown flavor fails the config', () => {
  expect(() => resolveFlavor({ APP_VARIANT: 'staging' })).toThrow(UnknownFlavorError);
  expect(() => resolveFlavor({ APP_VARIANT: 'Public' })).toThrow(UnknownFlavorError);
  expect(() => configFor({ APP_VARIANT: 'corp' })).toThrow(UnknownFlavorError);
});

test('no flavor requested builds the public flavor', () => {
  expect(resolveFlavor({}).flavor).toBe('public');
  expect(resolveFlavor({ APP_VARIANT: '  ' }).flavor).toBe('public');
});

test('each flavor reads its own identifiers and keys', () => {
  const env = {
    APP_ID_PUBLIC: 'org.example.app',
    APP_ID_CORPORATE: 'org.example.app.staff',
    SENTRY_DSN_PUBLIC: 'https://public@errors.example.com/1',
    SENTRY_DSN_CORPORATE: 'https://corporate@errors.example.com/2',
    API_BASE_URL_CORPORATE: 'https://staff-api.example.com',
  };

  const publicFlavor = resolveFlavor({ ...env, APP_VARIANT: 'public' });
  const corporate = resolveFlavor({ ...env, APP_VARIANT: 'corporate' });

  expect(publicFlavor.appId).toBe('org.example.app');
  expect(publicFlavor.telemetry.sentryDsn).toBe('https://public@errors.example.com/1');
  expect(publicFlavor.apiBaseUrl).toBe('');
  expect(corporate.appId).toBe('org.example.app.staff');
  expect(corporate.telemetry.sentryDsn).toBe('https://corporate@errors.example.com/2');
  expect(corporate.apiBaseUrl).toBe('https://staff-api.example.com');
});

test('the release tag sets the version of both platforms', () => {
  const release = configFor({ APP_VERSION: 'v2.3.4' });
  expect(release.version).toBe('2.3.4');
  expect(release.ios?.buildNumber).toBe('2003004');
  expect(release.android?.versionCode).toBe(2_003_004);

  const preview = configFor({ APP_VERSION: '' });
  expect(preview.version).toBe('0.0.0');
  expect(preview.android?.versionCode).toBe(1);

  expect(() => configFor({ APP_VERSION: 'v2.3.4-beta.1' })).toThrow(/not a release tag/);
});

import { versionFromEnv } from '@maf/app-version';
import type { ConfigContext, ExpoConfig } from 'expo/config';

import { resolveFlavor } from './config/flavors.ts';

/**
 * The Sentry plugin uploads source maps and debug symbols during a native
 * build. It is added only when a project is configured, so a build with no
 * Sentry account has no upload step to fail. Crash capture itself needs no
 * plugin: the native SDK is autolinked.
 */
function sentryPlugin(): NonNullable<ExpoConfig['plugins']> {
  const organization = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  const url = process.env.SENTRY_URL;
  if (!organization || !project) return [];
  return [
    ['@sentry/react-native/expo', { organization, project, url: url ?? 'https://sentry.io/' }],
  ];
}

/**
 * One config, two flavors. APP_VARIANT picks the flavor and APP_VERSION,
 * set by the release workflow to the release tag, decides the version
 * fields. Neither is ever written into this file: see docs/adr/0004 and
 * docs/adr/0006.
 */
export default function config(_context: ConfigContext): ExpoConfig {
  const flavor = resolveFlavor(process.env);
  const version = versionFromEnv(process.env);

  return {
    name: flavor.name,
    slug: 'factory-reference',
    scheme: flavor.scheme,
    version: version.version,
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    icon: `${flavor.assets}/icon.png`,
    ios: {
      bundleIdentifier: flavor.appId,
      buildNumber: version.buildNumber,
      supportsTablet: false,
    },
    android: {
      package: flavor.appId,
      versionCode: version.versionCode,
      adaptiveIcon: {
        backgroundColor: flavor.brandColor,
        foregroundImage: `${flavor.assets}/adaptive-foreground.png`,
        monochromeImage: `${flavor.assets}/adaptive-monochrome.png`,
      },
    },
    plugins: [
      'expo-router',
      ...sentryPlugin(),
      [
        'expo-splash-screen',
        {
          backgroundColor: flavor.brandColor,
          image: `${flavor.assets}/splash-icon.png`,
          imageWidth: 96,
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      flavor: flavor.flavor,
      apiBaseUrl: flavor.apiBaseUrl,
      // Both empty by default: with nothing configured the app sends nothing.
      telemetry: flavor.telemetry,
    },
  };
}

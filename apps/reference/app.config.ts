import type { ConfigContext, ExpoConfig } from 'expo/config';

// Placeholder identifiers. Flavors, real identifiers and tag-derived
// versions arrive with slice 5 (see docs/adr/0004 and docs/adr/0006).
const APP_NAME = 'Factory Reference';
const APP_ID = 'com.example.factory';
const BRAND_COLOR = '#0F766E';

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

export default function config(_context: ConfigContext): ExpoConfig {
  return {
    name: APP_NAME,
    slug: 'factory-reference',
    scheme: 'factoryreference',
    version: '0.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    icon: './assets/brand/public/icon.png',
    ios: {
      bundleIdentifier: APP_ID,
      buildNumber: '1',
      supportsTablet: false,
    },
    android: {
      package: APP_ID,
      versionCode: 1,
      adaptiveIcon: {
        backgroundColor: BRAND_COLOR,
        foregroundImage: './assets/brand/public/adaptive-foreground.png',
        monochromeImage: './assets/brand/public/adaptive-monochrome.png',
      },
    },
    plugins: [
      'expo-router',
      ...sentryPlugin(),
      [
        'expo-splash-screen',
        {
          backgroundColor: BRAND_COLOR,
          image: './assets/brand/public/splash-icon.png',
          imageWidth: 96,
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      // Both empty by default: with nothing configured the app sends nothing.
      telemetry: {
        sentryDsn: process.env.SENTRY_DSN ?? '',
        otlpEndpoint: process.env.OTLP_ENDPOINT ?? '',
      },
    },
  };
}

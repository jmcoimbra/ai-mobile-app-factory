import type { ConfigContext, ExpoConfig } from 'expo/config';

// Placeholder identifiers. Flavors, real identifiers and tag-derived
// versions arrive with slice 5 (see docs/adr/0004 and docs/adr/0006).
const APP_NAME = 'Factory Reference';
const APP_ID = 'com.example.factory';
const BRAND_COLOR = '#0F766E';

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
  };
}

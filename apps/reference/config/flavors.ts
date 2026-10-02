/**
 * The flavors of the app. One codebase, one build per flavor: see
 * docs/adr/0006. Everything that differs between them is decided here and
 * nowhere else.
 */
export const FLAVORS = ['public', 'corporate'] as const;
export type Flavor = (typeof FLAVORS)[number];

export interface FlavorConfig {
  flavor: Flavor;
  /** Name under the icon. */
  name: string;
  /** iOS bundle identifier and Android application id. */
  appId: string;
  /** URL scheme for deep links. */
  scheme: string;
  /** Background of the adaptive icon and the splash screen. */
  brandColor: string;
  /** Directory with icon.png, adaptive-foreground.png, adaptive-monochrome.png, splash-icon.png. */
  assets: string;
  apiBaseUrl: string;
  telemetry: { sentryDsn: string; otlpEndpoint: string };
}

type Env = Record<string, string | undefined>;

const DEFAULTS: Record<Flavor, Pick<FlavorConfig, 'name' | 'appId' | 'scheme' | 'brandColor'>> = {
  // Placeholder identifiers. Set APP_ID_PUBLIC and APP_ID_CORPORATE to the
  // identifiers registered in the stores before a release build.
  public: {
    name: 'Factory Reference',
    appId: 'com.example.factory',
    scheme: 'factoryreference',
    brandColor: '#0F766E',
  },
  corporate: {
    name: 'Factory Staff',
    appId: 'com.example.factory.staff',
    scheme: 'factorystaff',
    brandColor: '#3730A3',
  },
};

export class UnknownFlavorError extends Error {
  constructor(value: string) {
    super(`APP_VARIANT is "${value}". Expected one of: ${FLAVORS.join(', ')}.`);
    this.name = 'UnknownFlavorError';
  }
}

function isFlavor(value: string): value is Flavor {
  return (FLAVORS as readonly string[]).includes(value);
}

/**
 * Resolve the flavor being built from the environment. APP_VARIANT picks
 * it; with none set the build is the public flavor. An unknown value
 * throws: a typo must never produce a build of the wrong flavor.
 *
 * Per-flavor settings are read from variables suffixed with the flavor in
 * upper case, so one CI environment can hold both: SENTRY_DSN_CORPORATE,
 * API_BASE_URL_PUBLIC.
 */
export function resolveFlavor(env: Env): FlavorConfig {
  const requested = env.APP_VARIANT?.trim() || 'public';
  if (!isFlavor(requested)) throw new UnknownFlavorError(requested);

  const suffix = requested.toUpperCase();
  const read = (name: string) => env[`${name}_${suffix}`]?.trim() ?? '';
  const defaults = DEFAULTS[requested];

  return {
    flavor: requested,
    name: defaults.name,
    appId: read('APP_ID') || defaults.appId,
    scheme: defaults.scheme,
    brandColor: defaults.brandColor,
    assets: `./assets/brand/${requested}`,
    apiBaseUrl: read('API_BASE_URL'),
    telemetry: { sentryDsn: read('SENTRY_DSN'), otlpEndpoint: read('OTLP_ENDPOINT') },
  };
}

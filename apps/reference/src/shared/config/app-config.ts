import { corporateBrand, defaultBrand, type Brand } from '@maf/design-tokens';
import Constants from 'expo-constants';

/** What app.config.ts hands to the running app through `extra`. */
interface Extra {
  flavor?: string;
  apiBaseUrl?: string;
  telemetry?: { sentryDsn?: string; otlpEndpoint?: string };
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

export const appConfig = {
  flavor: extra.flavor === 'corporate' ? ('corporate' as const) : ('public' as const),
  apiBaseUrl: extra.apiBaseUrl ?? '',
  telemetry: extra.telemetry ?? {},
  version: Constants.expoConfig?.version ?? '0.0.0',
};

/** The brand each flavor is painted with. */
export const appBrand: Brand = appConfig.flavor === 'corporate' ? corporateBrand : defaultBrand;

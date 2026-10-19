import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Three builds of the same app, installable side by side:
 *   development  "Nogoman (dev)"   dev client, loads code from your computer
 *   preview      "Nogoman (test)"  standalone build for the pilot testers
 *   production   "Nogoman"         App Store / Play Store
 * The variant comes from APP_VARIANT, set per build profile in eas.json.
 */
const variant = (process.env.APP_VARIANT ?? 'development') as 'development' | 'preview' | 'production';
const isProd = variant === 'production';
const suffix = isProd ? '' : `.${variant}`;

// Set after running `npx eas-cli@latest init` once (it prints the id).
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: isProd ? 'Nogoman' : variant === 'preview' ? 'Nogoman (test)' : 'Nogoman (dev)',
  slug: 'nogoman',
  ios: {
    ...config.ios,
    bundleIdentifier: `ci.nogoman.app${suffix}`,
    // Only standard HTTPS/TLS: no export-compliance questionnaire on each TestFlight upload.
    config: { ...config.ios?.config, usesNonExemptEncryption: false },
    infoPlist: {
      ...config.ios?.infoPlist,
      // Until the API has a domain with HTTPS, test builds talk to the homelab over plain HTTP
      // (Tailscale). Production builds only allow HTTPS.
      ...(isProd ? {} : { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true } }),
    },
  },
  android: {
    ...config.android,
    package: `ci.nogoman.app${suffix}`,
    permissions: [...(config.android?.permissions ?? []), 'RECORD_AUDIO'],
    // react-native-maps needs a Google Maps key on Android outside Expo Go.
    config: { ...config.android?.config, googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY } },
  },
  plugins: [
    ...(config.plugins ?? []),
    'expo-dev-client',
    ['expo-build-properties', { android: { usesCleartextTraffic: !isProd } }],
  ],
  extra: {
    ...config.extra,
    variant,
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
});

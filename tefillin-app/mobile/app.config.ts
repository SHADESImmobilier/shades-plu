import { ExpoConfig, ConfigContext } from "expo/config";

// Config dynamique : injecte les valeurs sensibles depuis l'environnement
// (variables EXPO_PUBLIC_* ou secrets EAS) par-dessus app.json. Ainsi aucune vraie
// clé n'est committée ; on renseigne un .env local ou les secrets EAS.
//
//   EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY,
//   EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY, EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  extra: {
    ...config.extra,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? config.extra?.supabaseUrl ?? "",
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? config.extra?.supabaseAnonKey ?? "",
    stripePublishableKey:
      process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? config.extra?.stripePublishableKey ?? "",
  },
  android: {
    ...config.android,
    config: {
      ...(config.android?.config ?? {}),
      googleMapsApiKey:
        process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? config.android?.config?.googleMapsApiKey,
    },
  },
});

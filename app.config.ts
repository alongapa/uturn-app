import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from './app.json';

// Config dinámica de Expo. Mantiene todo lo declarado en `app.json` y añade en
// `extra` la URL y la anon key de Supabase leídas desde variables de entorno
// (`.env`, ignorado por git). Las variables `EXPO_PUBLIC_*` también quedan
// disponibles vía `process.env` en el bundle; se exponen además aquí para poder
// leerlas con `expo-constants` de forma uniforme en dev y en builds de EAS.
export default ({ config }: ConfigContext): ExpoConfig => {
  const base = { ...appJson.expo, ...config } as ExpoConfig;

  return {
    ...base,
    extra: {
      ...base.extra,
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    },
  };
};

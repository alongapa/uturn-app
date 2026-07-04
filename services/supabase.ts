import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { Database } from '@/types/database';

// Lee la configuración desde `expo-constants` (inyectada por `app.config.ts`) y
// cae a `process.env` (Expo inlinea las variables `EXPO_PUBLIC_*`). Así funciona
// igual en dev, en web y en builds de EAS.
const extra = (Constants.expoConfig?.extra ?? {}) as {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

const supabaseUrl = extra.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = extra.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

/** true cuando hay URL y anon key; permite degradar a modo offline/mock sin romper. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured && __DEV__) {
  console.warn(
    'Supabase no está configurado: define EXPO_PUBLIC_SUPABASE_URL y ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY en tu archivo .env (ver .env.example). ' +
      'La app seguirá con datos locales de respaldo.'
  );
}

// En web no hay AsyncStorage nativo; supabase-js usa localStorage por defecto,
// así que solo inyectamos el storage de AsyncStorage fuera de web.
const authStorage = Platform.OS === 'web' ? undefined : AsyncStorage;

export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'public-anon-key',
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Los deep links de OTP/magic link se manejan explícitamente; en móvil no
      // hay URL de la que detectar la sesión al arrancar.
      detectSessionInUrl: Platform.OS === 'web',
    },
  }
);

export type { Database };

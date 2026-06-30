import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase.
 *
 * Las credenciales se leen de variables de entorno públicas de Expo
 * (prefijo EXPO_PUBLIC_). Defínelas en un archivo .env (ver .env.example):
 *   EXPO_PUBLIC_SUPABASE_URL=...
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY=...
 *
 * Mientras no estén configuradas, `isSupabaseConfigured` es false y la app
 * sigue funcionando con los datos mock en memoria (store/appState).
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// En nativo usamos AsyncStorage; en web dejamos el storage por defecto
// (localStorage en el navegador, memoria durante el prerender estático en Node).
// Esto evita que AsyncStorage se invoque en un entorno sin módulos nativos.
const authOptions =
  Platform.OS === 'web'
    ? { autoRefreshToken: isSupabaseConfigured, persistSession: isSupabaseConfigured, detectSessionInUrl: false }
    : { storage: AsyncStorage, autoRefreshToken: isSupabaseConfigured, persistSession: isSupabaseConfigured, detectSessionInUrl: false };

export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'public-anon-placeholder',
  { auth: authOptions }
);

import AsyncStorage from '@react-native-async-storage/async-storage';

// Claves de persistencia local. Centralizadas para evitar colisiones
// y facilitar migraciones cuando cambie la forma de los datos.
export const STORAGE_KEYS = {
  user: 'uturn/user',
  appState: 'uturn/app-state',
} as const;

export async function loadJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (error) {
    console.warn(`No se pudo leer "${key}" desde AsyncStorage`, error);
    return null;
  }
}

export async function saveJSON(key: string, value: unknown): Promise<void> {
  try {
    if (value === null || value === undefined) {
      await AsyncStorage.removeItem(key);
      return;
    }
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`No se pudo guardar "${key}" en AsyncStorage`, error);
  }
}

export async function removeStored(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.warn(`No se pudo eliminar "${key}" de AsyncStorage`, error);
  }
}

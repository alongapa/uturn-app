import * as Location from 'expo-location';
import { useCallback } from 'react';
import { Alert, Linking, Platform } from 'react-native';

/**
 * Permiso de ubicación pedido EN CONTEXTO.
 *
 * El problema que resuelve: `services/location.ts` llama directo a
 * `requestForegroundPermissionsAsync()` dentro de geocode/watch, así que el
 * diálogo del sistema aparecía sin ninguna explicación previa — y en iOS solo
 * se puede preguntar UNA vez. Quien toca "No permitir" por reflejo deja el
 * buscador de viajes inservible para siempre, porque el segundo intento ni
 * siquiera muestra el diálogo.
 *
 * Este hook antepone una explicación propia y, si ya fue denegado antes, ofrece
 * abrir Ajustes en vez de llamar a una API que no va a mostrar nada.
 */
export function useLocationPermission() {
  /**
   * Asegura el permiso, explicando antes por qué se pide.
   * @param reason Para qué se necesita, en la voz de la pantalla que lo pide.
   * @returns true si quedó concedido.
   */
  const ensurePermission = useCallback(async (reason: string): Promise<boolean> => {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status === 'granted') return true;

    // Ya lo denegó y el sistema no volverá a preguntar: el único camino real
    // es Ajustes. Insistir con requestForeground... resolvería 'denied' al
    // instante y parecería que la app ignora el toque.
    if (!current.canAskAgain) {
      return new Promise((resolve) => {
        Alert.alert(
          'Ubicación desactivada',
          `${reason}\n\nActívala en los ajustes del sistema para Unities.`,
          [
            { text: 'Ahora no', style: 'cancel', onPress: () => resolve(false) },
            {
              text: 'Abrir ajustes',
              onPress: () => {
                void Linking.openSettings();
                resolve(false);
              },
            },
          ]
        );
      });
    }

    const accepted = await new Promise<boolean>((resolve) => {
      Alert.alert('Usar tu ubicación', reason, [
        { text: 'Ahora no', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continuar', onPress: () => resolve(true) },
      ]);
    });
    if (!accepted) return false;

    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  }, []);

  /** Ubicación actual, pidiendo permiso con explicación si hace falta. */
  const getPosition = useCallback(
    async (reason: string) => {
      const granted = await ensurePermission(reason);
      if (!granted) return null;
      try {
        return await Location.getCurrentPositionAsync({
          // Balanced y no High: para elegir un punto de encuentro sobra, y en
          // Android el fix de alta precisión puede tardar varios segundos.
          accuracy: Location.Accuracy.Balanced,
        });
      } catch {
        // GPS apagado o sin señal: la pantalla cae a la búsqueda manual.
        return null;
      }
    },
    [ensurePermission]
  );

  return {
    ensurePermission,
    getPosition,
    /** En web el permiso lo maneja el navegador con su propio diálogo. */
    isSupported: Platform.OS !== 'web',
  };
}

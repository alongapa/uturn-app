import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useContext, useMemo } from 'react';
import { useWindowDimensions, type ViewStyle } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { Layout, sizeClassFor, type SizeClass } from '@/constants/theme';

export type LayoutMetrics = {
  /** Ancho de ventana actual (cambia al rotar y en web). */
  width: number;
  sizeClass: SizeClass;
  isTablet: boolean;
  /** Insets crudos del dispositivo (notch, home indicator). */
  insets: EdgeInsets;
  /** Margen horizontal de pantalla para esta clase de dispositivo. */
  screenPadding: number;
  /** Espacio a reservar arriba: notch / status bar. */
  topSpacing: number;
  /**
   * Espacio a reservar abajo. **Fuente única**: si la pantalla vive dentro del
   * navegador de tabs devuelve la altura real del tab bar (que ya incluye el
   * inset inferior); si no, devuelve el inset. Nunca la suma de ambos — sumarlos
   * es lo que producía los `paddingBottom: 90/48/40` hardcodeados.
   */
  bottomSpacing: number;
  /** true si la pantalla está montada dentro del navegador de tabs. */
  hasTabBar: boolean;
  /** Centra y limita el ancho de la columna de contenido en pantallas grandes. */
  contentWidthStyle: ViewStyle;
};

/**
 * Métricas de layout de una pantalla: margen horizontal responsivo, safe area
 * y ancho máximo de contenido.
 *
 * Reemplaza tres patrones que convivían en el código: `SafeAreaView`,
 * `paddingBottom` hardcodeado para el tab bar, y márgenes horizontales fijos
 * distintos por pantalla.
 */
export function useLayout(): LayoutMetrics {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // useContext en vez de useBottomTabBarHeight(): el hook lanza una excepción
  // fuera de un navegador de tabs, y el mismo componente puede montarse en el
  // stack raíz. Aquí `undefined` simplemente significa "sin tab bar".
  const tabBarHeight = useContext(BottomTabBarHeightContext);

  return useMemo(() => {
    const sizeClass = sizeClassFor(width);
    return {
      width,
      sizeClass,
      isTablet: sizeClass === 'tablet',
      insets,
      screenPadding: Layout.screenPadding[sizeClass],
      topSpacing: insets.top,
      bottomSpacing: tabBarHeight ?? insets.bottom,
      hasTabBar: tabBarHeight !== undefined,
      contentWidthStyle: {
        width: '100%',
        maxWidth: Layout.maxContentWidth,
        alignSelf: 'center',
      },
    };
  }, [width, insets, tabBarHeight]);
}

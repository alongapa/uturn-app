/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const navy = '#0A1525';
const accent = '#246BFD';
const tintColorLight = accent;
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#0f172a',
    background: '#ffffff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: navy,
    tabIconSelected: accent,
    border: '#E2E8F0',
  },
  dark: {
    text: '#ECEDEE',
    background: '#0A0F1A',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#6B7280',
    tabIconSelected: tintColorDark,
  },
};

/**
 * Escala de espaciado de 9 pasos. Los seis pasos "redondos" (4/8/12/16/24/32)
 * son la escala objetivo; los tres intermedios (`xsPlus` 6, `smPlus` 10,
 * `mdPlus` 14) existen porque esos tres valores aparecen ~330 veces en el
 * código actual y normalizarlos movería píxeles en decenas de pantallas sin QA
 * visual de por medio. Son deuda declarada, no diseño: al migrar una pantalla,
 * usa los pasos redondos para todo lo nuevo y deja los intermedios solo donde
 * ya estaban. La normalización a 6 pasos queda pendiente para después del piloto.
 */
export const Spacing = {
  xs: 4,
  xsPlus: 6,
  sm: 8,
  smPlus: 10,
  md: 12,
  mdPlus: 14,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Anchos de corte para el margen horizontal de pantalla. */
export const Breakpoints = {
  /** Bajo este ancho el teléfono es "chico" (iPhone SE ≈ 320-375). */
  small: 360,
  /** Desde este ancho tratamos el dispositivo como tablet. */
  tablet: 768,
} as const;

export type SizeClass = 'small' | 'normal' | 'tablet';

export function sizeClassFor(width: number): SizeClass {
  if (width >= Breakpoints.tablet) return 'tablet';
  if (width < Breakpoints.small) return 'small';
  return 'normal';
}

export const Layout = {
  /**
   * Margen horizontal de pantalla por clase de dispositivo. Es el único valor
   * que debería variar con el ancho; el espaciado interno de las tarjetas usa
   * la escala fija.
   */
  screenPadding: {
    small: Spacing.md,
    normal: Spacing.lg,
    tablet: Spacing.xl,
  },
  /**
   * Ancho máximo de una columna de contenido. En tablet el contenido se centra
   * en vez de estirarse de borde a borde (feed, listas, formularios).
   */
  maxContentWidth: 640,
  /** Mínimo táctil recomendado por las HIG de iOS y Material. */
  touchTarget: 44,
  /** hitSlop por defecto para íconos que se dibujan más chicos que 44pt. */
  hitSlop: { top: Spacing.sm, bottom: Spacing.sm, left: Spacing.sm, right: Spacing.sm },
} as const;

export function screenPaddingFor(width: number): number {
  return Layout.screenPadding[sizeClassFor(width)];
}

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const Typography = {
  title: { fontSize: 22, fontWeight: '700' },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 14, fontWeight: '400' },
  caption: { fontSize: 12, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600' },
} as const;

export const Shadow = {
  card: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
} as const;

// Paleta semántica de estado, compartida por Badge y por las pantallas que
// muestran estados de pago/viaje/verificación (evita valores duplicados).
export const StatusColors = {
  success: { bg: '#DCFCE7', fg: '#16a34a' },
  warning: { bg: '#FEF9C3', fg: '#92400e' },
  danger: { bg: '#FEE2E2', fg: '#b91c1c' },
  info: { bg: '#EDE9FE', fg: '#7c3aed' },
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

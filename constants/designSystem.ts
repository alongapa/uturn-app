/**
 * Sistema de diseño UTurn — estilo moderno de app de movilidad (Uber/Cabify).
 * Tokens centralizados: usa estos valores en vez de hardcodear colores/medidas.
 */

export const COLORS = {
  // Superficies
  bg: '#F4F6FA',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F5F9',

  // Marca / acento
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primarySoft: '#E8EFFE',
  ink: '#0B1220',
  inkSurface: '#111A2E',

  // Texto
  text: '#0B1220',
  textMuted: '#5B6678',
  textSubtle: '#8A94A6',
  onDark: '#FFFFFF',
  onDarkMuted: '#9AA6BC',

  // Semánticos
  success: '#10B981',
  successSoft: '#E7F8F1',
  warning: '#F59E0B',
  warningSoft: '#FEF6E7',
  danger: '#EF4444',
  dangerSoft: '#FDECEC',

  // Bordes
  border: '#E6EAF1',
  borderStrong: '#D4DAE6',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const RADII = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const TYPE = {
  display: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5, color: COLORS.text },
  title: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.3, color: COLORS.text },
  heading: { fontSize: 17, fontWeight: '700' as const, color: COLORS.text },
  body: { fontSize: 15, fontWeight: '400' as const, color: COLORS.textMuted },
  label: { fontSize: 13, fontWeight: '600' as const, color: COLORS.textMuted },
  caption: { fontSize: 12, fontWeight: '500' as const, color: COLORS.textSubtle },
} as const;

export const SHADOW = {
  card: {
    shadowColor: '#0B1220',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#0B1220',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

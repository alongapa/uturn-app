import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Radius, Spacing } from '@/constants/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type EmptyStateProps = {
  icon: IoniconName;
  title: string;
  /** Por qué está vacío y qué esperar. Evita el "no hay nada" a secas. */
  message: string;
  /** Acción sugerida. Sin ella el estado vacío es solo informativo. */
  actionLabel?: string;
  onAction?: () => void;
  /**
   * `compact` para secciones dentro de una pantalla con más contenido;
   * el modo normal es para una lista que ocupa la pantalla entera.
   */
  compact?: boolean;
  /** Estado vacío "bueno" (nada pendiente) en vez de "falta contenido". */
  tone?: 'neutral' | 'positive';
  style?: StyleProp<ViewStyle>;
};

const TONE_COLORS = {
  neutral: { bg: '#F1F5F9', fg: '#64748B' },
  positive: { bg: '#DCFCE7', fg: '#16A34A' },
} as const;

/**
 * Estado vacío con ícono, título, explicación y acción opcional.
 *
 * En el piloto casi todas las listas arrancan vacías, así que una pantalla en
 * blanco se lee como app rota: el texto debe explicar *por qué* está vacío y
 * ofrecer la siguiente acción, no solo constatar la ausencia de datos.
 */
export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  compact = false,
  tone = 'neutral',
  style,
}: EmptyStateProps) {
  const colors = TONE_COLORS[tone];
  return (
    <View
      style={[styles.container, compact && styles.containerCompact, style]}
      accessibilityRole="summary"
      accessibilityLabel={`${title}. ${message}`}
    >
      <View
        style={[
          styles.iconCircle,
          compact && styles.iconCircleCompact,
          { backgroundColor: colors.bg },
        ]}
      >
        <Ionicons name={icon} size={compact ? 20 : 28} color={colors.fg} />
      </View>
      <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
      <Text style={[styles.message, compact && styles.messageCompact]}>{message}</Text>
      {actionLabel && onAction && (
        <Button label={actionLabel} onPress={onAction} style={styles.action} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
  },
  containerCompact: {
    paddingVertical: Spacing.lg,
    gap: Spacing.xs,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  iconCircleCompact: {
    width: 40,
    height: 40,
    marginBottom: 0,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: 15,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 320,
  },
  messageCompact: {
    fontSize: 13,
    lineHeight: 18,
  },
  action: {
    marginTop: Spacing.sm,
    minHeight: 44,
    paddingHorizontal: Spacing.xl,
  },
});

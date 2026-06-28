import React from 'react';
import { Text, TouchableOpacity, StyleSheet, ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, RADII } from '@/constants/designSystem';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function AppButton({
  label, onPress, variant = 'primary', icon, loading, disabled, fullWidth = true, style,
}: Props) {
  const palette = VARIANTS[variant];
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        { backgroundColor: palette.bg, borderColor: palette.border },
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.content}>
          {icon && <Ionicons name={icon} size={18} color={palette.fg} />}
          <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const VARIANTS: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: COLORS.primary, fg: '#FFFFFF', border: COLORS.primary },
  secondary: { bg: COLORS.ink, fg: '#FFFFFF', border: COLORS.ink },
  outline: { bg: 'transparent', fg: COLORS.primary, border: COLORS.primary },
  ghost: { bg: COLORS.surfaceMuted, fg: COLORS.text, border: COLORS.surfaceMuted },
  danger: { bg: 'transparent', fg: COLORS.danger, border: COLORS.danger },
};

const styles = StyleSheet.create({
  base: {
    height: 54,
    borderRadius: RADII.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  fullWidth: { alignSelf: 'stretch' },
  disabled: { opacity: 0.5 },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 16, fontWeight: '700' },
});

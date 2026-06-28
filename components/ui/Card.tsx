import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { COLORS, RADII, SPACING, SHADOW } from '@/constants/designSystem';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  dark?: boolean;
  padded?: boolean;
}

export function Card({ children, style, dark, padded = true }: Props) {
  return (
    <View
      style={[
        styles.base,
        padded && styles.padded,
        dark ? styles.dark : styles.light,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: RADII.lg },
  padded: { padding: SPACING.lg },
  light: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.card },
  dark: { backgroundColor: COLORS.inkSurface },
});

import React from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';

import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';

type CardVariant = 'default' | 'highlight' | 'warning';

type CardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: CardVariant;
  onPress?: () => void;
  disabled?: boolean;
};

export function Card({ children, style, variant = 'default', onPress, disabled }: CardProps) {
  const content = <View style={[styles.base, styles[variant], style]}>{children}</View>;

  if (!onPress) return content;

  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.7}>
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#ffffff',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  default: {},
  highlight: {
    borderColor: Colors.light.tint,
  },
  warning: {
    borderColor: '#fcd34d',
    backgroundColor: '#fffbeb',
  },
});

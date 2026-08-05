import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';

type ButtonVariant = 'primary' | 'secondary' | 'destructive';
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: IoniconName;
  style?: StyleProp<ViewStyle>;
};

const TEXT_COLOR: Record<ButtonVariant, string> = {
  primary: '#ffffff',
  secondary: '#0A1525',
  destructive: '#b45309',
};

export function Button({ label, onPress, variant = 'primary', disabled, loading, icon, style }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      style={[styles.base, styles[variant], isDisabled && styles.disabled, style]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
    >
      {loading ? (
        <ActivityIndicator size="small" color={TEXT_COLOR[variant]} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={16} color={TEXT_COLOR[variant]} />}
          <Text style={[styles.label, { color: TEXT_COLOR[variant] }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.lg,
  },
  primary: {
    backgroundColor: '#0A1525',
  },
  secondary: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  destructive: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontWeight: '700',
  },
});

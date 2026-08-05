import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Radius, StatusColors } from '@/constants/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type BadgeProps = {
  label: string;
  tone: keyof typeof StatusColors;
  icon?: IoniconName;
  style?: StyleProp<ViewStyle>;
};

export function Badge({ label, tone, icon, style }: BadgeProps) {
  const { bg, fg } = StatusColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      {icon && <Ionicons name={icon} size={13} color={fg} />}
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '700',
  },
});

import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

import { COLORS } from '@/constants/designSystem';

interface Props {
  name: string;
  uri?: string;
  size?: number;
  dark?: boolean;
}

export function Avatar({ name, uri, size = 48, dark }: Props) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }

  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: dark ? COLORS.primary : COLORS.primarySoft,
        },
      ]}
    >
      <Text style={[styles.txt, { color: dark ? '#FFFFFF' : COLORS.primary, fontSize: size * 0.38 }]}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  txt: { fontWeight: '800' },
});

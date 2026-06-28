import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { TIER_COLORS, TIER_LABELS, type ReputationTier } from '@/models/types';
import { RADII } from '@/constants/designSystem';

interface Props {
  tier: ReputationTier;
  solid?: boolean;
  size?: 'sm' | 'md';
}

export function TierBadge({ tier, solid, size = 'md' }: Props) {
  const color = TIER_COLORS[tier];
  const small = size === 'sm';
  return (
    <View
      style={[
        styles.base,
        small ? styles.sm : styles.md,
        { backgroundColor: solid ? color : color + '1F' },
      ]}
    >
      <Ionicons name="shield-checkmark" size={small ? 11 : 13} color={solid ? '#fff' : color} />
      <Text style={[styles.txt, { color: solid ? '#fff' : color, fontSize: small ? 10 : 12 }]}>
        {TIER_LABELS[tier]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: RADII.pill },
  sm: { paddingHorizontal: 7, paddingVertical: 3 },
  md: { paddingHorizontal: 10, paddingVertical: 5 },
  txt: { fontWeight: '700' },
});

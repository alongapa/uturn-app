import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { ANNOUNCEMENT_CATEGORY_LABELS, type AnnouncementCategory } from '@/models/types';
import { COLORS, RADII } from '@/constants/designSystem';

const CATEGORY_COLOR: Record<AnnouncementCategory, string> = {
  anuncio: COLORS.primary,
  promocion: COLORS.warning,
  evento: '#8B5CF6',
  descuento: COLORS.success,
};

export function CategoryPill({ category }: { category: AnnouncementCategory }) {
  const color = CATEGORY_COLOR[category];
  return (
    <View style={[styles.pill, { backgroundColor: color + '1F' }]}>
      <Text style={[styles.txt, { color }]}>{ANNOUNCEMENT_CATEGORY_LABELS[category]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', borderRadius: RADII.sm, paddingHorizontal: 8, paddingVertical: 3 },
  txt: { fontSize: 11, fontWeight: '700' },
});

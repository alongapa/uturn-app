import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { FeedStoryGroup } from '@/services/api/feed';
import { PublisherAvatar } from './publisher-avatar';

type Props = {
  groups: FeedStoryGroup[];
  onOpen: (groupIndex: number) => void;
};

/** Fila horizontal de historias: círculo con anillo por publisher. */
export function StoriesRow({ groups, onOpen }: Props) {
  if (groups.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.row}
      contentContainerStyle={styles.content}
    >
      {groups.map((group, index) => (
        <TouchableOpacity
          key={group.publisher.id}
          style={styles.item}
          onPress={() => onOpen(index)}
          accessibilityLabel={`Historias de ${group.publisher.name}`}
        >
          <View style={styles.ring}>
            <PublisherAvatar publisher={group.publisher} size={58} />
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {group.publisher.name}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexGrow: 0 },
  content: { paddingHorizontal: 12, paddingVertical: 10, gap: 14 },
  item: { alignItems: 'center', width: 72 },
  ring: {
    padding: 3,
    borderRadius: 36,
    borderWidth: 2.5,
    borderColor: '#246BFD',
    backgroundColor: '#ffffff',
  },
  name: { marginTop: 4, fontSize: 11, color: '#0f172a', fontWeight: '600' },
});

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { track } from '@/services/api/analytics';
import type { FeedStoryGroup } from '@/services/api/feed';
import { timeAgo } from './feed-utils';
import { PublisherAvatar } from './publisher-avatar';

type Props = {
  groups: FeedStoryGroup[];
  /** Índice del grupo con que se abre el visor; null = cerrado. */
  initialGroupIndex: number | null;
  onClose: () => void;
};

/**
 * Visor de historias a pantalla completa. Avance por toque: el tercio
 * izquierdo retrocede, el resto avanza; al agotar las historias de un
 * publisher pasa al siguiente y al final se cierra.
 */
export function StoryViewer({ groups, initialGroupIndex, onClose }: Props) {
  const [groupIndex, setGroupIndex] = useState(0);
  const [storyIndex, setStoryIndex] = useState(0);

  useEffect(() => {
    if (initialGroupIndex !== null) {
      setGroupIndex(initialGroupIndex);
      setStoryIndex(0);
    }
  }, [initialGroupIndex]);

  const visible = initialGroupIndex !== null;
  const group = groups[groupIndex];
  const story = group?.stories[storyIndex];

  const activeStoryId = story?.id;
  const activePublisherId = group?.publisher.id;
  useEffect(() => {
    if (!visible || !activeStoryId || !activePublisherId) return;
    track({ eventType: 'view', entityType: 'story', entityId: activeStoryId, publisherId: activePublisherId });
  }, [visible, activeStoryId, activePublisherId]);

  if (!visible || !group || !story) {
    if (visible) onClose();
    return null;
  }

  const goNext = () => {
    if (storyIndex < group.stories.length - 1) {
      setStoryIndex(storyIndex + 1);
    } else if (groupIndex < groups.length - 1) {
      setGroupIndex(groupIndex + 1);
      setStoryIndex(0);
    } else {
      onClose();
    }
  };

  const goBack = () => {
    if (storyIndex > 0) {
      setStoryIndex(storyIndex - 1);
    } else if (groupIndex > 0) {
      const prevGroup = groups[groupIndex - 1];
      setGroupIndex(groupIndex - 1);
      setStoryIndex(Math.max(prevGroup.stories.length - 1, 0));
    }
  };

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.container}>
        <Image source={{ uri: story.mediaUrl }} style={styles.media} contentFit="cover" />

        {/* Zonas de toque: 1/3 izquierdo atrás, 2/3 derecho adelante */}
        <View style={styles.tapZones}>
          <Pressable style={styles.tapBack} onPress={goBack} />
          <Pressable style={styles.tapNext} onPress={goNext} />
        </View>

        <View style={styles.topBar} pointerEvents="box-none">
          <View style={styles.progressRow}>
            {group.stories.map((s, i) => (
              <View
                key={s.id}
                style={[styles.progressSegment, i <= storyIndex && styles.progressFilled]}
              />
            ))}
          </View>
          <View style={styles.headerRow}>
            <PublisherAvatar publisher={group.publisher} size={34} />
            <View style={styles.headerText}>
              <Text style={styles.publisherName}>{group.publisher.name}</Text>
              <Text style={styles.timestamp}>{timeAgo(story.createdAt)}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Cerrar historias">
              <Ionicons name="close" size={28} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        {story.caption ? (
          <View style={styles.captionWrapper} pointerEvents="none">
            <Text style={styles.caption}>{story.caption}</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  media: { ...StyleSheet.absoluteFillObject },
  tapZones: { ...StyleSheet.absoluteFillObject, flexDirection: 'row' },
  tapBack: { flex: 1 },
  tapNext: { flex: 2 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, padding: 14, paddingTop: 48, gap: 10 },
  progressRow: { flexDirection: 'row', gap: 4 },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  progressFilled: { backgroundColor: '#ffffff' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerText: { flex: 1 },
  publisherName: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
  timestamp: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  captionWrapper: {
    position: 'absolute',
    bottom: 48,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    padding: 12,
  },
  caption: { color: '#ffffff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
});

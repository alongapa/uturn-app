import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type { GalleryFolder } from '@/services/api/feed';
import { PublisherAvatar } from './publisher-avatar';

type Props = {
  folders: GalleryFolder[];
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = 170;

/**
 * Widget de galería (Sesión 5): carpetas de contenido enlazadas al feed
 * (content_folders.linked_widget = 'galeria'). Tocar una colección abre un
 * visor a pantalla completa con paginación horizontal.
 */
export function FoldersWidget({ folders }: Props) {
  const [open, setOpen] = useState<GalleryFolder | null>(null);
  const [index, setIndex] = useState(0);

  if (folders.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Colecciones 📸</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carousel}
        snapToInterval={CARD_WIDTH + 10}
        decelerationRate="fast"
      >
        {folders.map((folder) => (
          <TouchableOpacity
            key={folder.id}
            style={styles.card}
            onPress={() => {
              setIndex(0);
              setOpen(folder);
            }}
          >
            <Image source={{ uri: folder.items[0]?.mediaUrl }} style={styles.cover} contentFit="cover" />
            <View style={styles.cardOverlay}>
              <Text style={styles.cardName} numberOfLines={2}>
                {folder.name}
              </Text>
              <View style={styles.cardMetaRow}>
                <PublisherAvatar publisher={folder.publisher} size={16} />
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {folder.publisher.name} · {folder.items.length}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={open !== null} animationType="fade" onRequestClose={() => setOpen(null)}>
        {open && (
          <View style={styles.viewer}>
            <FlatList
              data={open.items}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.viewerPage}>
                  <Image source={{ uri: item.mediaUrl }} style={styles.viewerImage} contentFit="contain" />
                  {item.caption ? <Text style={styles.viewerCaption}>{item.caption}</Text> : null}
                </View>
              )}
              onMomentumScrollEnd={(e) =>
                setIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))
              }
            />
            <View style={styles.viewerTop}>
              <View style={styles.viewerHeadText}>
                <Text style={styles.viewerTitle} numberOfLines={1}>
                  {open.name}
                </Text>
                <Text style={styles.viewerMeta}>
                  {open.publisher.name} · {index + 1}/{open.items.length}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setOpen(null)} hitSlop={12}>
                <Ionicons name="close" size={28} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, paddingVertical: 8 },
  title: { fontSize: 16, fontWeight: '800', color: '#0f172a', paddingHorizontal: 16 },
  carousel: { paddingHorizontal: 16, gap: 10 },
  card: {
    width: CARD_WIDTH,
    height: 190,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  cover: { ...StyleSheet.absoluteFillObject },
  cardOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 10,
    gap: 5,
    backgroundColor: 'rgba(2,6,23,0.28)',
  },
  cardName: { color: '#ffffff', fontWeight: '800', fontSize: 14, lineHeight: 18 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardMeta: { color: 'rgba(255,255,255,0.85)', fontSize: 11, flexShrink: 1 },
  viewer: { flex: 1, backgroundColor: '#020617' },
  viewerPage: { width: SCREEN_WIDTH, justifyContent: 'center' },
  viewerImage: { width: SCREEN_WIDTH, height: '80%' },
  viewerCaption: {
    color: '#e2e8f0',
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingTop: 10,
    fontSize: 14,
  },
  viewerTop: {
    position: 'absolute',
    top: 54,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  viewerHeadText: { flex: 1, gap: 2 },
  viewerTitle: { color: '#ffffff', fontWeight: '800', fontSize: 16 },
  viewerMeta: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
});

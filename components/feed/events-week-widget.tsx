import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { track } from '@/services/api/analytics';
import type { FeedPost } from '@/services/api/feed';
import { formatEventDate } from './feed-utils';

type Props = {
  events: FeedPost[];
  /** Se llama además de registrar la analítica del toque (p. ej. abrir el post). */
  onPressEvent?: (event: FeedPost) => void;
};

/**
 * Widget fijo del feed: carrusel con los posts tipo evento de los próximos
 * 7 días ("Qué te espera esta semana"). Desde la Sesión 5 el orden, los
 * fijados y los destacados vienen de widget_config (panel admin).
 */
export function EventsWeekWidget({ events, onPressEvent }: Props) {
  if (events.length === 0) return null;

  const handlePress = (event: FeedPost) => {
    track({
      eventType: 'click',
      entityType: 'widget',
      entityId: event.id,
      publisherId: event.publisher.id,
      category: 'eventos_semana',
    });
    onPressEvent?.(event);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Qué te espera esta semana en la UAI 🎓</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carousel}
        snapToInterval={CARD_WIDTH + 10}
        decelerationRate="fast"
      >
        {events.map((event) => (
          <TouchableOpacity key={event.id} style={styles.card} onPress={() => handlePress(event)} activeOpacity={0.85}>
            {event.media[0] ? (
              <Image source={{ uri: event.media[0] }} style={styles.cardImage} contentFit="cover" />
            ) : (
              <View style={[styles.cardImage, styles.cardImageFallback]}>
                <Ionicons name="calendar-outline" size={34} color="#7c3aed" />
              </View>
            )}
            {event.destacado && (
              <View style={styles.featuredChip}>
                <Ionicons name="star" size={10} color="#ffffff" />
                <Text style={styles.featuredChipText}>Destacado</Text>
              </View>
            )}
            <View style={styles.cardBody}>
              <View style={styles.dateChip}>
                <Ionicons name="calendar-outline" size={12} color="#7c3aed" />
                <Text style={styles.dateChipText}>
                  {event.eventoFecha ? formatEventDate(event.eventoFecha) : 'Por confirmar'}
                </Text>
              </View>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {event.texto}
              </Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {event.publisher.name}
                {event.eventoLugar ? ` · ${event.eventoLugar}` : ''}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const CARD_WIDTH = 250;

const styles = StyleSheet.create({
  container: { gap: 8, paddingVertical: 8 },
  title: { fontSize: 16, fontWeight: '800', color: '#0f172a', paddingHorizontal: 16 },
  carousel: { paddingHorizontal: 16, gap: 10 },
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  cardImage: { width: '100%', height: 110 },
  cardImageFallback: {
    backgroundColor: '#ede9fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredChip: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f59e0b',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  featuredChipText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  cardBody: { padding: 10, gap: 6 },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#ede9fe',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dateChipText: { color: '#7c3aed', fontSize: 11, fontWeight: '700' },
  cardTitle: { color: '#0f172a', fontWeight: '700', fontSize: 13, lineHeight: 18 },
  cardMeta: { color: '#64748b', fontSize: 12 },
});

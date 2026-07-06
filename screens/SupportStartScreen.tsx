import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { SupportCategory } from '@/services/api/messages';
import { SUPPORT_CATEGORIES, startSupport } from '@/services/api/messages';

/**
 * Soporte Unities (Sesión 6): elige la categoría y se abre (o retoma) el
 * ticket con el equipo admin/owner. El estado abierto/resuelto vive en la
 * conversación y se gestiona desde el chat.
 */
export default function SupportStartScreen() {
  const [opening, setOpening] = useState<SupportCategory | null>(null);

  const open = (category: SupportCategory) => {
    if (opening) return;
    setOpening(category);
    startSupport(category)
      .then((conversation) =>
        router.replace({ pathname: '/chat/[id]', params: { id: conversation.id } })
      )
      .catch(() => {
        Alert.alert('No se pudo abrir el ticket. Intenta de nuevo.');
        setOpening(null);
      });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="headset" size={26} color="#ffffff" />
        </View>
        <Text style={styles.heroTitle}>Soporte Unities</Text>
        <Text style={styles.heroSubtitle}>
          El equipo Unities te responde por chat. Elige el tema de tu consulta:
        </Text>
      </View>

      {SUPPORT_CATEGORIES.map((category) => (
        <TouchableOpacity
          key={category.id}
          style={styles.card}
          onPress={() => open(category.id)}
          disabled={opening !== null}
        >
          <Text style={styles.cardEmoji}>{category.emoji}</Text>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{category.label}</Text>
            <Text style={styles.cardHint}>{category.hint}</Text>
          </View>
          <Ionicons
            name={opening === category.id ? 'hourglass' : 'chevron-forward'}
            size={18}
            color="#94a3b8"
          />
        </TouchableOpacity>
      ))}

      <Text style={styles.note}>
        Si ya tienes un ticket abierto en una categoría, se retoma esa misma conversación.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  hero: { alignItems: 'center', gap: 8, marginBottom: 10 },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0A1525',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  heroSubtitle: { color: '#475569', textAlign: 'center', paddingHorizontal: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
  },
  cardEmoji: { fontSize: 24 },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontWeight: '800', color: '#0f172a', fontSize: 15 },
  cardHint: { color: '#64748b', fontSize: 13 },
  note: { color: '#94a3b8', fontSize: 12, textAlign: 'center', marginTop: 8 },
});

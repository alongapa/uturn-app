import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useAppState } from '@/store/appState';

const STARS = [1, 2, 3, 4, 5];

export default function RateScreen() {
  const { bookingId, tripId, toId } = useLocalSearchParams<{
    bookingId?: string;
    tripId?: string;
    toId?: string;
  }>();
  const { addRating } = useAppState();
  const [score, setScore] = useState(4);
  const [comment, setComment] = useState('');

  const handleSubmit = () => {
    addRating({
      bookingId,
      tripId,
      toId,
      stars: score,
      comment: comment.trim() || undefined,
    });
    Alert.alert('¡Gracias por tu opinión!', 'Tu calificación suma puntos a tu reputación.');
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/my-trips');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>Calificar viaje</Text>
        <Text style={styles.subtitle}>Comparte tu experiencia para mejorar la comunidad.</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Evaluación general</Text>
          <View style={styles.starsRow}>
            {STARS.map((value) => (
              <TouchableOpacity key={value} onPress={() => setScore(value)}>
                <Ionicons
                  name={value <= score ? 'star' : 'star-outline'}
                  size={32}
                  color={value <= score ? '#fbbf24' : '#475569'}
                />
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.scoreText}>{score} / 5</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Comentarios adicionales"
            placeholderTextColor="#94a3b8"
            multiline
            numberOfLines={4}
            value={comment}
            onChangeText={setComment}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={handleSubmit}>
            <Text style={styles.primaryButtonText}>Enviar opinión</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    flex: 1,
    padding: 24,
    gap: 16,
  },
  title: {
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94a3b8',
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 20,
    gap: 14,
  },
  cardLabel: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  scoreText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  textArea: {
    backgroundColor: '#020617',
    borderRadius: 14,
    padding: 16,
    minHeight: 120,
    color: '#f8fafc',
    textAlignVertical: 'top',
  },
  primaryButton: {
    backgroundColor: '#22d3ee',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#0f172a',
    fontWeight: '700',
  },
});

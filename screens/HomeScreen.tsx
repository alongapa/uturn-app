import React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { router } from 'expo-router';

import { useAppState } from '@/store/appState';

export default function HomeScreen() {
  const { currentUser } = useAppState();
  const userName = currentUser?.nombre ?? 'Usuario';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.header} onPress={() => router.push('/profile')}>
        <Image source={require('../assets/images/uturn-logo.png')} style={styles.logo} />
        <View>
          <Text style={styles.greetingLabel}>Hola,</Text>
          <Text style={styles.greeting}>{userName}</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>Bienvenido a U-TURN</Text>
        <Text style={styles.subtitle}>Elige cómo quieres usar la app hoy</Text>
      </View>

      <View style={styles.cardsRow}>
        <View style={styles.card}>
          <Text style={styles.cardIcon}>🚗</Text>
          <Text style={styles.cardTitle}>Conductor</Text>
          <Text style={styles.cardText}>Publica tus viajes y comparte gastos</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/driver')}>
            <Text style={styles.primaryText}>Entrar como Conductor</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardIcon}>🧑‍🤝‍🧑</Text>
          <Text style={styles.cardTitle}>Pasajero</Text>
          <Text style={styles.cardText}>Reserva viajes y llega a tu campus</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/passenger')}>
            <Text style={styles.primaryText}>Entrar como Pasajero</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>¿Por qué usar U-TURN?</Text>
        <View style={styles.benefitsGrid}>
          {benefits.map((benefit) => (
            <View key={benefit.title} style={styles.benefitCard}>
              <Text style={styles.benefitIcon}>{benefit.icon}</Text>
              <Text style={styles.benefitTitle}>{benefit.title}</Text>
              <Text style={styles.benefitSubtitle}>{benefit.subtitle}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const benefits = [
  {
    title: 'Ahorra dinero',
    subtitle: 'Comparte gastos en cada viaje',
    icon: '💸',
  },
  {
    title: 'Pagos seguros',
    subtitle: 'Flujo de pago formalizado',
    icon: '🔒',
  },
  {
    title: 'Reputación',
    subtitle: 'Sistema de calificaciones confiable',
    icon: '⭐',
  },
  {
    title: 'Penalizaciones',
    subtitle: 'Reglas claras ante incumplimientos',
    icon: '⏰',
  },
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fbff' },
  content: { padding: 16, paddingBottom: 48 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f0ff',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  logo: { width: 32, height: 32, resizeMode: 'contain' },
  greetingLabel: { color: '#1d4ed8', fontSize: 12 },
  greeting: { color: '#0f172a', fontSize: 16, fontWeight: '700' },
  titleBlock: { marginTop: 24, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#475569', marginTop: 6 },
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    flexWrap: 'wrap',
  },
  card: {
    flex: 1,
    minWidth: 160,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardIcon: { fontSize: 32, marginBottom: 8 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  cardText: { color: '#475569', marginVertical: 8 },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  primaryText: { textAlign: 'center', color: '#fff', fontWeight: '700' },
  section: { marginTop: 28 },
  sectionTitle: { textAlign: 'center', fontSize: 18, fontWeight: '700', color: '#0f172a' },
  benefitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  benefitCard: {
    flexBasis: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 4,
  },
  benefitIcon: { fontSize: 24 },
  benefitTitle: { fontWeight: '700', color: '#0f172a' },
  benefitSubtitle: { color: '#475569' },
});

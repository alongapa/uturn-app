import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { router } from 'expo-router';

import { useAppState } from '@/store/appState';
import conductorIcon from '../assets/icons/uturn-auto.png';
import passengerIcon from '../assets/icons/uturn-passengers.png';
import moneyIcon from '../assets/icons/uturn-money.png';
import lockIcon from '../assets/icons/uturn-lock.png';
import reputationIcon from '../assets/icons/uturn-reputation.png';
import alarmIcon from '../assets/icons/uturn-alarm.png';

const iconBackground = '#0A1525';

export default function HomeScreen() {
  const { currentUser } = useAppState();
  const userName = currentUser?.nombre ?? 'Estudiante UTURN';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.logoWrapper} onPress={() => router.push('/profile')}>
          <Image source={require('../assets/images/logomini.png')} style={styles.logo} />
        </TouchableOpacity>
        <View style={styles.greetingBlock}>
          <Text style={styles.greetingLabel}>Hola,</Text>
          <Text style={styles.greeting}>{userName}</Text>
        </View>
      </View>

      <View style={styles.widgets}>
        {roles.map((card) => (
          <View key={card.title} style={styles.widgetCard}>
            <View style={styles.widgetHeader}>
              <View style={styles.cardIconWrapper}>
                <Image source={card.icon} style={styles.cardIcon} />
              </View>
              <View style={styles.widgetText}>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardText}>{card.description}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.primaryButton} onPress={card.onPress}>
              <Text style={styles.primaryText}>{card.cta}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>¿Por qué usar U-TURN?</Text>
        <View style={styles.benefitsGrid}>
          {benefits.map((benefit) => (
            <View key={benefit.title} style={styles.benefitCard}>
              <View style={styles.benefitIconWrapper}>
                <Image source={benefit.icon} style={styles.benefitIcon} />
              </View>
              <View>
                <Text style={styles.benefitTitle}>{benefit.title}</Text>
                <Text style={styles.benefitSubtitle}>{benefit.subtitle}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const roles = [
  {
    title: 'Conductor',
    description: 'Publica viajes y propone un punto de encuentro seguro.',
    icon: conductorIcon,
    cta: 'Entrar como Conductor',
    onPress: () => router.push('/driver'),
  },
  {
    title: 'Pasajero',
    description: 'Busca rutas compatibles sin tener que definir el punto de encuentro.',
    icon: passengerIcon,
    cta: 'Entrar como Pasajero',
    onPress: () => router.push('/passenger'),
  },
];

const benefits = [
  {
    title: 'Ahorro controlado',
    subtitle: 'Comparte los gastos del viaje con transparencia.',
    icon: moneyIcon,
  },
  {
    title: 'Pagos seguros',
    subtitle: 'Cobros formales y alertas si algo falla.',
    icon: lockIcon,
  },
  {
    title: 'Reputación visible',
    subtitle: 'Construye confianza con niveles y estrellas.',
    icon: reputationIcon,
  },
  {
    title: 'Tiempo real',
    subtitle: 'Horarios claros y recordatorios puntuales.',
    icon: alarmIcon,
  },
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoWrapper: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  logo: { width: 36, height: 36, resizeMode: 'contain' },
  greetingBlock: { gap: 2 },
  greetingLabel: { color: '#1d4ed8', fontSize: 12, fontWeight: '600' },
  greeting: { color: '#0f172a', fontSize: 20, fontWeight: '800' },
  widgets: { gap: 14, marginTop: 6 },
  widgetCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  widgetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIcon: { width: 64, height: 64, resizeMode: 'contain' },
  widgetText: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  cardText: { color: '#475569', fontSize: 14 },
  primaryButton: {
    backgroundColor: '#0A1525',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  primaryText: { textAlign: 'center', color: '#fff', fontWeight: '700', fontSize: 15 },
  section: { marginTop: 8, gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  benefitsGrid: {
    gap: 10,
  },
  benefitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  benefitIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitIcon: { width: 64, height: 64, resizeMode: 'contain' },
  benefitTitle: { fontWeight: '700', color: '#0f172a', fontSize: 14 },
  benefitSubtitle: { color: '#475569', fontSize: 12 },
});

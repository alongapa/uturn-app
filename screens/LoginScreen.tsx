import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Image, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useUser } from '@/contexts/UserContext';
import { useAppState } from '@/store/appState';
import { UNIVERSITIES, CAMPUSES } from '@/constants/campuses';
import { isEmailRegistered } from '@/services/verification';
import type { User } from '@/models/types';

const DOMAIN_MAP: Record<string, string> = {
  '@alumnos.uai.cl': 'uai',
  '@udd.cl': 'udd',
  '@miuandes.cl': 'uandes',
};

const UNI_LOGOS: Record<string, any> = {
  uai: require('@/assets/images/intranet-uai.png'),
  udd: require('@/assets/images/intranet-udd.png'),
  uandes: require('@/assets/images/intranet-uandes.jpeg'),
};

export default function LoginScreen() {
  const { setUser } = useUser();
  const { dispatch } = useAppState();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const detectedUniId = Object.entries(DOMAIN_MAP).find(([d]) =>
    email.toLowerCase().endsWith(d)
  )?.[1];
  const universityInfo = UNIVERSITIES.find((u) => u.id === detectedUniId);

  async function handleLogin() {
    setError('');
    if (!name.trim()) { setError('Ingresa tu nombre completo'); return; }
    if (!detectedUniId) {
      setError('Usa tu correo institucional (@alumnos.uai.cl, @udd.cl o @miuandes.cl)');
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 500));

    const normalizedEmail = email.trim().toLowerCase();
    const preVerified = isEmailRegistered(normalizedEmail);
    const homeCampus = CAMPUSES.find((c) => c.universityId === detectedUniId);
    const mockUser: User = {
      id: 'u_' + Date.now(),
      name: name.trim(),
      email: normalizedEmail,
      university: universityInfo?.name ?? detectedUniId,
      role: 'both',
      rating: 4.7,
      reputationScore: {
        overall: 4.7, punctuality: 4.8, drivingQuality: 4.6,
        price: 4.9, disposition: 4.7, asPassenger: 4.6, asTutor: 0,
      },
      tier: 'habitual',
      completedTripsAsDriver: 23,
      completedTripsAsPassenger: 41,
      completedTutoringSessions: 0,
      badges: [
        { id: 'b1', label: 'Primer viaje', icon: '🚗', earnedAt: new Date().toISOString() },
        { id: 'b2', label: 'Puntual', icon: '⏰', earnedAt: new Date().toISOString() },
      ],
      uturnCredits: 120,
      carModel: homeCampus ? 'Mazda 3' : undefined,
      verificationStatus: preVerified ? 'verified' : 'unverified',
    };
    setUser(mockUser);
    dispatch({ type: 'REGISTER_USER', payload: mockUser });
    setLoading(false);
    // Si ya está en el padrón institucional, salta la verificación.
    router.replace(preVerified ? '/(tabs)' : '/verify-profile');
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          <View style={s.hero}>
            <Image source={require('@/assets/images/uturn-logo.png')} style={s.logo} resizeMode="contain" />
            <Text style={s.title}>UTurn</Text>
            <Text style={s.sub}>Carpooling universitario</Text>
          </View>

          <View style={s.unis}>
            {UNIVERSITIES.map((u) => (
              <View key={u.id} style={[s.uniChip, detectedUniId === u.id && s.uniActive]}>
                <Image source={UNI_LOGOS[u.id]} style={s.uniLogo} resizeMode="contain" />
              </View>
            ))}
          </View>

          <View style={s.form}>
            <Text style={s.label}>Nombre completo</Text>
            <TextInput
              style={s.input}
              placeholder="Tu nombre"
              placeholderTextColor="#94A3B8"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />

            <Text style={s.label}>Correo institucional</Text>
            <TextInput
              style={[s.input, detectedUniId ? s.inputOk : null]}
              placeholder="nombre@alumnos.uai.cl"
              placeholderTextColor="#94A3B8"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            {universityInfo && (
              <View style={s.detected}>
                <Text style={s.detectedTxt}>✓ {universityInfo.name}</Text>
              </View>
            )}

            {error ? <Text style={s.error}>{error}</Text> : null}

            <TouchableOpacity style={[s.btn, loading && s.btnOff]} onPress={handleLogin} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Ingresar</Text>}
            </TouchableOpacity>
          </View>

          <Text style={s.disclaimer}>Solo disponible para alumnos de UAI, UDD y Uandes</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32 },
  hero: { alignItems: 'center', marginTop: 48, marginBottom: 32 },
  logo: { width: 80, height: 80, marginBottom: 16 },
  title: { fontSize: 34, fontWeight: '800', color: '#0A1525', letterSpacing: -1 },
  sub: { fontSize: 15, color: '#64748B', marginTop: 4 },
  unis: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 32 },
  uniChip: {
    width: 80, height: 44, borderRadius: 10,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  uniActive: { borderColor: '#246BFD', backgroundColor: '#EFF6FF' },
  uniLogo: { width: 64, height: 32 },
  form: { gap: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 14, marginBottom: 4 },
  input: {
    height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0',
    paddingHorizontal: 14, fontSize: 15, color: '#0A1525', backgroundColor: '#F8FAFC',
  },
  inputOk: { borderColor: '#22C55E', backgroundColor: '#F0FDF4' },
  detected: { backgroundColor: '#F0FDF4', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginTop: 4 },
  detectedTxt: { fontSize: 13, color: '#15803D', fontWeight: '600' },
  error: { fontSize: 13, color: '#DC2626', marginTop: 6 },
  btn: { height: 54, backgroundColor: '#0A1525', borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  btnOff: { opacity: 0.6 },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disclaimer: { textAlign: 'center', fontSize: 12, color: '#94A3B8', marginTop: 28 },
});

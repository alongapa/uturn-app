import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Image, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useUser } from '@/contexts/UserContext';
import { useAppState } from '@/store/appState';
import { CAMPUSES } from '@/constants/campuses';
import { getActiveUniversities, isUniversityActive, IS_SINGLE_UNIVERSITY, isAdminEmail } from '@/constants/appConfig';
import { isEmailRegistered } from '@/services/verification';
import {
  isSupabaseConfigured,
  signUp as dbSignUp,
  signIn as dbSignIn,
  getMyProfile,
  updateMyProfile,
  isEmailRegistered as dbIsEmailRegistered,
} from '@/services/db';
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

const ACTIVE_UNIVERSITIES = getActiveUniversities();

type Mode = 'login' | 'signup';

function friendlyAuthError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes('already registered') || msg.includes('user already')) {
    return 'Ese correo ya tiene una cuenta. Inicia sesión.';
  }
  if (msg.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.';
  }
  if (msg.includes('password') && msg.includes('6')) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Confirma tu correo antes de iniciar sesión (revisa tu bandeja).';
  }
  return raw;
}

export default function LoginScreen() {
  const { setUser } = useUser();
  const { dispatch } = useAppState();

  const [mode, setMode] = useState<Mode>(isSupabaseConfigured ? 'login' : 'signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const matchedUniId = Object.entries(DOMAIN_MAP).find(([d]) =>
    email.toLowerCase().endsWith(d)
  )?.[1];
  // Solo aceptamos universidades activas (lanzamiento inicial: solo UAI).
  const detectedUniId = matchedUniId && isUniversityActive(matchedUniId as any) ? matchedUniId : undefined;
  const universityInfo = ACTIVE_UNIVERSITIES.find((u) => u.id === detectedUniId);

  function routeAfterAuth(u: User) {
    if (u.isAdmin) router.replace('/admin' as never);
    else router.replace(u.verificationStatus === 'verified' ? '/(tabs)' : '/verify-profile');
  }

  async function handleSubmit() {
    setError('');
    setInfo('');

    if (mode === 'signup' && !name.trim()) { setError('Ingresa tu nombre completo'); return; }
    if (!detectedUniId) {
      const domains = ACTIVE_UNIVERSITIES.flatMap((u) => u.domains).join(', ');
      setError(`Usa tu correo institucional (${domains})`);
      return;
    }
    if (isSupabaseConfigured && password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    setLoading(true);

    try {
      if (isSupabaseConfigured) {
        if (mode === 'signup') {
          const result = await dbSignUp(normalizedEmail, password, name.trim(), detectedUniId);
          if (!result.session) {
            // Confirmación de correo activada en el proyecto: no hay sesión aún.
            setInfo('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.');
            setMode('login');
            setPassword('');
            setLoading(false);
            return;
          }
          const preVerified = await dbIsEmailRegistered(normalizedEmail);
          if (preVerified) {
            await updateMyProfile({ verificationStatus: 'verified' });
          }
        } else {
          await dbSignIn(normalizedEmail, password);
        }

        const profile = await getMyProfile();
        if (!profile) throw new Error('No se encontró tu perfil. Intenta nuevamente.');
        setUser(profile);
        setLoading(false);
        routeAfterAuth(profile);
        return;
      }

      // --- Sin Supabase configurado: flujo simulado (datos en memoria) ---
      await new Promise((r) => setTimeout(r, 400));
      const preVerified = isEmailRegistered(normalizedEmail);
      const homeCampus = CAMPUSES.find((c) => c.universityId === detectedUniId);
      const mockUser: User = {
        id: 'u_' + Date.now(),
        name: name.trim() || normalizedEmail.split('@')[0],
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
        isAdmin: isAdminEmail(normalizedEmail),
      };
      setUser(mockUser);
      dispatch({ type: 'REGISTER_USER', payload: mockUser });
      setLoading(false);
      routeAfterAuth(mockUser);
    } catch (e) {
      setLoading(false);
      setError(friendlyAuthError(e instanceof Error ? e.message : String(e)));
    }
  }

  const showPassword = isSupabaseConfigured;
  const showTabs = isSupabaseConfigured;

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
            {ACTIVE_UNIVERSITIES.map((u) => (
              <View
                key={u.id}
                style={[s.uniChip, IS_SINGLE_UNIVERSITY && s.uniChipWide, detectedUniId === u.id && s.uniActive]}
              >
                <Image source={UNI_LOGOS[u.id]} style={s.uniLogo} resizeMode="contain" />
              </View>
            ))}
          </View>

          {showTabs && (
            <View style={s.tabs}>
              <TouchableOpacity
                style={[s.tab, mode === 'login' && s.tabActive]}
                onPress={() => { setMode('login'); setError(''); setInfo(''); }}
              >
                <Text style={[s.tabTxt, mode === 'login' && s.tabTxtActive]}>Iniciar sesión</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tab, mode === 'signup' && s.tabActive]}
                onPress={() => { setMode('signup'); setError(''); setInfo(''); }}
              >
                <Text style={[s.tabTxt, mode === 'signup' && s.tabTxtActive]}>Crear cuenta</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={s.form}>
            {mode === 'signup' && (
              <>
                <Text style={s.label}>Nombre completo</Text>
                <TextInput
                  style={s.input}
                  placeholder="Tu nombre"
                  placeholderTextColor="#94A3B8"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </>
            )}

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

            {showPassword && (
              <>
                <Text style={s.label}>Contraseña</Text>
                <TextInput
                  style={s.input}
                  placeholder="••••••••"
                  placeholderTextColor="#94A3B8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </>
            )}

            {error ? <Text style={s.error}>{error}</Text> : null}
            {info ? <Text style={s.info}>{info}</Text> : null}

            <TouchableOpacity style={[s.btn, loading && s.btnOff]} onPress={handleSubmit} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.btnTxt}>{mode === 'signup' ? 'Crear cuenta' : 'Ingresar'}</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={s.disclaimer}>
            {IS_SINGLE_UNIVERSITY
              ? `Exclusivo para alumnos de ${ACTIVE_UNIVERSITIES[0]?.name ?? 'la universidad'}`
              : `Solo disponible para alumnos de ${ACTIVE_UNIVERSITIES.map((u) => u.id.toUpperCase()).join(', ')}`}
          </Text>
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
  unis: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 24 },
  uniChip: {
    width: 80, height: 44, borderRadius: 10,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  uniChipWide: { width: 120, height: 56 },
  uniActive: { borderColor: '#246BFD', backgroundColor: '#EFF6FF' },
  uniLogo: { width: 64, height: 32 },
  tabs: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 4, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 9 },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  tabTxt: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  tabTxtActive: { color: '#0A1525' },
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
  info: { fontSize: 13, color: '#1D4ED8', marginTop: 6 },
  btn: { height: 54, backgroundColor: '#0A1525', borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  btnOff: { opacity: 0.6 },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disclaimer: { textAlign: 'center', fontSize: 12, color: '#94A3B8', marginTop: 28 },
});

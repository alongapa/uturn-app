import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { useUser } from '@/contexts/UserContext';
import { getIntranetForEmail } from '@/constants/intranets';
import { verifyStudent, isEmailRegistered, type VerificationResult } from '@/services/verification';

type Step = 'intro' | 'reference' | 'upload' | 'result';

const STEP_ORDER: Step[] = ['intro', 'reference', 'upload', 'result'];

export default function CredentialVerificationScreen() {
  const { user, updateUser } = useUser();
  const [step, setStep] = useState<Step>('intro');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);

  const intranet = useMemo(() => (user ? getIntranetForEmail(user.email) : null), [user?.email]);
  const inRegistry = useMemo(() => (user ? isEmailRegistered(user.email) : false), [user?.email]);

  async function pickScreenshot() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!res.canceled) {
      const uri = res.assets?.[0]?.uri;
      if (uri) setScreenshot(uri);
    }
  }

  function handleVerify() {
    if (!user) return;
    setProcessing(true);
    setTimeout(() => {
      const r = verifyStudent(user.email, Boolean(screenshot));
      setResult(r);
      updateUser({ verificationStatus: r.status });
      setProcessing(false);
      setStep('result');
    }, 1400);
  }

  function startFlow() {
    // Si el correo ya está en el padrón institucional, verificación instantánea.
    if (user && inRegistry) {
      const r = verifyStudent(user.email, false);
      setResult(r);
      updateUser({ verificationStatus: r.status });
      setStep('result');
    } else {
      setStep('reference');
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <View style={s.progress}>
          {STEP_ORDER.map((st, i) => {
            const active = STEP_ORDER.indexOf(step) >= i;
            return <View key={st} style={[s.progressBar, active && s.progressActive]} />;
          })}
        </View>

        {step === 'intro' && (
          <View style={s.block}>
            <View style={s.iconCircle}>
              <Text style={s.iconCircleTxt}>ID</Text>
            </View>
            <Text style={s.title}>Verificación de estudiante</Text>
            <Text style={s.body}>
              Confirmamos que perteneces a {intranet?.name ? `${intranet.name.replace('Intranet ', '').replace('Webcursos ', '')}` : 'tu universidad'} para
              mantener la comunidad segura y de confianza.
            </Text>

            <View style={s.infoCard}>
              <Text style={s.infoLabel}>Correo institucional</Text>
              <Text style={s.infoValue}>{user?.email ?? '—'}</Text>
              {intranet && (
                <>
                  <View style={s.infoDivider} />
                  <Text style={s.infoLabel}>Portal a validar</Text>
                  <Text style={s.infoValue}>{intranet.name}</Text>
                </>
              )}
            </View>

            {inRegistry ? (
              <View style={s.registryHit}>
                <Text style={s.registryHitTxt}>
                  Tu correo está en el padrón oficial. La verificación será instantánea.
                </Text>
              </View>
            ) : (
              <Text style={s.note}>
                Te pediremos un screenshot de tu intranet para validar tu identidad.
              </Text>
            )}

            <TouchableOpacity style={s.primaryBtn} onPress={startFlow}>
              <Text style={s.primaryTxt}>{inRegistry ? 'Verificar ahora' : 'Comenzar'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'reference' && intranet && (
          <View style={s.block}>
            <Text style={s.title}>Así se ve tu intranet</Text>
            <Text style={s.body}>
              Inicia sesión en {intranet.name} y toma un screenshot de tu sesión.
              Debe verse similar a esta referencia:
            </Text>

            <View style={s.referenceFrame}>
              <Image source={intranet.referenceImage} style={s.referenceImg} resizeMode="cover" />
              <View style={s.referenceTag}>
                <Text style={s.referenceTagTxt}>Referencia · {intranet.name}</Text>
              </View>
            </View>

            <View style={s.hintsCard}>
              <Text style={s.hintsTitle}>Tu screenshot debe mostrar:</Text>
              {intranet.expectedHints.map((hint) => (
                <Text key={hint} style={s.hint}>• {hint}</Text>
              ))}
            </View>

            <TouchableOpacity onPress={() => Linking.openURL(intranet.portalUrl)}>
              <Text style={s.link}>Abrir {intranet.portalUrl}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.primaryBtn} onPress={() => setStep('upload')}>
              <Text style={s.primaryTxt}>Ya tengo mi screenshot</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'upload' && (
          <View style={s.block}>
            <Text style={s.title}>Sube tu screenshot</Text>
            <Text style={s.body}>Adjunta la captura de tu intranet. No se comparte con otros usuarios.</Text>

            <TouchableOpacity style={s.uploadBox} onPress={pickScreenshot}>
              {screenshot ? (
                <Image source={{ uri: screenshot }} style={s.uploadImg} resizeMode="cover" />
              ) : (
                <>
                  <View style={s.uploadIconCircle}>
                    <Text style={s.uploadIconTxt}>+</Text>
                  </View>
                  <Text style={s.uploadTxt}>Toca para subir captura</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.primaryBtn, (!screenshot || processing) && s.btnOff]}
              disabled={!screenshot || processing}
              onPress={handleVerify}
            >
              {processing ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryTxt}>Enviar a verificación</Text>}
            </TouchableOpacity>
          </View>
        )}

        {step === 'result' && result && (
          <View style={s.block}>
            <View style={[s.resultIcon, result.status === 'verified' ? s.resultOk : s.resultPending]}>
              <Text style={s.resultIconTxt}>{result.status === 'verified' ? '✓' : '⏳'}</Text>
            </View>
            <Text style={s.title}>
              {result.status === 'verified' ? 'Cuenta verificada' : 'En revisión'}
            </Text>
            <Text style={s.body}>{result.message}</Text>

            {result.status === 'verified' ? (
              <View style={s.badgeEarned}>
                <Text style={s.badgeEarnedTxt}>🎓 Insignia de estudiante verificado obtenida</Text>
              </View>
            ) : (
              <View style={s.pendingCard}>
                <Text style={s.pendingTxt}>
                  Revisamos las capturas en menos de 24 h. Puedes usar la app mientras tanto con
                  funciones limitadas.
                </Text>
              </View>
            )}

            <TouchableOpacity style={s.primaryBtn} onPress={() => router.replace('/(tabs)')}>
              <Text style={s.primaryTxt}>Ir al inicio</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  scroll: { flexGrow: 1, padding: 24 },
  progress: { flexDirection: 'row', gap: 6, marginBottom: 28 },
  progressBar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#E2E8F0' },
  progressActive: { backgroundColor: '#0F4C81' },
  block: { gap: 16 },
  iconCircle: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#0A1525', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  iconCircleTxt: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  title: { fontSize: 24, fontWeight: '800', color: '#0A1525' },
  body: { fontSize: 15, color: '#475569', lineHeight: 22 },
  infoCard: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  infoLabel: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  infoValue: { fontSize: 15, color: '#0A1525', fontWeight: '700', marginTop: 2 },
  infoDivider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 12 },
  registryHit: { backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#BBF7D0' },
  registryHitTxt: { fontSize: 14, color: '#15803D', fontWeight: '600' },
  note: { fontSize: 13, color: '#64748B' },
  referenceFrame: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F1F5F9' },
  referenceImg: { width: '100%', height: 200 },
  referenceTag: { position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(10,21,37,0.85)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  referenceTagTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  hintsCard: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 6 },
  hintsTitle: { fontSize: 14, fontWeight: '700', color: '#0A1525', marginBottom: 2 },
  hint: { fontSize: 13, color: '#475569' },
  link: { fontSize: 14, color: '#0F4C81', fontWeight: '600', textDecorationLine: 'underline' },
  uploadBox: { height: 200, borderRadius: 16, borderWidth: 2, borderColor: '#CBD5E1', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#F8FAFC', overflow: 'hidden' },
  uploadImg: { width: '100%', height: '100%' },
  uploadIconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  uploadIconTxt: { fontSize: 28, color: '#64748B', fontWeight: '300', lineHeight: 32 },
  uploadTxt: { fontSize: 14, color: '#64748B', fontWeight: '600' },
  primaryBtn: { backgroundColor: '#0A1525', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  btnOff: { opacity: 0.5 },
  primaryTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  resultIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  resultOk: { backgroundColor: '#DCFCE7' },
  resultPending: { backgroundColor: '#FEF3C7' },
  resultIconTxt: { fontSize: 28 },
  badgeEarned: { backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#BBF7D0' },
  badgeEarnedTxt: { fontSize: 14, color: '#15803D', fontWeight: '700' },
  pendingCard: { backgroundColor: '#FFFBEB', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#FDE68A' },
  pendingTxt: { fontSize: 13, color: '#92400E', lineHeight: 19 },
});

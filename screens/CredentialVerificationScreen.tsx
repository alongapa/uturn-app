import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { useUser } from '@/contexts/UserContext';

type Step = 'intro' | 'credential' | 'selfie' | 'done';

export default function CredentialVerificationScreen() {
  const { user } = useUser();
  const [step, setStep] = useState<Step>('intro');
  const [credentialImage, setCredentialImage] = useState<string | null>(null);
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  async function pickImage(setter: (uri: string) => void) {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled) {
      const uri = result.assets?.[0]?.uri;
      if (uri) setter(uri);
    }
  }

  function handleVerify() {
    setVerifying(true);
    setTimeout(() => {
      setVerifying(false);
      setStep('done');
    }, 1500);
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Progreso */}
        <View style={s.progress}>
          {(['intro', 'credential', 'selfie', 'done'] as Step[]).map((st, i) => {
            const order = ['intro', 'credential', 'selfie', 'done'];
            const active = order.indexOf(step) >= i;
            return <View key={st} style={[s.progressBar, active && s.progressActive]} />;
          })}
        </View>

        {step === 'intro' && (
          <View style={s.center}>
            <Text style={s.bigEmoji}>🎓</Text>
            <Text style={s.title}>Verifica tu credencial</Text>
            <Text style={s.body}>
              Para mantener la comunidad segura, verificamos que seas estudiante activo de {user?.university ?? 'tu universidad'}.
            </Text>
            <View style={s.benefitsList}>
              <Text style={s.benefit}>✓ Más confianza de conductores y pasajeros</Text>
              <Text style={s.benefit}>✓ Insignia de verificado en tu perfil</Text>
              <Text style={s.benefit}>✓ Acceso a beneficios exclusivos</Text>
            </View>
            <TouchableOpacity style={s.primaryBtn} onPress={() => setStep('credential')}>
              <Text style={s.primaryTxt}>Comenzar</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'credential' && (
          <View style={s.stepContent}>
            <Text style={s.title}>Foto de tu credencial</Text>
            <Text style={s.body}>Sube una foto clara de tu credencial universitaria (TUI / carnet estudiantil).</Text>
            <TouchableOpacity style={s.uploadBox} onPress={() => pickImage(setCredentialImage)}>
              {credentialImage ? (
                <Image source={{ uri: credentialImage }} style={s.uploadedImg} resizeMode="cover" />
              ) : (
                <>
                  <Text style={s.uploadIcon}>📷</Text>
                  <Text style={s.uploadTxt}>Toca para subir foto</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.primaryBtn, !credentialImage && s.btnOff]}
              disabled={!credentialImage}
              onPress={() => setStep('selfie')}
            >
              <Text style={s.primaryTxt}>Continuar</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'selfie' && (
          <View style={s.stepContent}>
            <Text style={s.title}>Selfie de verificación</Text>
            <Text style={s.body}>Tómate una selfie para confirmar que coincides con tu credencial.</Text>
            <TouchableOpacity style={s.uploadBox} onPress={() => pickImage(setSelfieImage)}>
              {selfieImage ? (
                <Image source={{ uri: selfieImage }} style={s.uploadedImg} resizeMode="cover" />
              ) : (
                <>
                  <Text style={s.uploadIcon}>🤳</Text>
                  <Text style={s.uploadTxt}>Toca para tomar selfie</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.primaryBtn, (!selfieImage || verifying) && s.btnOff]}
              disabled={!selfieImage || verifying}
              onPress={handleVerify}
            >
              {verifying ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryTxt}>Verificar identidad</Text>}
            </TouchableOpacity>
          </View>
        )}

        {step === 'done' && (
          <View style={s.center}>
            <Text style={s.bigEmoji}>✅</Text>
            <Text style={s.title}>¡Verificado!</Text>
            <Text style={s.body}>
              Tu credencial fue verificada con éxito. Ya tienes la insignia de estudiante verificado.
            </Text>
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
  progress: { flexDirection: 'row', gap: 6, marginBottom: 32 },
  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0' },
  progressActive: { backgroundColor: '#246BFD' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  stepContent: { gap: 16 },
  bigEmoji: { fontSize: 64 },
  title: { fontSize: 24, fontWeight: '800', color: '#0A1525', textAlign: 'center' },
  body: { fontSize: 15, color: '#64748B', textAlign: 'center', lineHeight: 22 },
  benefitsList: { gap: 8, alignSelf: 'stretch', backgroundColor: '#F8FAFC', borderRadius: 14, padding: 16 },
  benefit: { fontSize: 14, color: '#15803D', fontWeight: '600' },
  uploadBox: {
    height: 200, borderRadius: 16, borderWidth: 2, borderColor: '#E2E8F0', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F8FAFC', overflow: 'hidden',
  },
  uploadedImg: { width: '100%', height: '100%' },
  uploadIcon: { fontSize: 40 },
  uploadTxt: { fontSize: 14, color: '#64748B', fontWeight: '600' },
  primaryBtn: { backgroundColor: '#0A1525', borderRadius: 14, paddingVertical: 16, alignItems: 'center', alignSelf: 'stretch', marginTop: 8 },
  btnOff: { opacity: 0.5 },
  primaryTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { CAMPUSES } from '@/constants/campuses';
import { useUser } from '@/contexts/UserContext';
import { universityFromEmail } from '@/services/api/auth';
import { isSupabaseConfigured } from '@/services/supabase';

export default function LoginScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [loading, setLoading] = useState(false);
  const { setUser, signInWithOtp, verifyOtp } = useUser();

  const normalizedEmail = email.toLowerCase().trim();

  const validate = useCallback(() => {
    if (!universityFromEmail(normalizedEmail)) {
      alert('Usa tu correo institucional (@alumnos.uai.cl, @udd.cl o @miuandes.cl)');
      return false;
    }
    if (!dateOfBirth.trim()) {
      alert('Ingresa tu fecha de nacimiento');
      return false;
    }
    return true;
  }, [normalizedEmail, dateOfBirth]);

  // Sin Supabase configurado: modo dev local (sin verificación por correo).
  const handleLocalLogin = useCallback(() => {
    const universityId = universityFromEmail(normalizedEmail)!;
    const homeCampusId = CAMPUSES.find((campus) => campus.universityId === universityId)?.id;
    const trimmedName = name.trim();
    const resolvedName = trimmedName || 'Conductora UNITIES';
    setUser({
      id: normalizedEmail,
      name: resolvedName,
      email: normalizedEmail,
      travelMode: 'driver',
      accountRole: 'user',
      universityId,
      homeCampusId,
      dateOfBirth,
    });
    router.replace({ pathname: '/verify-profile', params: { name: resolvedName, email: normalizedEmail } });
  }, [normalizedEmail, name, dateOfBirth, setUser]);

  const handleSendCode = useCallback(async () => {
    if (!validate()) return;
    if (!isSupabaseConfigured) {
      handleLocalLogin();
      return;
    }
    setLoading(true);
    try {
      const universityId = universityFromEmail(normalizedEmail)!;
      const homeCampusId = CAMPUSES.find((campus) => campus.universityId === universityId)?.id;
      await signInWithOtp(normalizedEmail, {
        full_name: name.trim() || undefined,
        university_id: universityId,
        home_campus_id: homeCampusId,
        date_of_birth: dateOfBirth,
      });
      setStep('code');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No pudimos enviar el código. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [validate, normalizedEmail, name, dateOfBirth, signInWithOtp, handleLocalLogin]);

  const handleVerify = useCallback(async () => {
    if (code.trim().length < 6) {
      alert('Ingresa el código de 6 dígitos que enviamos a tu correo');
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(normalizedEmail, code);
      router.replace({
        pathname: '/verify-profile',
        params: { name: name.trim() || 'Estudiante UNITIES', email: normalizedEmail },
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Código inválido o expirado.');
    } finally {
      setLoading(false);
    }
  }, [code, normalizedEmail, name, verifyOtp]);

  return (
    <View style={styles.container}>
      <Image source={require('../assets/images/unities-logo.png')} style={styles.logo} />
      <View style={styles.header}>
        <Text style={styles.title}>Bienvenido a UNITIES</Text>
        <Text style={styles.subtitle}>Comparte tu viaje con la comunidad universitaria</Text>
      </View>

      {step === 'form' ? (
        <>
          <View style={styles.form}>
            <Text style={styles.label}>Nombre completo</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingresa tu nombre"
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.label}>Correo institucional</Text>
            <TextInput
              style={styles.input}
              placeholder="nombre@alumnos.uai.cl"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />

            <Text style={styles.label}>Fecha de nacimiento (AAAA-MM-DD)</Text>
            <TextInput
              style={styles.input}
              placeholder="1999-08-15"
              autoCapitalize="none"
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
            />
          </View>

          <TouchableOpacity style={styles.button} onPress={handleSendCode} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>
                {isSupabaseConfigured ? 'Enviarme un código' : 'Ingresar'}
              </Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.form}>
            <Text style={styles.label}>Código enviado a</Text>
            <Text style={styles.emailEcho}>{normalizedEmail}</Text>
            <Text style={styles.label}>Código de 6 dígitos</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
            />
          </View>

          <TouchableOpacity style={styles.button} onPress={handleVerify} disabled={loading}>
            {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Verificar código</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep('form')} disabled={loading}>
            <Text style={styles.linkText}>Cambiar correo</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#5f5f5f',
    textAlign: 'center',
  },
  form: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    color: '#3a3a3a',
    marginBottom: 8,
  },
  emailEcho: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D4ED8',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d1d1',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    fontSize: 16,
    color: '#1a1a1a',
  },
  codeInput: {
    fontSize: 28,
    letterSpacing: 8,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#1D4ED8',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  linkText: {
    color: '#1D4ED8',
    textAlign: 'center',
    marginTop: 16,
    fontSize: 15,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 24,
    alignSelf: 'center',
  },
});

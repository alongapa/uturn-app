import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { CAMPUSES, type UniversityId } from '@/constants/campuses';
import { useUser } from '@/contexts/UserContext';

export default function LoginScreen() {
  const [name, setName] = useState(''); // nombre en estado
  const [email, setEmail] = useState(''); // correo en estado
  const [dateOfBirth, setDateOfBirth] = useState('');
  const { setUser } = useUser();

  const handleLogin = useCallback(() => {
    const normalized = email.toLowerCase().trim();
    const allowed: Record<string, UniversityId> = {
      '@alumnos.uai.cl': 'uai',
      '@udd.cl': 'udd',
      '@miuandes.cl': 'uandes',
    };
    const matchedDomain = Object.keys(allowed).find((domain) => normalized.endsWith(domain));

    if (!matchedDomain) {
      alert('Usa tu correo institucional');
      return;
    }

    if (!dateOfBirth.trim()) {
      alert('Ingresa tu fecha de nacimiento');
      return;
    }

    const universityId = allowed[matchedDomain];
    const homeCampusId = CAMPUSES.find((campus) => campus.universityId === universityId)?.id;

    const trimmedName = name.trim();
    const resolvedName = trimmedName || 'Conductora UTURN';

    setUser({
      id: normalized,
      name: resolvedName,
      email: normalized,
      role: 'driver',
      universityId,
      homeCampusId,
      dateOfBirth,
    });

    router.replace({
      pathname: '/verify-profile',
      params: { name: trimmedName || resolvedName, email: normalized },
    });
  }, [dateOfBirth, email, name, setUser]);

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/images/uturn-logo.png')}
        style={styles.logo}
      />
      <View style={styles.header}>
        <Text style={styles.title}>Bienvenido a U-TURN</Text>
        <Text style={styles.subtitle}>Comparte tu viaje con la comunidad universitaria</Text>
      </View>

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

      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Ingresar</Text>
      </TouchableOpacity>
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
  logo: {
    width: 120,
    height: 120,
    marginBottom: 24,
    alignSelf: 'center',
  },
});


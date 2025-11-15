import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function LoginScreen() {
  const [name, setName] = useState(''); // nombre en estado
  const [email, setEmail] = useState(''); // correo en estado

  const handleLogin = useCallback(() => {
    const normalized = email.toLowerCase().trim();
    const allowed = ['@alumnos.uai.cl', '@udd.cl', '@miuandes.cl'];
    const isValid = allowed.some(domain => normalized.endsWith(domain));

    if (!isValid) {
      alert('Usa tu correo institucional');
      return;
    }

    // navigate to the public route (root)
    router.replace('/(tabs)');
  }, [email]);

  return (
    <View style={styles.container}>
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
});


import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';

import { useAuth } from '@/hooks/useAuth';

export default function LoginScreen() {
  const [nombreCompleto, setNombreCompleto] = useState(''); // Estado para el nombre completo
  const [correoInstitucional, setCorreoInstitucional] = useState(''); // Estado para el correo institucional
  const { login } = useAuth(); // Obtiene las acciones del contexto de autenticación

  const handleLogin = useCallback(() => {
    const correoNormalizado = correoInstitucional.toLowerCase().trim();
    const dominiosPermitidos = ['@alumnos.uai.cl', '@udd.cl', '@miuandes.cl']; // Dominios actualizados según requerimiento
    const esValido = dominiosPermitidos.some((dominio) => correoNormalizado.includes(dominio));

    if (!esValido) {
      alert('Usa tu correo institucional'); // Mensaje de alerta si el correo no es válido
      return;
    }

    login({
      name: nombreCompleto.trim(),
      email: correoNormalizado,
      role: 'passenger', // TODO: actualizar cuando se integre la selección real de rol
    }); // Persiste los datos del usuario en el contexto global

    router.push('/(tabs)'); // Navega a las tabs cuando el correo es válido
  }, [correoInstitucional, login, nombreCompleto]);

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
          value={nombreCompleto}
          onChangeText={setNombreCompleto} // Actualiza el estado del nombre
        />

        <Text style={styles.label}>Correo institucional</Text>
        <TextInput
          style={styles.input}
          placeholder="nombre@alumnos.uai.cl"
          keyboardType="email-address"
          autoCapitalize="none"
          value={correoInstitucional}
          onChangeText={setCorreoInstitucional} // Actualiza el estado del correo
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

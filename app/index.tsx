import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useUser } from '@/contexts/UserContext';
import { useOnboarding } from '@/hooks/use-onboarding';
import LoginScreen from '@/screens/LoginScreen';

export default function LoginRoute() {
  const { isHydrated, isAuthenticated } = useUser();
  const { seenIntro } = useOnboarding();

  // Mientras se restaura la sesión persistida (Supabase/AsyncStorage) o se lee
  // el estado del onboarding. `seenIntro === null` es "todavía no sé": entrar
  // sin esperarlo mostraría la bienvenida a quien ya la vio.
  if (!isHydrated || seenIntro === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1D4ED8" />
      </View>
    );
  }

  // Sesión activa: entra directo a la app sin volver a pedir login.
  if (isAuthenticated) {
    // La bienvenida va después del login, no antes: explicar turnos y strikes
    // a alguien que todavía no sabe si podrá entrar con su correo es ruido.
    return <Redirect href={seenIntro ? '/(tabs)' : '/onboarding'} />;
  }

  return <LoginScreen />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
});

import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useUser } from '@/contexts/UserContext';
import LoginScreen from '@/screens/LoginScreen';

export default function LoginRoute() {
  const { isHydrated, isAuthenticated } = useUser();

  // Mientras se restaura la sesión persistida (Supabase/AsyncStorage).
  if (!isHydrated) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1D4ED8" />
      </View>
    );
  }

  // Sesión activa: entra directo a la app sin volver a pedir login.
  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
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

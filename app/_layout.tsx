import { Stack } from 'expo-router';
import React from 'react';

import { UserProvider } from '@/contexts/UserContext';

export default function RootLayout() {
  return (
    <UserProvider>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        <Stack.Screen name="payment" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ title: 'Perfil' }} />
        <Stack.Screen name="meeting-point-map" options={{ title: 'Punto de encuentro' }} />
      </Stack>
    </UserProvider>
  );
}

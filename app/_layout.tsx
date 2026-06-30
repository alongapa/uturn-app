import { Stack } from 'expo-router';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { UserProvider } from '@/contexts/UserContext';
import { AppStateProvider } from '@/store/appState';
import { SessionBootstrap } from '@/components/SessionBootstrap';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <UserProvider>
        <AppStateProvider>
          <SessionBootstrap />
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
            <Stack.Screen name="payment" options={{ headerShown: false }} />
            <Stack.Screen name="admin/index" options={{ headerShown: false }} />
            <Stack.Screen name="profile" options={{ title: 'Perfil' }} />
            <Stack.Screen name="meeting-point-map" options={{ title: 'Punto de encuentro' }} />
          </Stack>
        </AppStateProvider>
      </UserProvider>
    </GestureHandlerRootView>
  );
}

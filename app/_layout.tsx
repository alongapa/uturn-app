import { Stack } from 'expo-router';
import React from 'react';

import { AppStateProvider } from '@/store/appState';

export default function RootLayout() {
  return (
    <AppStateProvider>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </AppStateProvider>
  );
}

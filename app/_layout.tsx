import { Stack } from 'expo-router';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { NotificationsProvider } from '@/contexts/NotificationsContext';
import { UserProvider } from '@/contexts/UserContext';
import { AppStateProvider } from '@/store/appState';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <UserProvider>
        <AppStateProvider>
          <NotificationsProvider>
            <Stack>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
              <Stack.Screen name="payment" options={{ headerShown: false }} />
              <Stack.Screen name="dispute" options={{ title: 'Yo sí pagué' }} />
              <Stack.Screen name="earnings" options={{ title: 'Mis ganancias' }} />
              <Stack.Screen name="rate" options={{ title: 'Calificar viaje' }} />
              <Stack.Screen name="profile" options={{ title: 'Perfil' }} />
              <Stack.Screen name="credits" options={{ title: 'Créditos Unities' }} />
              <Stack.Screen name="rewards" options={{ title: 'Premios' }} />
              <Stack.Screen name="redeem/index" options={{ title: 'Canjes' }} />
              <Stack.Screen name="redeem/[id]" options={{ title: 'Detalle de canje' }} />
              <Stack.Screen name="settings" options={{ title: 'Configuración' }} />
              <Stack.Screen name="notifications" options={{ title: 'Notificaciones' }} />
              <Stack.Screen name="meeting-point-map" options={{ title: 'Punto de encuentro' }} />
              <Stack.Screen name="admin/index" options={{ title: 'Panel de administración' }} />
              <Stack.Screen name="admin/widget" options={{ title: 'Widget de eventos' }} />
              <Stack.Screen name="admin/folders" options={{ title: 'Carpetas de contenido' }} />
              <Stack.Screen name="admin/folder/[id]" options={{ title: 'Carpeta' }} />
              <Stack.Screen name="admin/brands" options={{ title: 'Marcas asociadas' }} />
              <Stack.Screen name="admin/redeemables" options={{ title: 'Postular canjeables' }} />
              <Stack.Screen name="admin/approvals" options={{ title: 'Aprobaciones' }} />
              <Stack.Screen name="admin/publishers" options={{ title: 'Publishers y miembros' }} />
              <Stack.Screen name="admin/disputes" options={{ title: 'Disputas de pago' }} />
              <Stack.Screen name="admin/finance" options={{ title: 'Panel financiero' }} />
              <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
              <Stack.Screen name="support" options={{ title: 'Soporte Unities' }} />
              <Stack.Screen name="qa/index" options={{ title: 'Preguntas y temas' }} />
              <Stack.Screen name="qa/ask" options={{ title: 'Nueva pregunta' }} />
              <Stack.Screen name="qa/[id]" options={{ title: 'Pregunta' }} />
              <Stack.Screen name="tutor/[id]" options={{ title: 'Perfil de tutor' }} />
              <Stack.Screen name="guides/upload" options={{ title: 'Subir guía' }} />
            </Stack>
          </NotificationsProvider>
        </AppStateProvider>
      </UserProvider>
    </GestureHandlerRootView>
  );
}

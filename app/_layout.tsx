import { Stack } from 'expo-router';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NotificationsProvider } from '@/contexts/NotificationsContext';
import { UserProvider } from '@/contexts/UserContext';
import { Colors } from '@/constants/theme';
import { initMonitoring, wrapRootComponent } from '@/services/monitoring';
import { AppStateProvider } from '@/store/appState';

// Fuera del componente y antes del primer render: un crash durante el montaje
// de los providers es justo el que hay que capturar, y adentro de un useEffect
// Sentry arrancaría demasiado tarde para verlo.
initMonitoring();

function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Los navegadores de react-navigation montan su propio SafeAreaProvider,
          pero las pantallas fuera de un navegador (app/index.tsx) quedaban sin
          contexto de insets. Este es el único de la app. */}
      <SafeAreaProvider>
        <UserProvider>
        <AppStateProvider>
          <NotificationsProvider>
            <Stack
              screenOptions={{
                headerTintColor: Colors.light.tint,
                headerTitleStyle: { fontWeight: '700', color: '#0f172a' },
                headerStyle: { backgroundColor: '#ffffff' },
                headerShadowVisible: false,
                headerBackButtonDisplayMode: 'minimal',
                gestureEnabled: true,
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              {/* Sin gesto de volver: es la aceptación previa a la primera
                  reserva, y deslizar para atrás la saltaría sin aceptar. */}
              <Stack.Screen
                name="reglas-de-pago"
                options={{ title: 'Reglas de pago', gestureEnabled: false }}
              />
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
              <Stack.Screen name="create-trip" options={{ title: 'Publicar viaje' }} />
              <Stack.Screen name="driver" options={{ title: 'Panel de conductor' }} />
              <Stack.Screen name="driver/create-trip" options={{ title: 'Publicar viaje' }} />
              <Stack.Screen name="driver/manage-passengers" options={{ title: 'Gestionar pasajeros' }} />
              <Stack.Screen name="driver/routes-map" options={{ title: 'Rutas y puntos de encuentro' }} />
              <Stack.Screen name="passenger" options={{ title: 'Buscar viaje' }} />
              <Stack.Screen name="passenger/routes-map" options={{ title: 'Viajes en el mapa' }} />
              <Stack.Screen name="passenger/search-results" options={{ title: 'Resultados de búsqueda' }} />
              <Stack.Screen name="passenger/trip-map/[id]" options={{ title: 'Viaje en el mapa' }} />
              <Stack.Screen name="map" options={{ title: 'Mapa del viaje' }} />
              <Stack.Screen name="trip/[id]" options={{ title: 'Detalle del viaje' }} />
              <Stack.Screen name="tutor-bots" options={{ title: 'Bots de tutoría' }} />
              <Stack.Screen name="admin/bot" options={{ title: 'Bot del publisher' }} />
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
              <Stack.Screen name="admin/reports" options={{ title: 'Reportes de la comunidad' }} />
              <Stack.Screen name="admin/safety" options={{ title: 'Alertas SOS' }} />
              <Stack.Screen name="admin/identity" options={{ title: 'Revisión de identidad' }} />
              <Stack.Screen name="admin/antiabuse" options={{ title: 'Anti-abuso' }} />
              <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
              <Stack.Screen name="support" options={{ title: 'Soporte Unities' }} />
              <Stack.Screen name="qa/index" options={{ title: 'Preguntas y temas' }} />
              <Stack.Screen name="qa/ask" options={{ title: 'Nueva pregunta' }} />
              <Stack.Screen name="qa/[id]" options={{ title: 'Pregunta' }} />
              <Stack.Screen name="tutor/[id]" options={{ title: 'Perfil de tutor' }} />
              <Stack.Screen name="guides/upload" options={{ title: 'Subir guía' }} />
              <Stack.Screen name="user/[id]" options={{ title: 'Perfil' }} />
              <Stack.Screen name="live/[token]" options={{ title: 'Viaje en vivo', headerShown: false }} />
              <Stack.Screen name="privacy" options={{ title: 'Privacidad y seguridad' }} />
              <Stack.Screen name="legal/privacidad" options={{ title: 'Política de privacidad' }} />
              <Stack.Screen name="legal/terminos" options={{ title: 'Términos y condiciones' }} />
              <Stack.Screen name="blocked-users" options={{ title: 'Usuarios bloqueados' }} />
              <Stack.Screen name="community-rules" options={{ title: 'Reglas de la comunidad' }} />
              <Stack.Screen name="driver-verification" options={{ title: 'Verificación de conductor' }} />
            </Stack>
          </NotificationsProvider>
        </AppStateProvider>
        </UserProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap añade el error boundary que captura los fallos de render del
// árbol completo. Sin DSN configurado es un passthrough.
export default wrapRootComponent(RootLayout);

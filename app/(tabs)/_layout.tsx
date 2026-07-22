import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { track } from '@/services/api/analytics';

// Registra la apertura de un tab (Sesión Analítica de tendencias). tabPress
// dispara al tocar el ícono aunque ya sea el tab activo; no distingue eso de
// una apertura real, pero para la tendencia agregada (qué tanto se usa cada
// sección) el ruido es despreciable.
function trackTabOpen(name: string) {
  return { tabPress: () => track({ eventType: 'open', entityType: 'tab', entityId: name }) };
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#246BFD',
        tabBarInactiveTintColor: '#0A1525',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E2E8F0',
          height: 62,
          paddingBottom: 10,
          paddingTop: 10,
        },
        tabBarLabelStyle: { fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
        listeners={() => trackTabOpen('index')}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Mensajes',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="bubble.left.and.bubble.right.fill" color={color} />
          ),
        }}
        listeners={() => trackTabOpen('messages')}
      />
      <Tabs.Screen
        name="my-trips"
        options={{
          title: 'Turnos',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="list.bullet" color={color} />,
        }}
        listeners={() => trackTabOpen('my-trips')}
      />
      <Tabs.Screen
        name="tutorias"
        options={{
          title: 'Tutorías',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="graduationcap.fill" color={color} />,
        }}
        listeners={() => trackTabOpen('tutorias')}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.crop.circle" color={color} />,
        }}
        listeners={() => trackTabOpen('profile')}
      />
    </Tabs>
  );
}

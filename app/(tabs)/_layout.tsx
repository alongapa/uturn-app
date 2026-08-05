import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { Colors } from '@/constants/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ outline, filled, color, focused, size = 24 }: { outline: IoniconName; filled: IoniconName; color: string; focused: boolean; size?: number }) {
  return <Ionicons name={focused ? filled : outline} size={size} color={color} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.light.tabIconSelected,
        tabBarInactiveTintColor: Colors.light.tabIconDefault,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: Colors.light.border,
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
          tabBarIcon: ({ color, focused }) => (
            <TabIcon outline="home-outline" filled="home" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Mensajes',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon outline="chatbubbles-outline" filled="chatbubbles" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-trips"
        options={{
          title: 'Turnos',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon outline="car-outline" filled="car" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="tutorias"
        options={{
          title: 'Tutorías',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon outline="school-outline" filled="school" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon outline="person-circle-outline" filled="person-circle" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

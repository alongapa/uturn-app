import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { usePermissions } from '@/hooks/use-permissions';

type Props = {
  children: React.ReactNode;
  /** true: exige rol owner; por defecto basta admin. */
  ownerOnly?: boolean;
};

/**
 * Puerta de entrada visual del panel: oculta el contenido a quien no es
 * admin/owner. El enforcement real es RLS — un user que llame la API directo
 * recibe un rechazo del servidor aunque salte esta pantalla.
 */
export function AdminGuard({ children, ownerOnly = false }: Props) {
  const permissions = usePermissions();
  const allowed = ownerOnly ? permissions.isOwner : permissions.isAdmin;

  if (!allowed) {
    return (
      <View style={styles.container}>
        <Ionicons name="lock-closed-outline" size={40} color="#94a3b8" />
        <Text style={styles.title}>Acceso restringido</Text>
        <Text style={styles.caption}>
          {ownerOnly
            ? 'Esta sección es solo para el owner de la plataforma.'
            : 'El panel de administración es solo para federaciones, centros de alumnos y marcas asociadas.'}
        </Text>
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f7fb',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  title: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  caption: { color: '#64748b', textAlign: 'center', lineHeight: 20 },
});

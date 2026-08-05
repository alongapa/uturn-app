import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { getLiveShare, type LiveShareInfo } from '@/services/api/safety';

const POLL_MS = 15000;

/**
 * Pantalla pública de "compartir viaje en vivo" (Sesión 9): la abre el
 * contacto de confianza por el link (no requiere cuenta Unities). Muestra
 * conductor, patente y última posición, y se refresca sola. Sin mapa nativo:
 * funciona igual en el navegador; el botón abre Google Maps con la posición.
 */
export default function LiveShareScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [info, setInfo] = useState<LiveShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getLiveShare(String(token));
      if (!data) {
        setNotFound(true);
      } else {
        setInfo(data);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator color="#22d3ee" />
        </View>
      </SafeAreaView>
    );
  }

  if (notFound || !info) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#94a3b8" />
          <Text style={styles.title}>Enlace no disponible</Text>
          <Text style={styles.subtitle}>Este viaje compartido ya no está activo o el enlace expiró.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasPosition = info.lastLat != null && info.lastLng != null;
  const mapsUrl = hasPosition ? `https://maps.google.com/?q=${info.lastLat},${info.lastLng}` : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statusPill}>
          <View style={[styles.dot, { backgroundColor: info.active ? '#22c55e' : '#f87171' }]} />
          <Text style={styles.statusText}>{info.active ? 'Viaje en curso' : 'Viaje finalizado'}</Text>
        </View>

        <Text style={styles.title}>
          {info.originCampus ?? 'Origen'} → {info.destinationCampus ?? 'Destino'}
        </Text>
        {info.sharerName && <Text style={styles.subtitle}>{info.sharerName} compartió este viaje contigo.</Text>}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Conductor y vehículo</Text>
          <Row icon="person-outline" text={`${info.driverName ?? 'Conductor'}${info.driverRating != null ? ` · ${Number(info.driverRating).toFixed(1)}/5` : ''}`} />
          <Row
            icon="car-outline"
            text={
              [info.vehicleBrand, info.vehicleModel, info.vehicleColor].filter(Boolean).join(' ') ||
              'Vehículo sin registrar'
            }
          />
          {info.vehiclePlate && <Row icon="pricetag-outline" text={`Patente ${info.vehiclePlate}`} />}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ubicación en vivo</Text>
          {hasPosition ? (
            <>
              <Text style={styles.coords}>
                {info.lastLat!.toFixed(5)}, {info.lastLng!.toFixed(5)}
              </Text>
              {info.lastUpdateAt && (
                <Text style={styles.updated}>
                  Actualizado {new Date(info.lastUpdateAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              )}
              {mapsUrl && (
                <TouchableOpacity style={styles.mapButton} onPress={() => Linking.openURL(mapsUrl).catch(() => undefined)}>
                  <Ionicons name="map-outline" size={16} color="#0b1221" />
                  <Text style={styles.mapButtonText}>Ver en Google Maps</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <Text style={styles.subtitle}>Aún no hay una posición registrada.</Text>
          )}
        </View>

        <Text style={styles.footer}>Esta página se actualiza automáticamente cada 15 segundos.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color="#94a3b8" />
      <Text style={styles.rowText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#020617' },
  content: { padding: 20, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: '#e2e8f0', fontWeight: '700' },
  title: { color: '#f8fafc', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#94a3b8' },
  card: { backgroundColor: '#0f172a', borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: '#1e293b' },
  cardTitle: { color: '#e2e8f0', fontWeight: '700', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowText: { color: '#cbd5e1', fontSize: 14, flexShrink: 1 },
  coords: { color: '#f8fafc', fontSize: 18, fontWeight: '700' },
  updated: { color: '#64748b', fontSize: 12 },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#22d3ee',
    borderRadius: 10,
    paddingVertical: 11,
    marginTop: 4,
  },
  mapButtonText: { color: '#0b1221', fontWeight: '800' },
  footer: { color: '#475569', fontSize: 12, textAlign: 'center', marginTop: 4 },
});

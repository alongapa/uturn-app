import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { RedemptionQR } from '@/components/redemption-qr';
import type { RedemptionStatus } from '@/models/uturn';
import { getRedemptionStatus } from '@/services/credits';
import { useAppState } from '@/store/appState';

const formatDateCL = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const STATUS_COPY: Record<RedemptionStatus, { label: string; hint: string }> = {
  disponible: {
    label: 'Disponible',
    hint: 'Muestra este código o QR en el local para usar tu canje.',
  },
  canjeado: {
    label: 'Canjeado',
    hint: 'Este canje ya fue utilizado.',
  },
  expirado: {
    label: 'Expirado',
    hint: 'El plazo para usar este canje terminó. Los créditos no se devuelven.',
  },
};

export default function RedemptionDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { redemptions, markRedemptionUsed } = useAppState();

  const redemption = redemptions.find((item) => item.id === id);

  if (!redemption) {
    return (
      <View style={styles.missingContainer}>
        <Text style={styles.missingText}>No encontramos este canje.</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const status = getRedemptionStatus(redemption);
  const copy = STATUS_COPY[status];

  const handleMarkUsed = () => {
    Alert.alert('Marcar como canjeado', '¿Ya usaste este canje en el local?', [
      { text: 'Todavía no', style: 'cancel' },
      { text: 'Sí, canjeado', onPress: () => markRedemptionUsed(redemption.id) },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{redemption.titulo}</Text>
      <View
        style={[
          styles.statusBadge,
          status === 'disponible'
            ? styles.statusAvailable
            : status === 'canjeado'
            ? styles.statusUsed
            : styles.statusExpired,
        ]}
      >
        <Text style={styles.statusText}>{copy.label}</Text>
      </View>

      <View style={[styles.qrSection, status !== 'disponible' && styles.qrInactive]}>
        <RedemptionQR value={redemption.codigo} />
        <Text style={styles.code}>{redemption.codigo}</Text>
      </View>

      <Text style={styles.hint}>{copy.hint}</Text>

      <View style={styles.detailCard}>
        <DetailRow label="Costo" value={`${redemption.costoCreditos} créditos`} />
        <DetailRow label="Canjeado el" value={formatDateCL(redemption.createdAt)} />
        <DetailRow label="Válido hasta" value={formatDateCL(redemption.expiraAt)} />
        {redemption.canjeadoAt ? (
          <DetailRow label="Usado el" value={formatDateCL(redemption.canjeadoAt)} />
        ) : null}
      </View>

      {status === 'disponible' && (
        <TouchableOpacity style={styles.primaryButton} onPress={handleMarkUsed}>
          <Text style={styles.primaryButtonText}>Marcar como canjeado</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 12, alignItems: 'center', paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  statusBadge: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  statusAvailable: { backgroundColor: '#dcfce7' },
  statusUsed: { backgroundColor: '#e2e8f0' },
  statusExpired: { backgroundColor: '#fee2e2' },
  statusText: { fontWeight: '800', color: '#0f172a' },
  qrSection: { alignItems: 'center', gap: 8, marginTop: 8 },
  qrInactive: { opacity: 0.35 },
  code: { fontSize: 18, fontWeight: '800', color: '#0f172a', letterSpacing: 1.5 },
  hint: { color: '#64748b', textAlign: 'center' },
  detailCard: {
    alignSelf: 'stretch',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },
  detailLabel: { color: '#64748b', fontWeight: '600' },
  detailValue: { color: '#0f172a', fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  primaryButton: {
    alignSelf: 'stretch',
    backgroundColor: '#0A1525',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#ffffff', fontWeight: '800' },
  missingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  missingText: { color: '#475569', fontSize: 16 },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
  },
  secondaryButtonText: { color: '#0A1525', fontWeight: '700' },
});

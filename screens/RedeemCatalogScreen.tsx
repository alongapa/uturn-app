import { router } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { REDEEMABLE_ITEMS } from '@/constants/mock-unities';
import type { RedeemableCategory, RedeemableItem, RedemptionStatus } from '@/models/unities';
import { track } from '@/services/api/analytics';
import { getRedemptionStatus } from '@/services/credits';
import { useAppState } from '@/store/appState';

const CATEGORY_LABELS: Record<RedeemableCategory, string> = {
  comida: 'Comida',
  merch: 'Merch',
  eventos: 'Eventos',
  servicios: 'Servicios',
};

const STATUS_LABELS: Record<RedemptionStatus, string> = {
  disponible: 'Disponible',
  canjeado: 'Canjeado',
  expirado: 'Expirado',
};

export default function RedeemCatalogScreen() {
  const { creditBalance, redemptions, redeemItem } = useAppState();
  const now = new Date();

  const handleRedeem = (item: RedeemableItem) => {
    track({ eventType: 'click', entityType: 'redeemable', entityId: item.id, category: item.categoria });
    Alert.alert(
      'Confirmar canje',
      `¿Canjear "${item.titulo}" por ${item.costoCreditos} créditos?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Canjear',
          onPress: () => {
            const result = redeemItem(item);
            if (!result.success || !result.redemption) {
              Alert.alert(result.reason ?? 'No pudimos completar el canje');
              return;
            }
            router.push(`/redeem/${result.redemption.id}`);
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.balanceBar}>
        <Text style={styles.balanceText}>Tu saldo</Text>
        <Text style={styles.balanceValue}>{creditBalance.toLocaleString('es-CL')} créditos</Text>
      </View>

      <Text style={styles.sectionTitle}>Catálogo de canjes</Text>
      <Text style={styles.sectionHint}>
        Los canjes se publican por la administración y se pagan con créditos Unities.
      </Text>

      <View style={styles.catalog}>
        {REDEEMABLE_ITEMS.map((item) => {
          const affordable = creditBalance >= item.costoCreditos;
          return (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <View style={styles.categoryChip}>
                  <Text style={styles.categoryChipText}>{CATEGORY_LABELS[item.categoria]}</Text>
                </View>
                <Text style={styles.itemCost}>{item.costoCreditos} créditos</Text>
              </View>
              <Text style={styles.itemTitle}>{item.titulo}</Text>
              <Text style={styles.itemDescription}>{item.descripcion}</Text>
              <View style={styles.itemFooter}>
                <Text style={styles.itemMeta}>
                  {item.patrocinador ? `Con ${item.patrocinador} · ` : ''}Válido {item.vigenciaDias} días tras canjear
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.redeemButton, !affordable && styles.redeemButtonDisabled]}
                disabled={!affordable}
                onPress={() => handleRedeem(item)}
              >
                <Text style={[styles.redeemButtonText, !affordable && styles.redeemButtonTextDisabled]}>
                  {affordable ? 'Canjear' : 'Créditos insuficientes'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>Mis canjes</Text>
      {redemptions.length === 0 ? (
        <Text style={styles.empty}>Todavía no has canjeado nada.</Text>
      ) : (
        <View style={styles.redemptionList}>
          {redemptions.map((redemption) => {
            const status = getRedemptionStatus(redemption, now);
            return (
              <TouchableOpacity
                key={redemption.id}
                style={styles.redemptionRow}
                onPress={() => router.push(`/redeem/${redemption.id}`)}
              >
                <View style={styles.redemptionInfo}>
                  <Text style={styles.redemptionTitle}>{redemption.titulo}</Text>
                  <Text style={styles.redemptionMeta}>Código {redemption.codigo}</Text>
                </View>
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
                  <Text style={styles.statusBadgeText}>{STATUS_LABELS[status]}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  balanceBar: {
    backgroundColor: '#0A1525',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceText: { color: '#94a3b8', fontWeight: '600' },
  balanceValue: { color: '#ffffff', fontWeight: '800', fontSize: 18 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginTop: 8 },
  sectionHint: { color: '#64748b', marginTop: -6 },
  catalog: { gap: 12 },
  itemCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    gap: 8,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryChip: {
    backgroundColor: '#e0f2fe',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryChipText: { color: '#0369a1', fontWeight: '700', fontSize: 12 },
  itemCost: { color: '#2563eb', fontWeight: '800' },
  itemTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  itemDescription: { color: '#475569' },
  itemFooter: { marginTop: 2 },
  itemMeta: { color: '#94a3b8', fontSize: 12 },
  redeemButton: {
    marginTop: 6,
    backgroundColor: '#0A1525',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  redeemButtonDisabled: { backgroundColor: '#e2e8f0' },
  redeemButtonText: { color: '#ffffff', fontWeight: '800' },
  redeemButtonTextDisabled: { color: '#94a3b8' },
  redemptionList: { gap: 8 },
  redemptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 12,
  },
  redemptionInfo: { flex: 1, gap: 2 },
  redemptionTitle: { color: '#0f172a', fontWeight: '600' },
  redemptionMeta: { color: '#94a3b8', fontSize: 12 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusAvailable: { backgroundColor: '#dcfce7' },
  statusUsed: { backgroundColor: '#e2e8f0' },
  statusExpired: { backgroundColor: '#fee2e2' },
  statusBadgeText: { fontWeight: '700', fontSize: 12, color: '#0f172a' },
  empty: { color: '#94a3b8' },
});

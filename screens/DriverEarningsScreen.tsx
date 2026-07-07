import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useUser } from '@/contexts/UserContext';
import {
  getDriverEarnings,
  listPayouts,
  type DriverEarnings,
  type Payout,
} from '@/services/api/payments';
import { formatCLP } from '@/services/payments';
import { isSupabaseConfigured } from '@/services/supabase';

const formatDateCL = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

/**
 * "Mis ganancias" (Sesión 8): el conductor ve bruto (lo que pagaron los
 * pasajeros), comisión Unities y neto, más el historial de pagos verificados y
 * de liquidaciones. Los montos vienen del servidor (RPC driver_earnings), donde
 * solo cuentan los pagos VERIFICADOS.
 */
export default function DriverEarningsScreen() {
  const { isAuthenticated } = useUser();
  const online = isSupabaseConfigured && isAuthenticated;
  const [earnings, setEarnings] = useState<DriverEarnings | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!online) {
      setLoading(false);
      return;
    }
    try {
      const [e, p] = await Promise.all([getDriverEarnings(), listPayouts()]);
      setEarnings(e);
      setPayouts(p);
      setError(null);
    } catch {
      setError('No pudimos cargar tus ganancias. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [online]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  if (!online) {
    return (
      <View style={styles.center}>
        <Ionicons name="wallet-outline" size={40} color="#94a3b8" />
        <Text style={styles.emptyText}>
          Inicia sesión con tu cuenta Unities para ver tus ganancias como conductor.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  const gross = earnings?.grossClp ?? 0;
  const commission = earnings?.commissionClp ?? 0;
  const net = earnings?.netClp ?? 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.netCard}>
        <Text style={styles.netLabel}>Neto acumulado</Text>
        <Text style={styles.netValue}>{formatCLP(net)}</Text>
        <Text style={styles.netCaption}>
          De {earnings?.paymentCount ?? 0} pago{(earnings?.paymentCount ?? 0) === 1 ? '' : 's'} verificado
          {(earnings?.paymentCount ?? 0) === 1 ? '' : 's'}
        </Text>
      </View>

      <View style={styles.breakdownRow}>
        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownLabel}>Bruto</Text>
          <Text style={styles.breakdownValue}>{formatCLP(gross)}</Text>
        </View>
        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownLabel}>Comisión Unities</Text>
          <Text style={[styles.breakdownValue, styles.commission]}>-{formatCLP(commission)}</Text>
        </View>
      </View>

      <View style={styles.pendingCard}>
        <Text style={styles.pendingTitle}>Por liquidar</Text>
        <Text style={styles.pendingValue}>{formatCLP(earnings?.pendingNetClp ?? 0)}</Text>
        <Text style={styles.pendingCaption}>
          Neto de pagos verificados aún no incluidos en una liquidación.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Pagos recibidos</Text>
      {earnings && earnings.items.length > 0 ? (
        earnings.items.map((item) => (
          <View key={item.bookingId} style={styles.itemCard}>
            <View style={styles.itemRow}>
              <Text style={styles.itemRoute} numberOfLines={1}>
                {item.route}
              </Text>
              <Text style={styles.itemNet}>{formatCLP(item.netClp)}</Text>
            </View>
            <View style={styles.itemRow}>
              <Text style={styles.itemMeta}>
                {formatDateCL(item.confirmedAt)} · bruto {formatCLP(item.grossClp)} · comisión{' '}
                {formatCLP(item.commissionClp)}
              </Text>
              <View style={[styles.pill, item.settled ? styles.pillPaid : styles.pillPending]}>
                <Text style={styles.pillText}>{item.settled ? 'Liquidado' : 'Pendiente'}</Text>
              </View>
            </View>
          </View>
        ))
      ) : (
        <Text style={styles.emptyMuted}>
          Aún no recibes pagos verificados. Aparecerán aquí cuando un pasajero pague y el banco lo
          confirme.
        </Text>
      )}

      <Text style={styles.sectionTitle}>Liquidaciones</Text>
      {payouts.length > 0 ? (
        payouts.map((p) => (
          <View key={p.id} style={styles.payoutCard}>
            <View style={styles.itemRow}>
              <Text style={styles.itemRoute}>
                {formatDateCL(p.periodStart)} – {formatDateCL(p.periodEnd)}
              </Text>
              <View style={[styles.pill, p.status === 'pagada' ? styles.pillPaid : styles.pillPending]}>
                <Text style={styles.pillText}>{p.status === 'pagada' ? 'Pagada' : 'Pendiente'}</Text>
              </View>
            </View>
            <Text style={styles.itemMeta}>
              Neto {formatCLP(p.netClp)} · {p.paymentCount} pago{p.paymentCount === 1 ? '' : 's'}
            </Text>
          </View>
        ))
      ) : (
        <Text style={styles.emptyMuted}>Todavía no tienes liquidaciones.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, backgroundColor: '#f4f7fb' },
  error: { color: '#b91c1c', backgroundColor: '#fee2e2', borderRadius: 10, padding: 10 },
  emptyText: { color: '#64748b', textAlign: 'center', lineHeight: 20 },
  emptyMuted: { color: '#94a3b8', fontSize: 13 },
  netCard: { backgroundColor: '#0A1525', borderRadius: 16, padding: 20, gap: 4 },
  netLabel: { color: '#94a3b8', fontWeight: '700' },
  netValue: { color: '#4ade80', fontWeight: '800', fontSize: 34 },
  netCaption: { color: '#cbd5e1', fontSize: 12 },
  breakdownRow: { flexDirection: 'row', gap: 12 },
  breakdownCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 4,
  },
  breakdownLabel: { color: '#64748b', fontSize: 13 },
  breakdownValue: { color: '#0f172a', fontWeight: '800', fontSize: 18 },
  commission: { color: '#b45309' },
  pendingCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    padding: 14,
    gap: 2,
  },
  pendingTitle: { color: '#1d4ed8', fontWeight: '800' },
  pendingValue: { color: '#0f172a', fontWeight: '800', fontSize: 20 },
  pendingCaption: { color: '#475569', fontSize: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 8 },
  itemCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 6,
  },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  itemRoute: { color: '#0f172a', fontWeight: '700', flexShrink: 1 },
  itemNet: { color: '#16a34a', fontWeight: '800' },
  itemMeta: { color: '#64748b', fontSize: 12, flexShrink: 1 },
  payoutCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 6,
  },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillPaid: { backgroundColor: '#dcfce7' },
  pillPending: { backgroundColor: '#fef9c3' },
  pillText: { fontSize: 11, fontWeight: '800', color: '#0f172a' },
});

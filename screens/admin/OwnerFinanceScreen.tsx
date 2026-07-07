import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { AdminGuard } from '@/components/admin/admin-guard';
import {
  getOwnerFinance,
  getPlatformConfig,
  updatePlatformConfig,
  type OwnerFinance,
} from '@/services/api/payments';
import type { PaymentConfig } from '@/services/payments';
import { formatCLP } from '@/services/payments';

/**
 * Panel financiero del owner (Sesión 8): comisiones acumuladas, volumen por
 * campus, morosidad (vencidos, disputas, strikes, baneos) y la configuración
 * financiera editable (comisión, tasa de créditos, tope de descuento). Cada
 * acción está respaldada por is_owner() en el servidor.
 */
export default function OwnerFinanceScreen() {
  const [finance, setFinance] = useState<OwnerFinance | null>(null);
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Campos editables de la config.
  const [commission, setCommission] = useState('');
  const [creditRate, setCreditRate] = useState('');
  const [maxPct, setMaxPct] = useState('');

  const load = useCallback(async () => {
    try {
      const [f, c] = await Promise.all([getOwnerFinance(), getPlatformConfig()]);
      setFinance(f);
      setConfig(c);
      setCommission(String(c.commissionCLP));
      setCreditRate(String(c.creditClpRate));
      setMaxPct(String(c.maxCreditDiscountPct));
    } catch {
      Alert.alert('No se pudo cargar el panel financiero.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const updated = await updatePlatformConfig({
        commissionCLP: Number(commission) || 0,
        creditClpRate: Math.max(1, Number(creditRate) || 1),
        maxCreditDiscountPct: Math.min(100, Math.max(0, Number(maxPct) || 0)),
      });
      setConfig(updated);
      Alert.alert('Configuración actualizada');
    } catch (err) {
      Alert.alert('No se pudo guardar', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminGuard ownerOnly>
        <View style={styles.center}>
          <ActivityIndicator color="#2563eb" />
        </View>
      </AdminGuard>
    );
  }

  const m = finance?.morosidad;

  return (
    <AdminGuard ownerOnly>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View style={styles.heroRow}>
          <View style={[styles.heroCard, styles.heroCommission]}>
            <Text style={styles.heroLabel}>Comisiones Unities</Text>
            <Text style={styles.heroValue}>{formatCLP(finance?.totalCommissionClp ?? 0)}</Text>
          </View>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>Volumen verificado</Text>
            <Text style={styles.heroValueDark}>{formatCLP(finance?.totalVolumeClp ?? 0)}</Text>
            <Text style={styles.heroCaption}>{finance?.confirmedCount ?? 0} pagos</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Volumen por campus</Text>
        {finance && finance.byCampus.length > 0 ? (
          finance.byCampus.map((c) => (
            <View key={c.campus} style={styles.campusRow}>
              <View style={styles.campusInfo}>
                <Text style={styles.campusName}>{c.campus}</Text>
                <Text style={styles.campusMeta}>
                  {c.count} pago{c.count === 1 ? '' : 's'} · comisión {formatCLP(c.commissionClp)}
                </Text>
              </View>
              <Text style={styles.campusVolume}>{formatCLP(c.volumeClp)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>Aún no hay pagos verificados.</Text>
        )}

        <Text style={styles.sectionTitle}>Morosidad y riesgo</Text>
        <View style={styles.grid}>
          <StatCard label="Pagos vencidos" value={`${m?.overdueCount ?? 0}`} sub={formatCLP(m?.overdueClp ?? 0)} tone="warn" />
          <StatCard label="Disputas abiertas" value={`${m?.openDisputes ?? 0}`} sub={`${m?.disputedCount ?? 0} en revisión`} tone="info" />
          <StatCard label="Strikes activos" value={`${m?.activeStrikes ?? 0}`} tone="warn" />
          <StatCard label="Baneos activos" value={`${m?.activeBans ?? 0}`} tone="danger" />
        </View>
        <View style={styles.pendingPayouts}>
          <Text style={styles.pendingLabel}>Neto por liquidar a conductores</Text>
          <Text style={styles.pendingValue}>{formatCLP(finance?.payoutsPendingNetClp ?? 0)}</Text>
        </View>

        <Text style={styles.sectionTitle}>Configuración financiera</Text>
        <View style={styles.configCard}>
          <ConfigField
            label="Comisión Unities por cupo (CLP)"
            value={commission}
            onChangeText={setCommission}
          />
          <ConfigField
            label="Valor de 1 crédito al pagar (CLP)"
            value={creditRate}
            onChangeText={setCreditRate}
          />
          <ConfigField
            label="Máximo del cupo pagable con créditos (%)"
            value={maxPct}
            onChangeText={setMaxPct}
          />
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.disabled]}
            onPress={handleSaveConfig}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.saveButtonText}>Guardar configuración</Text>
            )}
          </TouchableOpacity>
          {config && (
            <Text style={styles.configHint}>
              <Ionicons name="information-circle-outline" size={13} color="#64748b" /> Afecta las
              próximas reservas y pagos con créditos.
            </Text>
          )}
        </View>
      </ScrollView>
    </AdminGuard>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: 'warn' | 'info' | 'danger';
}) {
  return (
    <View style={[styles.statCard, tone === 'warn' && styles.toneWarn, tone === 'info' && styles.toneInfo, tone === 'danger' && styles.toneDanger]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function ConfigField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} keyboardType="number-pad" style={styles.fieldInput} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f7fb' },
  heroRow: { flexDirection: 'row', gap: 12 },
  heroCard: { flex: 1, backgroundColor: '#ffffff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 2 },
  heroCommission: { backgroundColor: '#0A1525', borderColor: '#0A1525' },
  heroLabel: { color: '#94a3b8', fontWeight: '700', fontSize: 12 },
  heroValue: { color: '#4ade80', fontWeight: '800', fontSize: 22 },
  heroValueDark: { color: '#0f172a', fontWeight: '800', fontSize: 22 },
  heroCaption: { color: '#64748b', fontSize: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 10 },
  muted: { color: '#94a3b8', fontSize: 13 },
  campusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  campusInfo: { flexShrink: 1, gap: 2 },
  campusName: { color: '#0f172a', fontWeight: '700' },
  campusMeta: { color: '#64748b', fontSize: 12 },
  campusVolume: { color: '#0f172a', fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    width: '47%',
    flexGrow: 1,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    gap: 2,
  },
  toneWarn: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  toneInfo: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  toneDanger: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  statValue: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  statLabel: { color: '#475569', fontSize: 12, fontWeight: '600' },
  statSub: { color: '#94a3b8', fontSize: 11 },
  pendingPayouts: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 2,
  },
  pendingLabel: { color: '#475569', fontWeight: '600', fontSize: 13 },
  pendingValue: { color: '#0f172a', fontWeight: '800', fontSize: 20 },
  configCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 12,
  },
  field: { gap: 6 },
  fieldLabel: { color: '#475569', fontWeight: '600', fontSize: 13 },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
  },
  saveButton: { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  saveButtonText: { color: '#ffffff', fontWeight: '800' },
  disabled: { opacity: 0.6 },
  configHint: { color: '#64748b', fontSize: 12 },
});

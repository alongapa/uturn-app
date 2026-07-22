import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { AdminGuard } from '@/components/admin/admin-guard';
import { UNIVERSITIES } from '@/constants/campuses';
import {
  getAnalyticsConfig,
  getUniversityTrends,
  updateAnalyticsConfig,
  type AnalyticsConfig,
  type TrendRow,
} from '@/services/api/analytics';

const ENTITY_LABEL: Record<string, string> = {
  post: 'Publicaciones',
  story: 'Historias',
  widget: 'Widgets',
  redeemable: 'Canjes',
  tab: 'Tabs',
};

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function trendsToCsv(rows: TrendRow[]): string {
  const header = [
    'semana',
    'campus',
    'tipo_entidad',
    'tipo_evento',
    'categoria',
    'publisher_id',
    'eventos',
    'cuentas_distintas',
    'crecimiento_wow_pct',
  ];
  const lines = rows.map((r) =>
    [
      r.weekStart,
      r.campusId ?? '',
      r.entityType,
      r.eventType,
      r.category ?? '',
      r.publisherId ?? '',
      String(r.events),
      String(r.distinctActors),
      r.growthWowPct != null ? String(r.growthWowPct) : '',
    ]
      .map(csvEscape)
      .join(',')
  );
  return [header.join(','), ...lines].join('\n');
}

function trendsToHtml(rows: TrendRow[], universityName: string): string {
  const body = rows
    .map(
      (r) => `<tr>
        <td>${r.weekStart}</td>
        <td>${r.campusId ?? '—'}</td>
        <td>${ENTITY_LABEL[r.entityType] ?? r.entityType}</td>
        <td>${r.category ?? '—'}</td>
        <td>${r.events}</td>
        <td>${r.distinctActors}</td>
        <td>${r.growthWowPct != null ? `${r.growthWowPct}%` : '—'}</td>
      </tr>`
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8" />
    <style>
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0f172a; padding: 24px; }
      h1 { font-size: 18px; }
      p.hint { color: #64748b; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #e2e8f0; padding: 6px 8px; font-size: 12px; text-align: left; }
      th { background: #f4f7fb; }
    </style></head>
    <body>
      <h1>Tendencias — ${universityName}</h1>
      <p class="hint">Agregado y anonimizado: solo cohortes con el mínimo de cuentas configurado. Sin datos individuales.</p>
      <table>
        <thead><tr><th>Semana</th><th>Campus</th><th>Tipo</th><th>Categoría</th><th>Eventos</th><th>Cuentas distintas</th><th>Var. WoW</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </body></html>`;
}

/**
 * Panel de tendencias del owner (Sesión Analítica de tendencias): lee
 * university_trends() — ya agregado y con supresión k-anónima aplicada en el
 * servidor — y permite exportar el resultado (CSV/PDF). Nunca se seleccionan
 * ni se muestran identificadores de alumnos: solo conteos por cohorte.
 */
export default function AnalyticsTrendsScreen() {
  const [universityId, setUniversityId] = useState(UNIVERSITIES[0]?.id ?? '');
  const [rows, setRows] = useState<TrendRow[]>([]);
  const [config, setConfig] = useState<AnalyticsConfig | null>(null);
  const [kInput, setKInput] = useState('');
  const [retentionInput, setRetentionInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    const [trendRows, cfg] = await Promise.all([
      getUniversityTrends(universityId).catch(() => [] as TrendRow[]),
      getAnalyticsConfig(),
    ]);
    setRows(trendRows);
    setConfig(cfg);
    setKInput(String(cfg.kAnonymity));
    setRetentionInput(String(cfg.retentionDays));
  }, [universityId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load()
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }, [load]);

  const totals = useMemo(() => {
    const events = rows.reduce((acc, r) => acc + r.events, 0);
    // Suma simple de distinct_actors por cohorte: no es "usuarios únicos
    // totales" (una persona puede aparecer en varias filas), solo un
    // indicador agregado de actividad — coherente con lo que expone el RPC.
    const cohorts = rows.length;
    return { events, cohorts };
  }, [rows]);

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const updated = await updateAnalyticsConfig({
        kAnonymity: Math.max(5, Number(kInput) || 5),
        retentionDays: Math.max(7, Number(retentionInput) || 7),
      });
      setConfig(updated);
      Alert.alert('Configuración actualizada');
    } catch (err) {
      Alert.alert('No se pudo guardar', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const universityName =
    UNIVERSITIES.find((u) => u.id === universityId)?.name ?? universityId;

  const handleExportCsv = async () => {
    if (rows.length === 0) {
      Alert.alert('No hay datos que exportar todavía.');
      return;
    }
    setExporting(true);
    try {
      const csv = trendsToCsv(rows);
      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `tendencias-${universityId}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        return;
      }
      const path = `${FileSystem.cacheDirectory}tendencias-${universityId}-${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Exportar tendencias (CSV)' });
      } else {
        Alert.alert('CSV generado', path);
      }
    } catch {
      Alert.alert('No se pudo exportar el CSV');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (rows.length === 0) {
      Alert.alert('No hay datos que exportar todavía.');
      return;
    }
    setExporting(true);
    try {
      const html = trendsToHtml(rows, universityName);
      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Exportar tendencias (PDF)' });
      } else {
        Alert.alert('PDF generado', uri);
      }
    } catch {
      Alert.alert('No se pudo exportar el PDF');
    } finally {
      setExporting(false);
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

  return (
    <AdminGuard ownerOnly>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <Text style={styles.hint}>
          Agregado y anonimizado: cada cifra representa al menos {config?.kAnonymity ?? 20} cuentas
          distintas. Ninguna fila identifica a un alumno.
        </Text>

        <Text style={styles.sectionTitle}>Universidad</Text>
        <View style={styles.chipRow}>
          {UNIVERSITIES.map((u) => (
            <TouchableOpacity
              key={u.id}
              style={[styles.chip, universityId === u.id && styles.chipSelected]}
              onPress={() => setUniversityId(u.id)}
            >
              <Text style={[styles.chipText, universityId === u.id && styles.chipTextSelected]}>
                {u.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.heroRow}>
          <View style={[styles.heroCard, styles.heroDark]}>
            <Text style={styles.heroLabel}>Eventos (12 semanas)</Text>
            <Text style={styles.heroValue}>{totals.events.toLocaleString('es-CL')}</Text>
          </View>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>Cohortes visibles</Text>
            <Text style={styles.heroValueDark}>{totals.cohorts}</Text>
            <Text style={styles.heroCaption}>≥ k por fila</Text>
          </View>
        </View>

        <View style={styles.exportRow}>
          <TouchableOpacity style={styles.exportButton} onPress={handleExportCsv} disabled={exporting}>
            {exporting ? <ActivityIndicator color="#0f172a" /> : (
              <>
                <Ionicons name="document-text-outline" size={16} color="#0f172a" />
                <Text style={styles.exportButtonText}>Exportar CSV</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportButton} onPress={handleExportPdf} disabled={exporting}>
            {exporting ? <ActivityIndicator color="#0f172a" /> : (
              <>
                <Ionicons name="print-outline" size={16} color="#0f172a" />
                <Text style={styles.exportButtonText}>Exportar PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Tendencias por semana</Text>
        {rows.length === 0 ? (
          <Text style={styles.muted}>
            Todavía no hay cohortes con suficientes cuentas distintas para mostrar en esta
            universidad (umbral k = {config?.kAnonymity ?? 20}).
          </Text>
        ) : (
          rows.map((r, i) => (
            <View key={`${r.weekStart}-${r.entityType}-${r.category}-${r.campusId}-${i}`} style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>
                  {ENTITY_LABEL[r.entityType] ?? r.entityType}
                  {r.category ? ` · ${r.category}` : ''}
                </Text>
                <Text style={styles.rowMeta}>
                  Semana {r.weekStart} · {r.campusId ?? 'todos los campus'}
                </Text>
              </View>
              <View style={styles.rowStats}>
                <Text style={styles.rowEvents}>{r.events} eventos</Text>
                <Text style={styles.rowActors}>{r.distinctActors} cuentas</Text>
                {r.growthWowPct != null && (
                  <Text style={[styles.rowGrowth, r.growthWowPct < 0 && styles.rowGrowthNegative]}>
                    {r.growthWowPct > 0 ? '+' : ''}
                    {r.growthWowPct}% WoW
                  </Text>
                )}
              </View>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Configuración de privacidad</Text>
        <View style={styles.configCard}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Umbral de k-anonimato (mínimo de cuentas por cifra)</Text>
            <TextInput value={kInput} onChangeText={setKInput} keyboardType="number-pad" style={styles.fieldInput} />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Retención de eventos crudos (días)</Text>
            <TextInput
              value={retentionInput}
              onChangeText={setRetentionInput}
              keyboardType="number-pad"
              style={styles.fieldInput}
            />
          </View>
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.disabled]}
            onPress={handleSaveConfig}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveButtonText}>Guardar</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </AdminGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f7fb' },
  hint: { color: '#64748b', fontSize: 12, lineHeight: 17 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 10 },
  muted: { color: '#94a3b8', fontSize: 13 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  chipSelected: { backgroundColor: '#0A1525', borderColor: '#0A1525' },
  chipText: { color: '#0f172a', fontWeight: '600', fontSize: 13 },
  chipTextSelected: { color: '#ffffff' },
  heroRow: { flexDirection: 'row', gap: 12 },
  heroCard: { flex: 1, backgroundColor: '#ffffff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 2 },
  heroDark: { backgroundColor: '#0A1525', borderColor: '#0A1525' },
  heroLabel: { color: '#94a3b8', fontWeight: '700', fontSize: 12 },
  heroValue: { color: '#4ade80', fontWeight: '800', fontSize: 22 },
  heroValueDark: { color: '#0f172a', fontWeight: '800', fontSize: 22 },
  heroCaption: { color: '#64748b', fontSize: 12 },
  exportRow: { flexDirection: 'row', gap: 10 },
  exportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 11,
  },
  exportButtonText: { color: '#0f172a', fontWeight: '700', fontSize: 13 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 8,
  },
  rowInfo: { flexShrink: 1, gap: 2 },
  rowTitle: { color: '#0f172a', fontWeight: '700', fontSize: 13 },
  rowMeta: { color: '#64748b', fontSize: 11 },
  rowStats: { alignItems: 'flex-end', gap: 1 },
  rowEvents: { color: '#0f172a', fontWeight: '800', fontSize: 13 },
  rowActors: { color: '#64748b', fontSize: 11 },
  rowGrowth: { color: '#16a34a', fontSize: 11, fontWeight: '700' },
  rowGrowthNegative: { color: '#dc2626' },
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
});

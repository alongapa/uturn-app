import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { AdminGuard } from '@/components/admin/admin-guard';
import type { RedeemableProposal } from '@/services/api/admin';
import { listMyPublishers, listMyProposals, proposeRedeemable } from '@/services/api/admin';
import type { FeedPublisher } from '@/services/api/feed';
import type { RedeemableCategory, RedeemableStatus } from '@/types/database';

const CATEGORIES: RedeemableCategory[] = ['comida', 'merch', 'eventos', 'servicios'];

const STATUS_STYLE: Record<RedeemableStatus, { label: string; fg: string; bg: string }> = {
  pendiente: { label: 'Pendiente', fg: '#b45309', bg: '#fef3c7' },
  aprobado: { label: 'Aprobado', fg: '#15803d', bg: '#dcfce7' },
  rechazado: { label: 'Rechazado', fg: '#b91c1c', bg: '#fee2e2' },
};

/**
 * Postulación de canjeables (Sesión 5): el admin propone (estado 'pendiente'
 * forzado por RLS) y el owner aprueba/rechaza en el servidor. Solo lo
 * aprobado entra al catálogo de canjes de la Sesión 2.
 */
export default function ProposalsScreen() {
  const [publishers, setPublishers] = useState<FeedPublisher[]>([]);
  const [proposals, setProposals] = useState<RedeemableProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [categoria, setCategoria] = useState<RedeemableCategory>('comida');
  const [costo, setCosto] = useState('');
  const [stock, setStock] = useState('');
  const [vigencia, setVigencia] = useState('7');
  const [publisherId, setPublisherId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [mine, list] = await Promise.all([listMyPublishers(), listMyProposals()]);
    setPublishers(mine);
    setPublisherId((prev) => prev ?? mine[0]?.id ?? null);
    setProposals(list);
  }, []);

  useEffect(() => {
    let active = true;
    load()
      .catch(() => active && Alert.alert('No se pudieron cargar tus postulaciones'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load]);

  const handleSubmit = useCallback(async () => {
    const cost = Number(costo);
    if (!titulo.trim() || !descripcion.trim()) {
      Alert.alert('Completa título y descripción');
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      Alert.alert('Costo inválido', 'Indica el costo en créditos (0 o más).');
      return;
    }
    setSending(true);
    try {
      await proposeRedeemable({
        titulo,
        descripcion,
        categoria,
        costoCreditos: Math.round(cost),
        stock: stock.trim() ? Math.max(Math.round(Number(stock)) || 0, 0) : null,
        vigenciaDias: Math.max(Math.round(Number(vigencia)) || 7, 1),
        publisherId,
      });
      setTitulo('');
      setDescripcion('');
      setCosto('');
      setStock('');
      setVigencia('7');
      await load();
      Alert.alert('Postulación enviada', 'El owner la revisará; te avisaremos su decisión aquí.');
    } catch (error) {
      // Aquí cae el rechazo de RLS (p. ej. proponer para un publisher ajeno).
      Alert.alert(
        'No se pudo postular',
        error instanceof Error ? error.message : 'Revisa tus permisos.'
      );
    } finally {
      setSending(false);
    }
  }, [titulo, descripcion, categoria, costo, stock, vigencia, publisherId, load]);

  return (
    <AdminGuard>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator style={styles.loader} size="large" color="#246BFD" />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Postular un canjeable</Text>
            <TextInput
              style={styles.input}
              placeholder="Título (p. ej. Café gratis tamaño M)"
              placeholderTextColor="#94a3b8"
              value={titulo}
              onChangeText={setTitulo}
            />
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Descripción y condiciones"
              placeholderTextColor="#94a3b8"
              value={descripcion}
              onChangeText={setDescripcion}
              multiline
            />
            <View style={styles.chipRowWrap}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.chip, categoria === cat && styles.chipActive]}
                  onPress={() => setCategoria(cat)}
                >
                  <Text style={[styles.chipText, categoria === cat && styles.chipTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.half]}
                placeholder="Costo en créditos"
                placeholderTextColor="#94a3b8"
                value={costo}
                onChangeText={setCosto}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.input, styles.half]}
                placeholder="Stock (opcional)"
                placeholderTextColor="#94a3b8"
                value={stock}
                onChangeText={setStock}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.half]}
                placeholder="Vigencia (días)"
                placeholderTextColor="#94a3b8"
                value={vigencia}
                onChangeText={setVigencia}
                keyboardType="numeric"
              />
            </View>
            {publishers.length > 0 && (
              <>
                <Text style={styles.label}>A nombre de</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {publishers.map((pub) => (
                    <TouchableOpacity
                      key={pub.id}
                      style={[styles.chip, publisherId === pub.id && styles.chipActive]}
                      onPress={() => setPublisherId(pub.id)}
                    >
                      <Text
                        style={[styles.chipText, publisherId === pub.id && styles.chipTextActive]}
                      >
                        {pub.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
            <TouchableOpacity
              style={[styles.submitButton, sending && styles.disabled]}
              onPress={handleSubmit}
              disabled={sending}
            >
              <Text style={styles.submitText}>{sending ? 'Enviando…' : 'Enviar al owner'}</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Mis postulaciones</Text>
            {proposals.length === 0 ? (
              <Text style={styles.empty}>Todavía no postulas ningún canjeable.</Text>
            ) : (
              proposals.map((proposal) => {
                const status = STATUS_STYLE[proposal.status];
                return (
                  <View key={proposal.id} style={styles.proposalRow}>
                    <View style={styles.proposalInfo}>
                      <Text style={styles.proposalTitle} numberOfLines={1}>
                        {proposal.titulo}
                      </Text>
                      <Text style={styles.proposalMeta} numberOfLines={1}>
                        {proposal.costoCreditos} créditos · {proposal.categoria}
                        {proposal.stock != null ? ` · stock ${proposal.stock}` : ''}
                      </Text>
                      {proposal.status === 'rechazado' && proposal.reviewNote ? (
                        <Text style={styles.reviewNote} numberOfLines={2}>
                          Nota del owner: {proposal.reviewNote}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.statusBadge, { color: status.fg, backgroundColor: status.bg }]}>
                      {status.label}
                    </Text>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </AdminGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  loader: { marginTop: 48 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginTop: 6 },
  label: { fontWeight: '700', color: '#0f172a', fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  chipRow: { gap: 8 },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  chipActive: { backgroundColor: '#246BFD', borderColor: '#246BFD' },
  chipText: { color: '#475569', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#ffffff' },
  submitButton: {
    backgroundColor: '#0A1525',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  disabled: { opacity: 0.5 },
  submitText: { color: '#ffffff', fontWeight: '800' },
  empty: { color: '#94a3b8', textAlign: 'center', marginTop: 12 },
  proposalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  proposalInfo: { flex: 1, gap: 3 },
  proposalTitle: { color: '#0f172a', fontWeight: '700', fontSize: 14 },
  proposalMeta: { color: '#64748b', fontSize: 12 },
  reviewNote: { color: '#b91c1c', fontSize: 12, lineHeight: 16 },
  statusBadge: {
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
});

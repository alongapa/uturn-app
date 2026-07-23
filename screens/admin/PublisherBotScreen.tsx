import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { AdminGuard } from '@/components/admin/admin-guard';
import { listMyPublishers } from '@/services/api/admin';
import { getPublisherBot, setPublisherBot } from '@/services/api/bots';
import type { FeedPublisher } from '@/services/api/feed';

/**
 * Bot de IA de un publisher (federación/centro de alumnos/marca): un alumno
 * lo abre por DM como a cualquier persona. can_manage_publisher (Sesión 5)
 * decide quién puede configurarlo.
 */
export default function PublisherBotScreen() {
  const [publishers, setPublishers] = useState<FeedPublisher[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [personaName, setPersonaName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [enabled, setEnabled] = useState(false);

  const loadPublishers = useCallback(async () => {
    const mine = await listMyPublishers();
    setPublishers(mine);
    setSelected((prev) => prev ?? mine[0]?.id ?? null);
    return mine;
  }, []);

  const loadBotFor = useCallback(async (publisherId: string | null, publisherName: string) => {
    if (!publisherId) return;
    const bot = await getPublisherBot(publisherId);
    setPersonaName(bot?.personaName ?? `Bot ${publisherName}`);
    setSystemPrompt(bot?.systemPrompt ?? '');
    setEnabled(bot?.enabled ?? false);
  }, []);

  useEffect(() => {
    setLoading(true);
    loadPublishers()
      .then((mine) => loadBotFor(mine[0]?.id ?? null, mine[0]?.name ?? ''))
      .catch(() => Alert.alert('No se pudo cargar el bot'))
      .finally(() => setLoading(false));
  }, [loadPublishers, loadBotFor]);

  const handleSelect = (publisherId: string) => {
    setSelected(publisherId);
    setLoading(true);
    const name = publishers.find((p) => p.id === publisherId)?.name ?? '';
    loadBotFor(publisherId, name).finally(() => setLoading(false));
  };

  const handleSave = async () => {
    if (!selected) return;
    if (!personaName.trim()) {
      Alert.alert('Ponle un nombre al bot antes de guardar.');
      return;
    }
    setSaving(true);
    try {
      await setPublisherBot(selected, personaName, systemPrompt, enabled);
      Alert.alert(enabled ? 'Bot activado' : 'Bot guardado', 'Los alumnos ya pueden chatear con él por DM.');
    } catch (err) {
      Alert.alert('No se pudo guardar', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminGuard>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.hint}>
          El bot responde por DM usando las publicaciones recientes del publisher como contexto, más lo
          que escribas abajo. Cualquier alumno puede abrirle un chat, igual que a una persona.
        </Text>

        {publishers.length === 0 ? (
          <Text style={styles.empty}>No administras ningún publisher todavía.</Text>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {publishers.map((pub) => (
                <TouchableOpacity
                  key={pub.id}
                  style={[styles.chip, selected === pub.id && styles.chipActive]}
                  onPress={() => handleSelect(pub.id)}
                >
                  <Text style={[styles.chipText, selected === pub.id && styles.chipTextActive]}>{pub.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {loading ? (
              <ActivityIndicator style={styles.loader} color="#246BFD" />
            ) : (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Bot habilitado</Text>
                  <Switch value={enabled} onValueChange={setEnabled} trackColor={{ true: '#0EA5E9' }} />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Nombre visible en el chat</Text>
                  <TextInput value={personaName} onChangeText={setPersonaName} style={styles.input} />
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Instrucciones / preguntas frecuentes (opcional)</Text>
                  <TextInput
                    value={systemPrompt}
                    onChangeText={setSystemPrompt}
                    style={[styles.input, styles.textarea]}
                    placeholder="Ej: Las inscripciones abren el 3 de marzo. Horario de atención: L-V 9-18h…"
                    multiline
                    numberOfLines={4}
                  />
                </View>
                <TouchableOpacity style={[styles.saveButton, saving && styles.disabled]} onPress={handleSave} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <Ionicons name="sparkles-outline" size={16} color="#ffffff" />
                      <Text style={styles.saveButtonText}>Guardar</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </AdminGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  hint: { color: '#64748b', fontSize: 13, lineHeight: 18 },
  empty: { color: '#94a3b8', textAlign: 'center', marginTop: 16 },
  loader: { marginTop: 24 },
  chipRow: { gap: 8 },
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  field: { gap: 6 },
  fieldLabel: { color: '#475569', fontWeight: '600', fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
  },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0A1525',
    borderRadius: 10,
    paddingVertical: 12,
  },
  saveButtonText: { color: '#ffffff', fontWeight: '800' },
  disabled: { opacity: 0.6 },
});

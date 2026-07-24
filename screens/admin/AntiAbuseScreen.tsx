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
import { listDuplicateAccountSignals } from '@/services/api/antiabuse';
import { addBlockedWord, listBlockedWords, removeBlockedWord } from '@/services/api/moderation';
import type { BlockedWordRow, DuplicateAccountSignal } from '@/types/database';

/**
 * Anti-abuso (Sesión 9, solo owner): señales de cuentas duplicadas por
 * dispositivo (mismo push token con varios user_id) y administración del filtro
 * de palabras que aplica a las publicaciones. Ambas listas están respaldadas por
 * is_owner()/is_admin() en el servidor.
 */
export default function AntiAbuseScreen() {
  const [signals, setSignals] = useState<DuplicateAccountSignal[]>([]);
  const [words, setWords] = useState<BlockedWordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newWord, setNewWord] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sig, w] = await Promise.all([
        listDuplicateAccountSignals(90).catch(() => []),
        listBlockedWords().catch(() => []),
      ]);
      setSignals(sig);
      setWords(w);
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

  const handleAddWord = async () => {
    const word = newWord.trim();
    if (!word || adding) return;
    setAdding(true);
    try {
      await addBlockedWord(word);
      setNewWord('');
      await load();
    } catch (err) {
      Alert.alert('No se pudo agregar', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveWord = (id: string) => {
    removeBlockedWord(id)
      .then(() => load())
      .catch(() => Alert.alert('No se pudo quitar la palabra.'));
  };

  return (
    <AdminGuard ownerOnly>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <Text style={styles.title}>Anti-abuso</Text>

        <Text style={styles.sectionTitle}>Filtro de palabras</Text>
        <Text style={styles.caption}>
          Las publicaciones con estas palabras se rechazan automáticamente en el servidor.
        </Text>
        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            placeholder="Nueva palabra o frase"
            value={newWord}
            onChangeText={setNewWord}
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.addButton} onPress={handleAddWord} disabled={adding}>
            <Text style={styles.addButtonText}>{adding ? '…' : 'Agregar'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.wordsWrap}>
          {words.length === 0 ? (
            <Text style={styles.muted}>Sin palabras en la lista.</Text>
          ) : (
            words.map((w) => (
              <View key={w.id} style={styles.wordChip}>
                <Text style={styles.wordText}>{w.word}</Text>
                <TouchableOpacity onPress={() => handleRemoveWord(w.id)}>
                  <Ionicons name="close-circle" size={16} color="#94a3b8" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        <Text style={styles.sectionTitle}>Cuentas duplicadas</Text>
        <Text style={styles.caption}>
          Dispositivos donde iniciaron sesión varias cuentas distintas (últimos 90 días).
        </Text>
        {loading ? (
          <ActivityIndicator color="#2563eb" style={{ marginTop: 12 }} />
        ) : signals.length === 0 ? (
          <Text style={styles.muted}>Sin señales de cuentas duplicadas.</Text>
        ) : (
          signals.map((s) => (
            <View key={s.token} style={styles.signalCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.signalCount}>{s.distinct_users} cuentas en un dispositivo</Text>
                <Text style={styles.signalDate}>
                  {new Date(s.last_seen_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                </Text>
              </View>
              {s.user_names.map((name, i) => (
                <Text key={`${s.token}-${i}`} style={styles.signalUser}>
                  • {name ?? 'Sin nombre'}
                </Text>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </AdminGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 10 },
  caption: { color: '#64748b', fontSize: 13 },
  muted: { color: '#94a3b8' },
  addRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#ffffff', color: '#0f172a' },
  addButton: { backgroundColor: '#0f172a', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  addButtonText: { color: '#ffffff', fontWeight: '800' },
  wordsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wordChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  wordText: { color: '#0f172a', fontWeight: '600', fontSize: 13 },
  signalCard: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#fed7aa', padding: 12, gap: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  signalCount: { color: '#c2410c', fontWeight: '800' },
  signalDate: { color: '#94a3b8', fontSize: 12 },
  signalUser: { color: '#334155', fontSize: 13 },
});

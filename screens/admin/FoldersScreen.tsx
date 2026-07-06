import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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
import type { AdminFolder } from '@/services/api/admin';
import { createFolder, listFolders, listMyPublishers } from '@/services/api/admin';
import type { FeedPublisher } from '@/services/api/feed';

/**
 * Carpetas de contenido por publisher: colecciones de fotos que pueden
 * integrarse al widget de galería del feed (se enlazan desde el detalle).
 */
export default function FoldersScreen() {
  const [publishers, setPublishers] = useState<FeedPublisher[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [folders, setFolders] = useState<AdminFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const loadFolders = useCallback(async (publisherIds: string[]) => {
    const list = await listFolders(publisherIds);
    setFolders(list);
  }, []);

  useEffect(() => {
    let active = true;
    listMyPublishers()
      .then(async (mine) => {
        if (!active) return;
        setPublishers(mine);
        setSelected((prev) => prev ?? mine[0]?.id ?? null);
        await loadFolders(mine.map((p) => p.id));
      })
      .catch(() => active && Alert.alert('No se pudieron cargar las carpetas'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [loadFolders]);

  const handleCreate = useCallback(async () => {
    if (!selected) {
      Alert.alert('Elige el publisher dueño de la carpeta');
      return;
    }
    if (!newName.trim()) {
      Alert.alert('Escribe el nombre de la carpeta');
      return;
    }
    setCreating(true);
    try {
      await createFolder(selected, newName);
      setNewName('');
      await loadFolders(publishers.map((p) => p.id));
    } catch (error) {
      Alert.alert(
        'No se pudo crear',
        error instanceof Error ? error.message : 'Revisa tus permisos sobre ese publisher.'
      );
    } finally {
      setCreating(false);
    }
  }, [selected, newName, publishers, loadFolders]);

  const publisherName = (id: string) => publishers.find((p) => p.id === id)?.name ?? 'Publisher';

  return (
    <AdminGuard>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator style={styles.loader} size="large" color="#246BFD" />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Nueva carpeta</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {publishers.map((pub) => (
                <TouchableOpacity
                  key={pub.id}
                  style={[styles.chip, selected === pub.id && styles.chipActive]}
                  onPress={() => setSelected(pub.id)}
                >
                  <Text style={[styles.chipText, selected === pub.id && styles.chipTextActive]}>
                    {pub.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.createRow}>
              <TextInput
                style={styles.input}
                placeholder="P. ej. Semana mechona 2026"
                placeholderTextColor="#94a3b8"
                value={newName}
                onChangeText={setNewName}
              />
              <TouchableOpacity
                style={[styles.createButton, creating && styles.disabled]}
                onPress={handleCreate}
                disabled={creating}
              >
                <Text style={styles.createText}>{creating ? '…' : 'Crear'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Mis carpetas</Text>
            {folders.length === 0 ? (
              <Text style={styles.empty}>Aún no hay carpetas para tus publishers.</Text>
            ) : (
              folders.map((folder) => (
                <TouchableOpacity
                  key={folder.id}
                  style={styles.folderRow}
                  onPress={() => router.push({ pathname: '/admin/folder/[id]', params: { id: folder.id } })}
                >
                  <View style={styles.folderIcon}>
                    <Ionicons name="folder-open-outline" size={20} color="#246BFD" />
                  </View>
                  <View style={styles.folderInfo}>
                    <Text style={styles.folderName} numberOfLines={1}>
                      {folder.name}
                    </Text>
                    <Text style={styles.folderMeta} numberOfLines={1}>
                      {publisherName(folder.publisherId)}
                    </Text>
                  </View>
                  {folder.linkedWidget && (
                    <View style={styles.linkedBadge}>
                      <Ionicons name="sparkles-outline" size={11} color="#7c3aed" />
                      <Text style={styles.linkedBadgeText}>En el feed</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                </TouchableOpacity>
              ))
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
  createRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  createButton: {
    backgroundColor: '#0A1525',
    borderRadius: 12,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
  createText: { color: '#ffffff', fontWeight: '800' },
  empty: { color: '#94a3b8', textAlign: 'center', marginTop: 16 },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  folderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderInfo: { flex: 1, gap: 2 },
  folderName: { color: '#0f172a', fontWeight: '700', fontSize: 14 },
  folderMeta: { color: '#64748b', fontSize: 12 },
  linkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ede9fe',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  linkedBadgeText: { color: '#7c3aed', fontSize: 10.5, fontWeight: '700' },
});

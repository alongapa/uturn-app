import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { AdminGuard } from '@/components/admin/admin-guard';
import type { AdminFolder, AdminFolderItem } from '@/services/api/admin';
import {
  addFolderItems,
  deleteFolder,
  deleteFolderItem,
  getFolder,
  listFolderItems,
  setFolderWidget,
} from '@/services/api/admin';

/**
 * Detalle de una carpeta: subir imágenes (feed-media), eliminarlas y
 * integrar/desconectar la carpeta del widget de galería del feed.
 */
export default function FolderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [folder, setFolder] = useState<AdminFolder | null>(null);
  const [items, setItems] = useState<AdminFolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [f, list] = await Promise.all([getFolder(id), listFolderItems(id)]);
    setFolder(f);
    setItems(list);
  }, [id]);

  useEffect(() => {
    let active = true;
    load()
      .catch(() => active && Alert.alert('No se pudo cargar la carpeta'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load]);

  const handleToggleWidget = useCallback(
    async (value: boolean) => {
      if (!folder) return;
      setFolder({ ...folder, linkedWidget: value ? 'galeria' : null });
      try {
        await setFolderWidget(folder.id, value);
      } catch (error) {
        setFolder(folder); // revierte
        Alert.alert(
          'No se pudo actualizar',
          error instanceof Error ? error.message : 'Revisa tus permisos.'
        );
      }
    },
    [folder]
  );

  const handleAddImages = useCallback(async () => {
    if (!folder) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.7,
    });
    if (result.canceled) return;
    const uris = result.assets.map((a) => a.uri).filter((u): u is string => Boolean(u));
    setUploading(true);
    try {
      await addFolderItems(folder.id, uris);
      await load();
    } catch (error) {
      Alert.alert(
        'No se pudieron subir las imágenes',
        error instanceof Error ? error.message : 'Revisa tu conexión y permisos.'
      );
    } finally {
      setUploading(false);
    }
  }, [folder, load]);

  const handleDeleteItem = useCallback(
    (item: AdminFolderItem) => {
      Alert.alert('Eliminar imagen', '¿Quitar esta imagen de la carpeta?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFolderItem(item.id);
              setItems((prev) => prev.filter((i) => i.id !== item.id));
            } catch {
              Alert.alert('No se pudo eliminar');
            }
          },
        },
      ]);
    },
    []
  );

  const handleDeleteFolder = useCallback(() => {
    if (!folder) return;
    Alert.alert('Eliminar carpeta', 'Se eliminará la carpeta y su contenido del feed.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteFolder(folder.id);
            router.back();
          } catch {
            Alert.alert('No se pudo eliminar la carpeta');
          }
        },
      },
    ]);
  }, [folder]);

  return (
    <AdminGuard>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator style={styles.loader} size="large" color="#246BFD" />
        ) : !folder ? (
          <Text style={styles.empty}>Carpeta no encontrada.</Text>
        ) : (
          <>
            <Text style={styles.title}>{folder.name}</Text>
            {folder.description ? <Text style={styles.description}>{folder.description}</Text> : null}

            <View style={styles.widgetRow}>
              <View style={styles.widgetText}>
                <Text style={styles.widgetTitle}>Integrada al feed</Text>
                <Text style={styles.widgetCaption}>
                  Aparece como colección en el widget de galería de Inicio.
                </Text>
              </View>
              <Switch
                value={folder.linkedWidget === 'galeria'}
                onValueChange={handleToggleWidget}
                trackColor={{ true: '#246BFD', false: '#cbd5e1' }}
              />
            </View>

            <TouchableOpacity
              style={[styles.addButton, uploading && styles.disabled]}
              onPress={handleAddImages}
              disabled={uploading}
            >
              <Ionicons name="image-outline" size={20} color="#246BFD" />
              <Text style={styles.addButtonText}>
                {uploading ? 'Subiendo…' : 'Agregar imágenes'}
              </Text>
            </TouchableOpacity>

            <View style={styles.grid}>
              {items.map((item) => (
                <View key={item.id} style={styles.gridItem}>
                  <Image source={{ uri: item.mediaUrl }} style={styles.gridImage} contentFit="cover" />
                  <TouchableOpacity style={styles.gridRemove} onPress={() => handleDeleteItem(item)}>
                    <Ionicons name="trash-outline" size={14} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              ))}
              {items.length === 0 && (
                <Text style={styles.empty}>La carpeta está vacía. Sube las primeras imágenes.</Text>
              )}
            </View>

            <TouchableOpacity style={styles.deleteFolder} onPress={handleDeleteFolder}>
              <Ionicons name="trash-outline" size={16} color="#dc2626" />
              <Text style={styles.deleteFolderText}>Eliminar carpeta</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </AdminGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  loader: { marginTop: 48 },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  description: { color: '#64748b', fontSize: 13, lineHeight: 18 },
  widgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
  },
  widgetText: { flex: 1, gap: 2 },
  widgetTitle: { color: '#0f172a', fontWeight: '700', fontSize: 14 },
  widgetCaption: { color: '#64748b', fontSize: 12, lineHeight: 16 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 12,
  },
  disabled: { opacity: 0.5 },
  addButtonText: { color: '#246BFD', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridItem: { position: 'relative', width: '31.5%', aspectRatio: 1 },
  gridImage: { width: '100%', height: '100%', borderRadius: 10 },
  gridRemove: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    padding: 4,
  },
  empty: { color: '#94a3b8', textAlign: 'center', marginTop: 12, width: '100%' },
  deleteFolder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    padding: 10,
  },
  deleteFolderText: { color: '#dc2626', fontWeight: '700', fontSize: 13 },
});

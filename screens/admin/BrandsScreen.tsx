import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
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
import type { AdminBrand } from '@/services/api/admin';
import { createBrand, deleteBrand, listBrands, listMyPublishers } from '@/services/api/admin';
import type { FeedPublisher } from '@/services/api/feed';

/**
 * Marcas asociadas por publisher: nombre + logo (Storage feed-media). Se usan
 * para co-firmar promociones y activaciones desde el composer.
 */
export default function BrandsScreen() {
  const [publishers, setPublishers] = useState<FeedPublisher[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [brands, setBrands] = useState<AdminBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const mine = await listMyPublishers();
    setPublishers(mine);
    setSelected((prev) => prev ?? mine[0]?.id ?? null);
    setBrands(await listBrands(mine.map((p) => p.id)));
  }, []);

  useEffect(() => {
    let active = true;
    load()
      .catch(() => active && Alert.alert('No se pudieron cargar las marcas'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load]);

  const handlePickLogo = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setLogoUri(result.assets[0].uri);
    }
  }, []);

  const handleCreate = useCallback(async () => {
    if (!selected) {
      Alert.alert('Elige el publisher de la marca');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Escribe el nombre de la marca');
      return;
    }
    setCreating(true);
    try {
      await createBrand(selected, name, logoUri);
      setName('');
      setLogoUri(null);
      await load();
    } catch (error) {
      Alert.alert(
        'No se pudo crear la marca',
        error instanceof Error ? error.message : 'Revisa tus permisos sobre ese publisher.'
      );
    } finally {
      setCreating(false);
    }
  }, [selected, name, logoUri, load]);

  const handleDelete = useCallback(
    (brand: AdminBrand) => {
      Alert.alert('Eliminar marca', `¿Eliminar "${brand.name}"?`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBrand(brand.id);
              setBrands((prev) => prev.filter((b) => b.id !== brand.id));
            } catch {
              Alert.alert('No se pudo eliminar');
            }
          },
        },
      ]);
    },
    []
  );

  const publisherName = (id: string) => publishers.find((p) => p.id === id)?.name ?? 'Publisher';

  return (
    <AdminGuard>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator style={styles.loader} size="large" color="#246BFD" />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Nueva marca</Text>
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
              <TouchableOpacity style={styles.logoPicker} onPress={handlePickLogo}>
                {logoUri ? (
                  <Image source={{ uri: logoUri }} style={styles.logoPreview} contentFit="cover" />
                ) : (
                  <Ionicons name="camera-outline" size={20} color="#94a3b8" />
                )}
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder="P. ej. Red Bull"
                placeholderTextColor="#94a3b8"
                value={name}
                onChangeText={setName}
              />
              <TouchableOpacity
                style={[styles.createButton, creating && styles.disabled]}
                onPress={handleCreate}
                disabled={creating}
              >
                <Text style={styles.createText}>{creating ? '…' : 'Crear'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Marcas de mis publishers</Text>
            {brands.length === 0 ? (
              <Text style={styles.empty}>Aún no hay marcas asociadas.</Text>
            ) : (
              brands.map((brand) => (
                <View key={brand.id} style={styles.brandRow}>
                  {brand.logoUrl ? (
                    <Image source={{ uri: brand.logoUrl }} style={styles.brandLogo} contentFit="cover" />
                  ) : (
                    <View style={[styles.brandLogo, styles.brandLogoFallback]}>
                      <Ionicons name="ribbon-outline" size={18} color="#246BFD" />
                    </View>
                  )}
                  <View style={styles.brandInfo}>
                    <Text style={styles.brandName} numberOfLines={1}>
                      {brand.name}
                    </Text>
                    <Text style={styles.brandMeta} numberOfLines={1}>
                      {publisherName(brand.publisherId)}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(brand)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color="#dc2626" />
                  </TouchableOpacity>
                </View>
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
  createRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  logoPicker: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoPreview: { width: '100%', height: '100%' },
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
    paddingVertical: 12,
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
  createText: { color: '#ffffff', fontWeight: '800' },
  empty: { color: '#94a3b8', textAlign: 'center', marginTop: 16 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  brandLogo: { width: 40, height: 40, borderRadius: 10 },
  brandLogoFallback: {
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandInfo: { flex: 1, gap: 2 },
  brandName: { color: '#0f172a', fontWeight: '700', fontSize: 14 },
  brandMeta: { color: '#64748b', fontSize: 12 },
});

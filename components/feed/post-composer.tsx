import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import type { AdminBrand } from '@/services/api/admin';
import { listBrands, listMyPublishers } from '@/services/api/admin';
import type { FeedPublisher } from '@/services/api/feed';
import { createPost, createStory } from '@/services/api/feed';
import type { PostType } from '@/types/database';
import { POST_TYPE_LABEL, parseLocalDateTime } from './feed-utils';
import { PublisherAvatar } from './publisher-avatar';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Se llama tras publicar para que el feed/las historias se refresquen. */
  onPublished: (kind: 'post' | 'story') => void;
};

type ComposerMode = 'post' | 'story';

const POST_TYPES: PostType[] = ['noticia', 'evento', 'activacion', 'descuento'];

/**
 * Composer para roles que publican (tutor/admin/owner). El botón solo se
 * muestra a esos roles, pero el enforcement real es la política RLS: desde la
 * Sesión 5 solo se puede publicar a nombre de publishers donde el usuario es
 * miembro (publisher_members); el owner conserva alcance global.
 */
export function PostComposer({ visible, onClose, onPublished }: Props) {
  const [mode, setMode] = useState<ComposerMode>('post');
  const [publishers, setPublishers] = useState<FeedPublisher[]>([]);
  const [publisherId, setPublisherId] = useState<string | null>(null);
  const [brands, setBrands] = useState<AdminBrand[]>([]);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [tipo, setTipo] = useState<PostType>('noticia');
  const [texto, setTexto] = useState('');
  const [mediaUris, setMediaUris] = useState<string[]>([]);
  const [eventoFecha, setEventoFecha] = useState('');
  const [eventoLugar, setEventoLugar] = useState('');
  const [codigo, setCodigo] = useState('');
  const [condiciones, setCondiciones] = useState('');
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!visible) return;
    listMyPublishers()
      .then(async (list) => {
        setPublishers(list);
        setPublisherId((prev) => prev ?? list[0]?.id ?? null);
        setBrands(list.length > 0 ? await listBrands(list.map((p) => p.id)) : []);
      })
      .catch(() => Alert.alert('No se pudieron cargar las entidades publicadoras'));
  }, [visible]);

  const reset = () => {
    setMode('post');
    setTipo('noticia');
    setTexto('');
    setMediaUris([]);
    setEventoFecha('');
    setEventoLugar('');
    setCodigo('');
    setCondiciones('');
    setBrandId(null);
  };

  const pickImages = async () => {
    // Compresión al subir: quality reduce el peso de la imagen elegida.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: mode === 'post',
      selectionLimit: 6,
      quality: 0.7,
    });
    if (!result.canceled) {
      const uris = result.assets
        .map((asset) => asset.uri)
        .filter((uri): uri is string => Boolean(uri));
      setMediaUris(mode === 'post' ? [...mediaUris, ...uris].slice(0, 6) : uris.slice(0, 1));
    }
  };

  const handlePublish = async () => {
    if (!publisherId) {
      Alert.alert('Elige la entidad que publica');
      return;
    }
    if (mode === 'story' && mediaUris.length === 0) {
      Alert.alert('Una historia necesita una imagen');
      return;
    }
    if (mode === 'post' && !texto.trim() && mediaUris.length === 0) {
      Alert.alert('Escribe algo o agrega una imagen');
      return;
    }
    let eventoIso: string | null = null;
    if (mode === 'post' && (tipo === 'evento' || tipo === 'activacion')) {
      eventoIso = eventoFecha.trim() ? parseLocalDateTime(eventoFecha) : null;
      if (tipo === 'evento' && !eventoIso) {
        Alert.alert('Fecha del evento', 'Usa el formato AAAA-MM-DD HH:mm, p. ej. 2026-07-10 19:00');
        return;
      }
    }

    setPublishing(true);
    try {
      if (mode === 'story') {
        await createStory(publisherId, mediaUris[0], texto);
      } else {
        await createPost({
          publisherId,
          tipo,
          texto,
          mediaUris,
          eventoFecha: eventoIso,
          eventoLugar: eventoLugar.trim() || null,
          codigo: tipo === 'descuento' ? codigo.trim() || null : null,
          condiciones: tipo === 'descuento' ? condiciones.trim() || null : null,
          brandId,
        });
      }
      reset();
      onPublished(mode);
      onClose();
    } catch (error) {
      // Aquí cae también el rechazo de RLS si el rol no puede publicar.
      Alert.alert(
        'No se pudo publicar',
        error instanceof Error ? error.message : 'Revisa tu conexión y permisos.'
      );
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color="#0f172a" />
          </TouchableOpacity>
          <Text style={styles.title}>Publicar</Text>
          <TouchableOpacity
            style={[styles.publishButton, publishing && styles.publishDisabled]}
            onPress={handlePublish}
            disabled={publishing}
          >
            <Text style={styles.publishText}>{publishing ? 'Publicando…' : 'Publicar'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.modeRow}>
            {(['post', 'story'] as ComposerMode[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.modeChip, mode === m && styles.modeChipActive]}
                onPress={() => {
                  setMode(m);
                  setMediaUris([]);
                }}
              >
                <Text style={[styles.modeChipText, mode === m && styles.modeChipTextActive]}>
                  {m === 'post' ? 'Publicación' : 'Historia'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Publica como</Text>
          {publishers.length === 0 && (
            <Text style={styles.noPublishers}>
              No administras ningún publisher todavía; pídele acceso al owner.
            </Text>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.publisherRow}>
            {publishers.map((pub) => (
              <TouchableOpacity
                key={pub.id}
                style={[styles.publisherChip, publisherId === pub.id && styles.publisherChipActive]}
                onPress={() => {
                  setPublisherId(pub.id);
                  setBrandId(null);
                }}
              >
                <PublisherAvatar publisher={pub} size={26} />
                <Text
                  style={[styles.publisherChipText, publisherId === pub.id && styles.publisherChipTextActive]}
                  numberOfLines={1}
                >
                  {pub.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {mode === 'post' && (
            <>
              <Text style={styles.label}>Tipo</Text>
              <View style={styles.typeRow}>
                {POST_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChip, tipo === t && styles.typeChipActive]}
                    onPress={() => setTipo(t)}
                  >
                    <Text style={[styles.typeChipText, tipo === t && styles.typeChipTextActive]}>
                      {POST_TYPE_LABEL[t]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <TextInput
            style={styles.bodyInput}
            placeholder={mode === 'story' ? 'Texto de la historia (opcional)…' : '¿Qué está pasando en el campus?'}
            placeholderTextColor="#94a3b8"
            value={texto}
            onChangeText={setTexto}
            multiline
            maxLength={1000}
          />

          {mode === 'post' && (tipo === 'evento' || tipo === 'activacion') && (
            <>
              <Text style={styles.label}>
                {tipo === 'evento' ? 'Fecha del evento (obligatoria)' : 'Fecha (opcional)'}
              </Text>
              <TextInput
                style={styles.input}
                placeholder="AAAA-MM-DD HH:mm"
                placeholderTextColor="#94a3b8"
                value={eventoFecha}
                onChangeText={setEventoFecha}
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                placeholder="Lugar (p. ej. Hall central, Campus Peñalolén)"
                placeholderTextColor="#94a3b8"
                value={eventoLugar}
                onChangeText={setEventoLugar}
              />
            </>
          )}

          {mode === 'post' &&
            (tipo === 'activacion' || tipo === 'descuento' || tipo === 'evento') &&
            brands.filter((b) => b.publisherId === publisherId).length > 0 && (
              <>
                <Text style={styles.label}>Co-firma de marca (opcional)</Text>
                <View style={styles.typeRow}>
                  <TouchableOpacity
                    style={[styles.typeChip, brandId === null && styles.typeChipActive]}
                    onPress={() => setBrandId(null)}
                  >
                    <Text style={[styles.typeChipText, brandId === null && styles.typeChipTextActive]}>
                      Sin marca
                    </Text>
                  </TouchableOpacity>
                  {brands
                    .filter((b) => b.publisherId === publisherId)
                    .map((brand) => (
                      <TouchableOpacity
                        key={brand.id}
                        style={[styles.typeChip, brandId === brand.id && styles.typeChipActive]}
                        onPress={() => setBrandId(brand.id)}
                      >
                        <Text
                          style={[styles.typeChipText, brandId === brand.id && styles.typeChipTextActive]}
                        >
                          {brand.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </View>
              </>
            )}

          {mode === 'post' && tipo === 'descuento' && (
            <>
              <Text style={styles.label}>Código del descuento</Text>
              <TextInput
                style={styles.input}
                placeholder="P. ej. UNITIES20"
                placeholderTextColor="#94a3b8"
                value={codigo}
                onChangeText={setCodigo}
                autoCapitalize="characters"
              />
              <TextInput
                style={styles.input}
                placeholder="Condiciones (vigencia, restricciones…)"
                placeholderTextColor="#94a3b8"
                value={condiciones}
                onChangeText={setCondiciones}
              />
            </>
          )}

          <TouchableOpacity style={styles.mediaButton} onPress={pickImages}>
            <Ionicons name="image-outline" size={20} color="#246BFD" />
            <Text style={styles.mediaButtonText}>
              {mode === 'story' ? 'Elegir imagen' : 'Agregar imágenes (carrete hasta 6)'}
            </Text>
          </TouchableOpacity>

          {mediaUris.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewRow}>
              {mediaUris.map((uri, index) => (
                <View key={`${uri}-${index}`} style={styles.previewItem}>
                  <Image source={{ uri }} style={styles.previewImage} contentFit="cover" />
                  <TouchableOpacity
                    style={styles.previewRemove}
                    onPress={() => setMediaUris(mediaUris.filter((_, i) => i !== index))}
                  >
                    <Ionicons name="close" size={14} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 54,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  publishButton: {
    backgroundColor: '#0A1525',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  publishDisabled: { opacity: 0.5 },
  publishText: { color: '#ffffff', fontWeight: '700' },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  modeChipActive: { backgroundColor: '#0A1525', borderColor: '#0A1525' },
  modeChipText: { fontWeight: '700', color: '#475569' },
  modeChipTextActive: { color: '#ffffff' },
  label: { fontWeight: '700', color: '#0f172a', fontSize: 13 },
  noPublishers: { color: '#92400e', fontSize: 12.5, lineHeight: 17 },
  publisherRow: { gap: 8 },
  publisherChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 20,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 12,
    maxWidth: 230,
    backgroundColor: '#ffffff',
  },
  publisherChipActive: { borderColor: '#246BFD', backgroundColor: '#eff6ff' },
  publisherChipText: { color: '#475569', fontWeight: '600', fontSize: 13, flexShrink: 1 },
  publisherChipTextActive: { color: '#1d4ed8' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  typeChipActive: { backgroundColor: '#246BFD', borderColor: '#246BFD' },
  typeChipText: { color: '#475569', fontWeight: '600', fontSize: 13 },
  typeChipTextActive: { color: '#ffffff' },
  bodyInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    minHeight: 110,
    textAlignVertical: 'top',
    color: '#0f172a',
    fontSize: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
  },
  mediaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 12,
    justifyContent: 'center',
  },
  mediaButtonText: { color: '#246BFD', fontWeight: '700' },
  previewRow: { gap: 8 },
  previewItem: { position: 'relative' },
  previewImage: { width: 84, height: 84, borderRadius: 10 },
  previewRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    padding: 3,
  },
});

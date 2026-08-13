import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { editPost } from '@/services/api/feed';
import type { FeedPost } from '@/services/api/feed';

const MAX_LENGTH = 2000; // igual que la validación de edit_post en la BD

type Props = {
  post: FeedPost | null;
  onClose: () => void;
  onSaved: (post: FeedPost) => void;
};

/**
 * Edición del texto de una publicación. Solo la ve el autor, pero quien
 * decide es `edit_post` en el servidor (y la política posts_update_own):
 * si otro llegara aquí, el RPC lo rechaza.
 */
export function EditPostModal({ post, onClose, onSaved }: Props) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(post?.texto ?? '');
    setError(null);
  }, [post]);

  const hasMedia = (post?.media.length ?? 0) > 0;
  const trimmed = text.trim();
  // El texto vacío solo se acepta si el post se sostiene con su media,
  // misma condición que valida el RPC.
  const canSave = !saving && (trimmed.length > 0 || hasMedia) && trimmed.length <= MAX_LENGTH;

  const handleSave = async () => {
    if (!post || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await editPost(post.id, trimmed);
      if (updated) onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la edición.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={!!post}
      transparent
      animationType="slide"
      onRequestClose={saving ? undefined : onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <Text style={styles.title}>Editar publicación</Text>
          <Text style={styles.subtitle}>
            Quedará marcada como editada para quienes la vean.
          </Text>

          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={MAX_LENGTH}
            placeholder={hasMedia ? 'Texto opcional…' : 'Escribe algo…'}
            placeholderTextColor="#94a3b8"
            editable={!saving}
            autoFocus
          />
          <Text style={styles.counter}>
            {trimmed.length}/{MAX_LENGTH}
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              disabled={saving}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.saveButton, !canSave && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={!canSave}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.saveText}>Guardar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    gap: 8,
  },
  title: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b' },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    minHeight: 120,
    maxHeight: 260,
    fontSize: 15,
    color: '#0f172a',
    textAlignVertical: 'top',
    marginTop: 6,
  },
  counter: { alignSelf: 'flex-end', fontSize: 12, color: '#94a3b8' },
  error: { color: '#dc2626', fontSize: 13 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
  button: {
    minWidth: 110,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: { backgroundColor: '#f1f5f9' },
  cancelText: { color: '#334155', fontWeight: '700' },
  saveButton: { backgroundColor: '#0A1525' },
  saveText: { color: '#ffffff', fontWeight: '800' },
  buttonDisabled: { opacity: 0.5 },
});

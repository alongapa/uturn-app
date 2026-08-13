import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text } from 'react-native';

export type PostMenuAction = 'edit' | 'delete' | 'report' | 'mute';

type Props = {
  /** Solo el autor edita (coincide con la política posts_update_own). */
  canEdit: boolean;
  /** Autor, owner o admin: el alcance real por publisher lo decide el servidor. */
  canDelete: boolean;
  /** Nombre de la cuenta, para rotular "Silenciar a <cuenta>". */
  publisherName: string;
  /** true si el usuario ya silenció esta cuenta (ofrece "Dejar de silenciar"). */
  muted?: boolean;
  /** Oculta Reportar/Silenciar cuando la publicación es propia. */
  isOwnContent: boolean;
  onAction: (action: PostMenuAction) => void;
  /** Color del ícono: por defecto gris; blanco sobre la historia a pantalla completa. */
  tint?: string;
};

/**
 * Menú contextual de tres puntos, único para publicaciones e historias.
 *
 * Las opciones se muestran según permisos, pero eso es SOLO presentación: el
 * permiso de verdad son las políticas RLS y los RPC (delete_post / edit_post /
 * report_post / mute_publisher). Un admin sin membresía en el publisher ve
 * "Eliminar" y el servidor se lo rechaza — es el comportamiento esperado, no
 * un bug: el cliente no conoce publisher_members.
 */
export function PostMenu({
  canEdit,
  canDelete,
  publisherName,
  muted = false,
  isOwnContent,
  onAction,
  tint = '#94a3b8',
}: Props) {
  const [open, setOpen] = useState(false);

  const choose = (action: PostMenuAction) => {
    setOpen(false);
    onAction(action);
  };

  const options: { action: PostMenuAction; label: string; icon: keyof typeof Ionicons.glyphMap; destructive?: boolean }[] = [];
  if (canEdit) options.push({ action: 'edit', label: 'Editar publicación', icon: 'create-outline' });
  if (canDelete) options.push({ action: 'delete', label: 'Eliminar', icon: 'trash-outline', destructive: true });
  if (!isOwnContent) {
    options.push({ action: 'report', label: 'Reportar', icon: 'flag-outline' });
    options.push({
      action: 'mute',
      label: muted ? `Dejar de silenciar a ${publisherName}` : `Silenciar a ${publisherName}`,
      icon: muted ? 'volume-high-outline' : 'volume-mute-outline',
    });
  }

  if (options.length === 0) return null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={styles.trigger}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Más opciones"
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={tint} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* Pressable interno: absorbe el toque para que tocar la hoja no la cierre. */}
          <Pressable style={styles.sheet} onPress={() => undefined}>
            {options.map((option) => (
              <Pressable
                key={option.action}
                style={styles.option}
                onPress={() => choose(option.action)}
                accessibilityRole="button"
              >
                <Ionicons
                  name={option.icon}
                  size={19}
                  color={option.destructive ? '#dc2626' : '#334155'}
                />
                <Text style={[styles.optionText, option.destructive && styles.destructiveText]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
            <Pressable style={[styles.option, styles.cancel]} onPress={() => setOpen(false)}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { padding: 4 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    paddingBottom: 28,
    paddingHorizontal: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  optionText: { fontSize: 15.5, fontWeight: '600', color: '#334155', flexShrink: 1 },
  destructiveText: { color: '#dc2626' },
  cancel: { justifyContent: 'center', marginTop: 4, backgroundColor: '#f8fafc' },
  cancelText: { fontSize: 15.5, fontWeight: '700', color: '#64748b' },
});

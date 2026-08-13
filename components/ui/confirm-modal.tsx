import React from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  /** Texto del botón que ejecuta la acción. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Pinta el botón de confirmar en rojo (borrar, sancionar, etc.). */
  destructive?: boolean;
  /** Bloquea los botones y muestra spinner mientras la acción está en vuelo. */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Confirmación reutilizable. Existe porque `Alert.alert` de react-native NO
 * corre en web (react-native-web no lo implementa): en la web el callback
 * simplemente nunca se dispara y la acción queda muerta sin feedback — el
 * mismo bug que ya arrastramos en la confirmación de pago del conductor.
 *
 * Cualquier confirmación destructiva nueva debería usar esto y no Alert.
 */
export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={loading ? undefined : onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              disabled={loading}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                destructive ? styles.destructiveButton : styles.confirmButton,
                loading && styles.buttonDisabled,
              ]}
              onPress={onConfirm}
              disabled={loading}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.confirmText}>{confirmLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  title: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  message: { fontSize: 14, lineHeight: 20, color: '#475569' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  button: {
    minWidth: 104,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: { backgroundColor: '#f1f5f9' },
  cancelText: { color: '#334155', fontWeight: '700' },
  confirmButton: { backgroundColor: '#0A1525' },
  destructiveButton: { backgroundColor: '#dc2626' },
  confirmText: { color: '#ffffff', fontWeight: '800' },
  buttonDisabled: { opacity: 0.7 },
});

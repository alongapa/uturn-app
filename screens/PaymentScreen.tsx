import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useUser } from '@/contexts/UserContext';
import { isUserBlocked } from '@/services/penalties';

const TERMS_TEXT = `Periodo de cancelación gratuita

Viajes con llegada entre 08:00 y 10:00 (horario punta): se puede cancelar sin penalización hasta 12 horas antes.

Resto de horarios: hasta 2 horas antes.

Cancelaciones tardías

Toda cancelación después de ese margen cuenta como “cancelación tardía”.

Penalizaciones

3 cancelaciones tardías → bloqueo de 24h.

+3 tardías (después del primer bloqueo) → bloqueo de 3 días.

+3 tardías (después del segundo) → bloqueo de 7 días.

El contador de cancelaciones tardías se reinicia si pasan 30 días sin nuevas cancelaciones tardías.

Cada cancelación tardía y cada bloqueo debe quedar registrada y el usuario debe ser notificado.`;

export default function PaymentScreen() {
  const { price, destination } = useLocalSearchParams<{ price?: string; destination?: string }>();
  const { user } = useUser();
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const activeBlock = user && isUserBlocked(user, new Date()) ? user.penaltyState?.currentBlockUntil ?? null : null;

  const handleConfirm = () => {
    if (!acceptedTerms) {
      Alert.alert('Acepta los términos', 'Debes aceptar los términos de cancelación para continuar.');
      return;
    }

    if (!user) {
      Alert.alert('Inicia sesión', 'Debes iniciar sesión para confirmar una reserva.');
      return;
    }

    const now = new Date();
    if (isUserBlocked(user, now)) {
      const blockMessage = user.penaltyState?.currentBlockUntil
        ? new Date(user.penaltyState.currentBlockUntil).toLocaleString('es-CL', {
            dateStyle: 'long',
            timeStyle: 'short',
          })
        : 'nuevo aviso';
      Alert.alert('Cuenta bloqueada', `No puedes reservar hasta ${blockMessage}.`);
      return;
    }

    Alert.alert('Reserva confirmada. ¡Buen viaje!');
    router.replace('/(tabs)/index');
  };

  const isButtonDisabled = !acceptedTerms || Boolean(activeBlock);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.title}>Resumen de pago</Text>
          <Text style={styles.detailLabel}>Destino</Text>
          <Text style={styles.detailValue}>{destination ?? 'Destino no especificado'}</Text>
          <Text style={styles.detailLabel}>Total a pagar</Text>
          <Text style={styles.amount}>${price ?? '0'}</Text>
          {activeBlock && (
            <View style={styles.blockMessage}>
              <Text style={styles.blockMessageText}>
                No puedes confirmar nuevas reservas hasta{' '}
                {new Date(activeBlock).toLocaleString('es-CL', {
                  dateStyle: 'long',
                  timeStyle: 'short',
                })}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.termsCard}>
          <Text style={styles.sectionTitle}>Términos y Condiciones de Cancelación</Text>
          <Text style={styles.termsText}>{TERMS_TEXT}</Text>
          <View style={styles.termsRow}>
            <Switch
              value={acceptedTerms}
              onValueChange={setAcceptedTerms}
              trackColor={{ false: '#cbd5f5', true: '#1d4ed8' }}
              thumbColor={acceptedTerms ? '#ffffff' : '#f1f5f9'}
            />
            <Text style={styles.switchLabel}>Acepto los términos de cancelación</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, isButtonDisabled && styles.buttonDisabled]}
          onPress={handleConfirm}
          disabled={isButtonDisabled}
        >
          <Text style={styles.buttonText}>Confirmar reserva</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 24,
    gap: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
    color: '#0f172a',
  },
  detailLabel: {
    fontSize: 14,
    color: '#475569',
    marginTop: 12,
  },
  detailValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
  },
  amount: {
    fontSize: 32,
    fontWeight: '800',
    marginVertical: 16,
    color: '#1d4ed8',
  },
  termsCard: {
    backgroundColor: '#e0f2fe',
    borderRadius: 18,
    padding: 20,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  termsText: {
    color: '#0f172a',
    lineHeight: 20,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchLabel: {
    color: '#0f172a',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#94a3b8',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  blockMessage: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(248,113,113,0.15)',
    borderRadius: 12,
  },
  blockMessageText: {
    color: '#b91c1c',
    fontWeight: '600',
  },
});

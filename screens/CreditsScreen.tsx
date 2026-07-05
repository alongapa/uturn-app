import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { CreditTransaction } from '@/models/unities';
import {
  CREDITS_PER_PAID_TRIP,
  STREAK_BONUS_CREDITS,
  STREAK_TRIP_TARGET,
} from '@/services/credits';
import { useAppState } from '@/store/appState';

const formatDateCL = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const SOURCE_LABELS: Record<CreditTransaction['fuente'], string> = {
  viaje: 'Viaje',
  racha: 'Racha',
  bono: 'Bono',
  canje: 'Canje',
  ajuste: 'Ajuste',
};

export default function CreditsScreen() {
  const { creditBalance, creditTransactions, streaks } = useAppState();

  const racha = streaks.pagosATiempo;
  const tripsToNextBonus = STREAK_TRIP_TARGET - (racha % STREAK_TRIP_TARGET);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Saldo disponible</Text>
        <Text style={styles.balanceValue}>{creditBalance.toLocaleString('es-CL')}</Text>
        <Text style={styles.balanceUnit}>créditos Unities</Text>
        <TouchableOpacity style={styles.redeemButton} onPress={() => router.push('/redeem')}>
          <Text style={styles.redeemButtonText}>Ir a canjes</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.streakCard}>
        <Text style={styles.streakTitle}>
          Racha actual: {racha} {racha === 1 ? 'pago a tiempo' : 'pagos a tiempo'}
        </Text>
        <Text style={styles.streakDetail}>
          {racha > 0 && tripsToNextBonus === STREAK_TRIP_TARGET
            ? `¡Bono de racha cobrado! Paga ${STREAK_TRIP_TARGET} viajes más a tiempo para el siguiente.`
            : `Te ${tripsToNextBonus === 1 ? 'falta 1 pago a tiempo' : `faltan ${tripsToNextBonus} pagos a tiempo`} para el próximo bono de +${STREAK_BONUS_CREDITS}. Un pago vencido reinicia la racha.`}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Cómo ganar créditos</Text>
      <View style={styles.rulesCard}>
        <RuleRow title="Pago de viaje confirmado a tiempo" value={`+${CREDITS_PER_PAID_TRIP}`} />
        <RuleRow
          title={`Racha de ${STREAK_TRIP_TARGET} pagos a tiempo`}
          value={`+${STREAK_BONUS_CREDITS}`}
        />
        <RuleRow title="Bonos y activaciones de la semana" value="variable" />
      </View>

      <Text style={styles.sectionTitle}>Historial de movimientos</Text>
      {creditTransactions.length === 0 ? (
        <Text style={styles.empty}>Aún no tienes movimientos de créditos.</Text>
      ) : (
        <View style={styles.history}>
          {creditTransactions.map((transaction) => {
            const isCredit = transaction.tipo === 'abono';
            return (
              <View key={transaction.id} style={styles.transactionRow}>
                <View style={styles.transactionInfo}>
                  <Text style={styles.transactionDescription}>{transaction.descripcion}</Text>
                  <Text style={styles.transactionMeta}>
                    {SOURCE_LABELS[transaction.fuente]} · {formatDateCL(transaction.createdAt)}
                  </Text>
                </View>
                <Text style={[styles.transactionAmount, isCredit ? styles.amountCredit : styles.amountDebit]}>
                  {isCredit ? '+' : '-'}
                  {transaction.monto}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function RuleRow({ title, value }: { title: string; value: string }) {
  return (
    <View style={styles.ruleRow}>
      <Text style={styles.ruleTitle}>{title}</Text>
      <Text style={styles.ruleValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  balanceCard: {
    backgroundColor: '#0A1525',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 4,
  },
  balanceLabel: { color: '#94a3b8', fontWeight: '600' },
  balanceValue: { color: '#ffffff', fontSize: 40, fontWeight: '800' },
  balanceUnit: { color: '#38bdf8', fontWeight: '700' },
  redeemButton: {
    marginTop: 12,
    backgroundColor: '#0EA5E9',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 999,
  },
  redeemButtonText: { color: '#0B1220', fontWeight: '800' },
  streakCard: {
    backgroundColor: '#ecfeff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#bae6fd',
    gap: 4,
  },
  streakTitle: { fontWeight: '800', color: '#0f172a' },
  streakDetail: { color: '#475569' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginTop: 8 },
  rulesCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  ruleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  ruleTitle: { color: '#0f172a', fontWeight: '600', flex: 1, marginRight: 8 },
  ruleValue: { color: '#2563eb', fontWeight: '700' },
  history: { gap: 8 },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 12,
  },
  transactionInfo: { flex: 1, gap: 2 },
  transactionDescription: { color: '#0f172a', fontWeight: '600' },
  transactionMeta: { color: '#94a3b8', fontSize: 12 },
  transactionAmount: { fontSize: 16, fontWeight: '800' },
  amountCredit: { color: '#16a34a' },
  amountDebit: { color: '#dc2626' },
  empty: { color: '#94a3b8' },
});

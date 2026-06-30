import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useUser } from '@/contexts/UserContext';
import { useAppState } from '@/store/appState';
import { COLORS, RADII, SPACING, TYPE } from '@/constants/designSystem';
import { Card } from '@/components/ui/Card';
import { CREDIT_EVENTS } from '@/constants/creditEvents';
import { CREDIT_EARNING_METHODS } from '@/constants/creditEarning';

type Tab = 'canjear' | 'ganar';

export default function CreditsScreen() {
  const { user, updateUser } = useUser();
  const { state, dispatch } = useAppState();
  const [tab, setTab] = useState<Tab>('canjear');

  if (!user) return null;

  function handleRedeem(eventId: string, cost: number, title: string) {
    if (!user) return;
    if (state.redeemedEventIds.includes(eventId)) return;
    if (user.uturnCredits < cost) {
      Alert.alert('Créditos insuficientes', `Te faltan ${cost - user.uturnCredits} créditos para canjear "${title}".`);
      return;
    }
    Alert.alert('Confirmar canje', `¿Canjear "${title}" por ${cost} créditos?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Canjear',
        onPress: () => {
          updateUser({ uturnCredits: user.uturnCredits - cost });
          dispatch({ type: 'REDEEM_EVENT', payload: eventId });
          Alert.alert('¡Listo!', `Canjeaste "${title}". Muestra tu perfil UTurn en el ingreso.`);
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={TYPE.heading}>Créditos UTurn</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <Card dark style={s.balanceCard}>
          <Ionicons name="wallet" size={28} color={COLORS.primary} />
          <Text style={s.balanceVal}>{user.uturnCredits}</Text>
          <Text style={s.balanceLabel}>créditos disponibles</Text>
        </Card>

        <View style={s.tabs}>
          <TouchableOpacity style={[s.tab, tab === 'canjear' && s.tabActive]} onPress={() => setTab('canjear')}>
            <Text style={[s.tabTxt, tab === 'canjear' && s.tabTxtActive]}>Canjear</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tab, tab === 'ganar' && s.tabActive]} onPress={() => setTab('ganar')}>
            <Text style={[s.tabTxt, tab === 'ganar' && s.tabTxtActive]}>Cómo ganar</Text>
          </TouchableOpacity>
        </View>

        {tab === 'canjear' ? (
          <View style={{ gap: SPACING.md }}>
            <Text style={s.sectionSub}>Eventos y beneficios próximos canjeables con tus créditos</Text>
            {CREDIT_EVENTS.map((ev) => {
              const redeemed = state.redeemedEventIds.includes(ev.id);
              const canAfford = user.uturnCredits >= ev.creditsCost;
              return (
                <Card key={ev.id} style={[s.eventCard, !canAfford && !redeemed && s.eventCardOff]}>
                  <View style={s.eventIcon}>
                    <Ionicons name={ev.icon} size={22} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={s.eventTitle}>{ev.title}</Text>
                    <Text style={s.eventPartner}>{ev.partner} · {ev.dateLabel}</Text>
                    <Text style={s.eventDetail} numberOfLines={2}>{ev.detail}</Text>
                    <View style={s.eventFooter}>
                      <View style={s.spotsRow}>
                        <Ionicons name="people-outline" size={13} color={COLORS.textMuted} />
                        <Text style={s.spots}>{ev.spotsLeft} cupos</Text>
                      </View>
                      <TouchableOpacity
                        style={[s.redeemBtn, redeemed && s.redeemedBtn, !canAfford && !redeemed && s.redeemBtnOff]}
                        onPress={() => handleRedeem(ev.id, ev.creditsCost, ev.title)}
                        disabled={redeemed}
                      >
                        <Text style={[s.redeemTxt, redeemed && s.redeemedTxt]}>
                          {redeemed ? 'Canjeado ✓' : `${ev.creditsCost} créditos`}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        ) : (
          <View style={{ gap: SPACING.md }}>
            <Text style={s.sectionSub}>Así puedes sumar créditos UTurn</Text>
            {CREDIT_EARNING_METHODS.map((m) => (
              <Card key={m.id} style={s.earnCard}>
                <View style={s.earnIcon}>
                  <Ionicons name={m.icon} size={20} color={COLORS.success} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.earnTitle}>{m.title}</Text>
                  <Text style={s.earnDesc}>{m.description}</Text>
                </View>
                <View style={s.earnBadge}>
                  <Text style={s.earnBadgeTxt}>{m.credits}</Text>
                </View>
              </Card>
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md },
  scroll: { padding: SPACING.xl, paddingTop: 0, gap: SPACING.lg, paddingBottom: 40 },
  balanceCard: { alignItems: 'center', gap: 6, paddingVertical: SPACING.xl },
  balanceVal: { fontSize: 36, fontWeight: '800', color: '#fff' },
  balanceLabel: { fontSize: 13, color: COLORS.onDarkMuted },
  tabs: { flexDirection: 'row', backgroundColor: COLORS.surfaceMuted, borderRadius: RADII.md, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: RADII.sm },
  tabActive: { backgroundColor: COLORS.surface },
  tabTxt: { fontSize: 14, fontWeight: '600', color: COLORS.textMuted },
  tabTxtActive: { color: COLORS.text },
  sectionSub: { fontSize: 13, color: COLORS.textMuted },
  eventCard: { flexDirection: 'row', gap: SPACING.md },
  eventCardOff: { opacity: 0.7 },
  eventIcon: { width: 44, height: 44, borderRadius: RADII.md, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  eventTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  eventPartner: { fontSize: 12, color: COLORS.textMuted },
  eventDetail: { fontSize: 12, color: COLORS.textSubtle },
  eventFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  spotsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  spots: { fontSize: 12, color: COLORS.textMuted },
  redeemBtn: { backgroundColor: COLORS.ink, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADII.sm },
  redeemBtnOff: { backgroundColor: COLORS.surfaceMuted },
  redeemedBtn: { backgroundColor: COLORS.successSoft },
  redeemTxt: { fontSize: 12, fontWeight: '700', color: '#fff' },
  redeemedTxt: { color: COLORS.success },
  earnCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  earnIcon: { width: 40, height: 40, borderRadius: RADII.md, backgroundColor: COLORS.successSoft, alignItems: 'center', justifyContent: 'center' },
  earnTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  earnDesc: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  earnBadge: { backgroundColor: COLORS.surfaceMuted, borderRadius: RADII.sm, paddingHorizontal: 10, paddingVertical: 6 },
  earnBadgeTxt: { fontSize: 12, fontWeight: '700', color: COLORS.text },
});

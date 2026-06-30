import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { useUser } from '@/contexts/UserContext';
import { useAppState } from '@/store/appState';
import { COLORS, RADII, SPACING, TYPE } from '@/constants/designSystem';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { TierBadge } from '@/components/ui/TierBadge';
import { AppButton } from '@/components/ui/AppButton';
import { getTutorById } from '@/constants/tutors';
import type { TutoringSession } from '@/models/types';

export default function TutorDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, updateUser } = useUser();
  const { dispatch } = useAppState();
  const tutor = getTutorById(id);

  const [subject, setSubject] = useState<string | null>(tutor?.subjects[0]?.name ?? null);
  const [slot, setSlot] = useState<{ day: string; time: string } | null>(null);
  const [payWithCredits, setPayWithCredits] = useState(false);

  if (!tutor) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.notFound}>
          <Text style={s.notFoundTxt}>Tutor no encontrado</Text>
          <AppButton label="Volver" variant="secondary" fullWidth={false} onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const price = tutor.pricePerHour;
  const canUseCredits = (user?.uturnCredits ?? 0) >= price;

  function handleBook() {
    if (!user || !tutor) return;
    if (!subject) { Alert.alert('Elige el ramo a reforzar'); return; }
    if (!slot) { Alert.alert('Elige un horario disponible'); return; }

    // próxima fecha del día elegido (aprox: hoy + offset), solo para el mock
    const session: TutoringSession = {
      id: 'tutoring_' + Date.now(),
      tutorId: tutor.id,
      tutorName: tutor.name,
      studentId: user.id,
      studentName: user.name,
      subjectName: subject,
      scheduledAt: new Date().toISOString(),
      durationMinutes: 60,
      price,
      paidWithCredits: payWithCredits,
      status: 'confirmed',
    };
    dispatch({ type: 'ADD_TUTORING_SESSION', payload: session });
    if (payWithCredits) updateUser({ uturnCredits: user.uturnCredits - price });

    Alert.alert(
      '¡Asesoría reservada!',
      `${subject} con ${tutor.name}, ${slot.day} ${slot.time}.`,
      [{ text: 'Ver mis asesorías', onPress: () => router.replace('/(tabs)/my-trips') }],
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Perfil */}
        <Card dark style={s.hero}>
          <Avatar name={tutor.name} size={56} dark />
          <View style={{ flex: 1 }}>
            <View style={s.nameRow}>
              <Text style={s.name}>{tutor.name}</Text>
              <TierBadge tier={tutor.tier} solid size="sm" />
            </View>
            <Text style={s.uni}>{tutor.university}</Text>
            <View style={s.heroStats}>
              <View style={s.heroStat}><Ionicons name="star" size={13} color={COLORS.warning} /><Text style={s.heroStatTxt}>{tutor.rating.toFixed(1)}</Text></View>
              <Text style={s.heroDot}>·</Text>
              <Text style={s.heroStatTxt}>{tutor.sessionCount} asesorías</Text>
              <Text style={s.heroDot}>·</Text>
              <Text style={s.heroStatTxt}>{tutor.approvalRate}% aprobó</Text>
            </View>
          </View>
        </Card>

        <Card><Text style={s.bio}>{tutor.bio}</Text></Card>

        {/* Ramos (selección) */}
        <View style={{ gap: SPACING.sm }}>
          <Text style={TYPE.heading}>¿Qué ramo quieres reforzar?</Text>
          <View style={s.subjectsWrap}>
            {tutor.subjects.map((sub) => {
              const active = subject === sub.name;
              return (
                <TouchableOpacity key={sub.name} style={[s.subjectCard, active && s.subjectActive]} onPress={() => setSubject(sub.name)}>
                  <Text style={[s.subjectName, active && { color: COLORS.primary }]}>{sub.name}</Text>
                  <View style={s.gradeRow}>
                    <Ionicons name="checkmark-circle" size={13} color={COLORS.success} />
                    <Text style={s.gradeTxt}>Aprobado con {sub.grade.toFixed(1)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Disponibilidad */}
        <View style={{ gap: SPACING.sm }}>
          <Text style={TYPE.heading}>Disponibilidad</Text>
          {tutor.availability.map((av) => (
            <Card key={av.day} style={{ gap: SPACING.sm }}>
              <Text style={s.dayLabel}>{av.day}</Text>
              <View style={s.slotsRow}>
                {av.slots.map((time) => {
                  const active = slot?.day === av.day && slot?.time === time;
                  return (
                    <TouchableOpacity key={time} style={[s.slot, active && s.slotActive]} onPress={() => setSlot({ day: av.day, time })}>
                      <Text style={[s.slotTxt, active && s.slotTxtActive]}>{time}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Card>
          ))}
        </View>

        {/* Pago con créditos */}
        <TouchableOpacity
          style={[s.creditsRow, !canUseCredits && s.creditsOff]}
          onPress={() => canUseCredits && setPayWithCredits((v) => !v)}
          disabled={!canUseCredits}
        >
          <Ionicons name="wallet-outline" size={20} color={canUseCredits ? COLORS.primary : COLORS.textSubtle} />
          <View style={{ flex: 1 }}>
            <Text style={[s.creditsLabel, !canUseCredits && s.muted]}>Pagar con créditos UTurn</Text>
            <Text style={[s.creditsSub, !canUseCredits && s.muted]}>
              {canUseCredits ? `Tienes ${user?.uturnCredits} créditos` : 'Créditos insuficientes'}
            </Text>
          </View>
          <View style={[s.check, payWithCredits && s.checkOn]}>
            {payWithCredits && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        </TouchableOpacity>

      </ScrollView>

      {/* Footer reservar */}
      <View style={s.footer}>
        <View>
          <Text style={s.footerLabel}>1 hora de asesoría</Text>
          <Text style={s.footerPrice}>
            {payWithCredits ? `${price.toLocaleString('es-CL')} créditos` : `$${price.toLocaleString('es-CL')}`}
          </Text>
        </View>
        <AppButton label="Reservar asesoría" fullWidth={false} style={{ paddingHorizontal: 24 }} onPress={handleBook} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: SPACING.xl, gap: SPACING.lg, paddingBottom: SPACING.xl },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.lg },
  notFoundTxt: { fontSize: 16, color: COLORS.textMuted },
  hero: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  name: { fontSize: 18, fontWeight: '800', color: '#fff' },
  uni: { fontSize: 12, color: '#7BA7CC', marginTop: 2 },
  heroStats: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  heroStat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  heroStatTxt: { fontSize: 12, color: COLORS.onDarkMuted },
  heroDot: { color: COLORS.onDarkMuted },
  bio: { fontSize: 14, color: COLORS.textMuted, lineHeight: 21 },
  subjectsWrap: { gap: SPACING.sm },
  subjectCard: { backgroundColor: COLORS.surface, borderRadius: RADII.md, padding: SPACING.md, borderWidth: 1.5, borderColor: COLORS.border, gap: 4 },
  subjectActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  subjectName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  gradeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  gradeTxt: { fontSize: 12, color: COLORS.success, fontWeight: '600' },
  dayLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  slotsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  slot: { backgroundColor: COLORS.surfaceMuted, borderRadius: RADII.sm, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1.5, borderColor: 'transparent' },
  slotActive: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primary },
  slotTxt: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  slotTxtActive: { color: COLORS.primary },
  creditsRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADII.md, padding: SPACING.lg, borderWidth: 1.5, borderColor: COLORS.border },
  creditsOff: { opacity: 0.6 },
  creditsLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  creditsSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  muted: { color: COLORS.textSubtle },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: COLORS.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.xl, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  footerLabel: { fontSize: 12, color: COLORS.textMuted },
  footerPrice: { fontSize: 22, fontWeight: '800', color: COLORS.text },
});

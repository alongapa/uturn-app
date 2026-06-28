import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useUser } from '@/contexts/UserContext';
import { COLORS, RADII, SPACING, TYPE } from '@/constants/designSystem';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { TierBadge } from '@/components/ui/TierBadge';
import { AppButton } from '@/components/ui/AppButton';

export default function ProfileScreen() {
  const { user, updateUser, clearUser } = useUser();
  const [carModel, setCarModel] = useState(user?.carModel ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [editing, setEditing] = useState(false);

  if (!user) return null;

  function handleSave() {
    updateUser({ carModel, bio });
    setEditing(false);
    Alert.alert('Perfil actualizado');
  }

  function handleLogout() {
    Alert.alert('Cerrar sesión', '¿Seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => { clearUser(); router.replace('/'); } },
    ]);
  }

  const verified = user.verificationStatus === 'verified';

  const stats = [
    { label: 'Viajes\nconductor', value: user.completedTripsAsDriver },
    { label: 'Viajes\npasajero', value: user.completedTripsAsPassenger },
    { label: 'Asesorías', value: user.completedTutoringSessions },
    { label: 'Créditos', value: user.uturnCredits },
  ];

  const scores = [
    { label: 'Puntualidad', val: user.reputationScore.punctuality },
    { label: 'Manejo', val: user.reputationScore.drivingQuality },
    { label: 'Precio', val: user.reputationScore.price },
    { label: 'Disposición', val: user.reputationScore.disposition },
    { label: 'Como pasajero', val: user.reputationScore.asPassenger },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <Card dark style={s.hero}>
          <View style={s.heroTop}>
            <Avatar name={user.name} size={64} dark />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{user.name}</Text>
              <Text style={s.email}>{user.email}</Text>
              <Text style={s.uni}>{user.university}</Text>
            </View>
            <TierBadge tier={user.tier} solid />
          </View>
          <View style={s.heroFooter}>
            <View style={s.ratingRow}>
              <Ionicons name="star" size={18} color={COLORS.warning} />
              <Text style={s.ratingBig}>{user.rating.toFixed(1)}</Text>
              <Text style={s.ratingLabel}>calificación</Text>
            </View>
            {verified && (
              <View style={s.verifiedPill}>
                <Ionicons name="shield-checkmark" size={13} color={COLORS.success} />
                <Text style={s.verifiedTxt}>Verificado</Text>
              </View>
            )}
          </View>
        </Card>

        <View style={s.statsRow}>
          {stats.map((st) => (
            <Card key={st.label} style={s.statBox} padded={false}>
              <Text style={s.statVal}>{st.value}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </Card>
          ))}
        </View>

        {user.badges.length > 0 && (
          <Card style={{ gap: SPACING.md }}>
            <Text style={TYPE.heading}>Logros</Text>
            <View style={s.badgesWrap}>
              {user.badges.map((b) => (
                <View key={b.id} style={s.badge}>
                  <Ionicons name="ribbon" size={14} color={COLORS.success} />
                  <Text style={s.badgeLabel}>{b.label}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        <Card style={{ gap: SPACING.md }}>
          <Text style={TYPE.heading}>Reputación detallada</Text>
          {scores.map((sc) => (
            <View key={sc.label} style={s.scoreRow}>
              <Text style={s.scoreLabel}>{sc.label}</Text>
              <View style={s.barBg}>
                <View style={[s.barFill, { width: `${(sc.val / 5) * 100}%` as any }]} />
              </View>
              <Text style={s.scoreVal}>{sc.val.toFixed(1)}</Text>
            </View>
          ))}
        </Card>

        <Card style={{ gap: SPACING.md }}>
          <View style={s.cardRow}>
            <Text style={TYPE.heading}>Datos adicionales</Text>
            <TouchableOpacity onPress={() => setEditing((e) => !e)}>
              <Text style={s.editBtn}>{editing ? 'Cancelar' : 'Editar'}</Text>
            </TouchableOpacity>
          </View>

          <View>
            <Text style={s.fieldLabel}>Modelo de auto</Text>
            <TextInput
              style={[s.input, !editing && s.inputOff]}
              value={carModel} onChangeText={setCarModel}
              placeholder="Ej: Mazda 3 2021" editable={editing} placeholderTextColor={COLORS.textSubtle}
            />
          </View>
          <View>
            <Text style={s.fieldLabel}>Sobre mí</Text>
            <TextInput
              style={[s.input, s.textArea, !editing && s.inputOff]}
              value={bio} onChangeText={setBio}
              placeholder="Cuéntale algo a tus pasajeros..." editable={editing} multiline placeholderTextColor={COLORS.textSubtle}
            />
          </View>
          {editing && <AppButton label="Guardar cambios" variant="secondary" onPress={handleSave} />}
        </Card>

        {!verified && (
          <AppButton label="Verificar credencial universitaria" variant="outline" icon="school-outline" onPress={() => router.push('/verify-profile')} />
        )}
        <AppButton label="Cerrar sesión" variant="danger" icon="log-out-outline" onPress={handleLogout} />

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: SPACING.xl, gap: SPACING.lg, paddingBottom: 40 },
  hero: { gap: SPACING.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  name: { fontSize: 20, fontWeight: '800', color: '#fff' },
  email: { fontSize: 12, color: COLORS.onDarkMuted, marginTop: 2 },
  uni: { fontSize: 12, color: '#7BA7CC', marginTop: 2 },
  heroFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ratingRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  ratingBig: { fontSize: 26, fontWeight: '800', color: '#fff' },
  ratingLabel: { fontSize: 13, color: COLORS.onDarkMuted },
  verifiedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADII.pill },
  verifiedTxt: { fontSize: 12, color: COLORS.success, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: SPACING.sm },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: SPACING.md },
  statVal: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: 10, color: COLORS.textMuted, textAlign: 'center', marginTop: 4 },
  badgesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.successSoft, borderRadius: RADII.pill, paddingHorizontal: 10, paddingVertical: 6 },
  badgeLabel: { fontSize: 12, fontWeight: '600', color: COLORS.success },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  scoreLabel: { fontSize: 13, color: COLORS.textMuted, width: 100 },
  barBg: { flex: 1, height: 6, backgroundColor: COLORS.surfaceMuted, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3 },
  scoreVal: { fontSize: 13, fontWeight: '700', color: COLORS.text, width: 28, textAlign: 'right' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editBtn: { fontSize: 14, color: COLORS.primary, fontWeight: '600' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADII.md, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.surface },
  inputOff: { color: COLORS.textMuted, backgroundColor: COLORS.surfaceMuted },
  textArea: { minHeight: 76, textAlignVertical: 'top' },
});

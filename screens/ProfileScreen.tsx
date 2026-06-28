import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useUser } from '@/contexts/UserContext';
import { TIER_COLORS, TIER_LABELS } from '@/models/types';

export default function ProfileScreen() {
  const { user, updateUser, clearUser } = useUser();
  const [carModel, setCarModel] = useState(user?.carModel ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [editing, setEditing] = useState(false);

  if (!user) return null;

  const tierColor = TIER_COLORS[user.tier];
  const tierLabel = TIER_LABELS[user.tier];

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
    { label: 'Pasajero', val: user.reputationScore.asPassenger },
  ];

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <View style={s.heroCard}>
          <View style={s.avatarWrap}>
            <View style={s.avatar}>
              <Text style={s.avatarInitial}>{user.name[0]}</Text>
            </View>
            <View style={[s.tierBadge, { backgroundColor: tierColor }]}>
              <Text style={s.tierTxt}>⭐ {tierLabel}</Text>
            </View>
          </View>
          <View style={s.heroInfo}>
            <Text style={s.name}>{user.name}</Text>
            <Text style={s.email}>{user.email}</Text>
            <Text style={s.uni}>{user.university}</Text>
            <View style={s.ratingRow}>
              <Text style={s.ratingBig}>{user.rating.toFixed(1)}</Text>
              <Text style={s.stars}>{'★'.repeat(Math.round(user.rating))}{'☆'.repeat(5 - Math.round(user.rating))}</Text>
            </View>
          </View>
        </View>

        <View style={s.statsRow}>
          {stats.map((st) => (
            <View key={st.label} style={s.statBox}>
              <Text style={s.statVal}>{st.value}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        {user.badges.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Logros</Text>
            <View style={s.badgesWrap}>
              {user.badges.map((b) => (
                <View key={b.id} style={s.badge}>
                  <Text style={s.badgeIcon}>{b.icon}</Text>
                  <Text style={s.badgeLabel}>{b.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={s.card}>
          <Text style={s.cardTitle}>Reputación detallada</Text>
          {scores.map((sc) => (
            <View key={sc.label} style={s.scoreRow}>
              <Text style={s.scoreLabel}>{sc.label}</Text>
              <View style={s.barBg}>
                <View style={[s.barFill, { width: `${(sc.val / 5) * 100}%` as any }]} />
              </View>
              <Text style={s.scoreVal}>{sc.val.toFixed(1)}</Text>
            </View>
          ))}
        </View>

        <View style={s.card}>
          <View style={s.cardRow}>
            <Text style={s.cardTitle}>Datos adicionales</Text>
            <TouchableOpacity onPress={() => setEditing((e) => !e)}>
              <Text style={s.editBtn}>{editing ? 'Cancelar' : 'Editar'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.fieldLabel}>Modelo de auto</Text>
          <TextInput
            style={[s.input, !editing && s.inputOff]}
            value={carModel}
            onChangeText={setCarModel}
            placeholder="Ej: Mazda 3 2021"
            editable={editing}
            placeholderTextColor="#94A3B8"
          />

          <Text style={s.fieldLabel}>Sobre mí</Text>
          <TextInput
            style={[s.input, s.textArea, !editing && s.inputOff]}
            value={bio}
            onChangeText={setBio}
            placeholder="Cuéntale algo a tus pasajeros..."
            editable={editing}
            multiline
            placeholderTextColor="#94A3B8"
          />

          {editing && (
            <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
              <Text style={s.saveBtnTxt}>Guardar cambios</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={s.verifyBtn} onPress={() => router.push('/verify-profile')}>
          <Text style={s.verifyTxt}>🎓 Verificar credencial universitaria</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
          <Text style={s.logoutTxt}>Cerrar sesión</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 20, gap: 14 },
  heroCard: { backgroundColor: '#0A1525', borderRadius: 20, padding: 20, flexDirection: 'row', gap: 16, alignItems: 'center' },
  avatarWrap: { alignItems: 'center', gap: 8 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#246BFD', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 28, fontWeight: '800', color: '#fff' },
  tierBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  tierTxt: { fontSize: 11, fontWeight: '800', color: '#fff' },
  heroInfo: { flex: 1 },
  name: { fontSize: 20, fontWeight: '800', color: '#fff' },
  email: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  uni: { fontSize: 12, color: '#7BA7CC', marginTop: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 },
  ratingBig: { fontSize: 28, fontWeight: '800', color: '#fff' },
  stars: { fontSize: 14, color: '#F59E0B' },
  statsRow: { flexDirection: 'row', gap: 10 },
  statBox: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  statVal: { fontSize: 20, fontWeight: '800', color: '#0A1525' },
  statLabel: { fontSize: 10, color: '#64748B', textAlign: 'center', marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 12 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0A1525' },
  editBtn: { fontSize: 14, color: '#246BFD', fontWeight: '600' },
  badgesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F0FDF4', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#BBF7D0' },
  badgeIcon: { fontSize: 14 },
  badgeLabel: { fontSize: 12, fontWeight: '600', color: '#15803D' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scoreLabel: { fontSize: 12, color: '#64748B', width: 90 },
  barBg: { flex: 1, height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#246BFD', borderRadius: 3 },
  scoreVal: { fontSize: 12, fontWeight: '700', color: '#0A1525', width: 28, textAlign: 'right' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: { borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#0A1525', backgroundColor: '#F8FAFC' },
  inputOff: { color: '#94A3B8', backgroundColor: '#F1F5F9' },
  textArea: { minHeight: 72, textAlignVertical: 'top' },
  saveBtn: { backgroundColor: '#0A1525', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  verifyBtn: { borderWidth: 1.5, borderColor: '#246BFD', borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: '#EFF6FF' },
  verifyTxt: { fontSize: 14, fontWeight: '700', color: '#246BFD' },
  logoutBtn: { borderWidth: 1.5, borderColor: '#DC2626', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  logoutTxt: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
});

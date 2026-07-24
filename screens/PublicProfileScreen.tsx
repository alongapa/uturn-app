import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ReportSheet } from '@/components/safety/report-sheet';
import { useUser } from '@/contexts/UserContext';
import { blockUser, unblockUser } from '@/services/api/moderation';
import { getPublicProfile, type PublicProfile } from '@/services/api/privacy';

/**
 * Perfil público de un tercero (Sesión 9): respeta profile_visibility y
 * bloqueo mutuo (get_public_profile, RPC). Punto de entrada de "reportar
 * usuario" y "bloquear usuario" desde cualquier parte de la app.
 */
export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useUser();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getPublicProfile(String(id));
      setProfile(data);
    } catch {
      Alert.alert('No se pudo cargar el perfil');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleBlock = async () => {
    if (!profile || !id) return;
    setBusy(true);
    try {
      if (profile.isBlocked) {
        await unblockUser(String(id));
      } else {
        await blockUser(String(id));
      }
      await load();
    } catch (err) {
      Alert.alert('No se pudo actualizar el bloqueo', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  if (!profile || !id) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Perfil no encontrado</Text>
      </View>
    );
  }

  if (profile.hidden) {
    return (
      <View style={styles.center}>
        <Ionicons name="eye-off-outline" size={32} color="#94a3b8" />
        <Text style={styles.emptyText}>Este perfil es privado</Text>
      </View>
    );
  }

  const isSelf = user?.id === id;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.avatarWrap}>
        {profile.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitials}>{(profile.fullName ?? '?').slice(0, 2).toUpperCase()}</Text>
          </View>
        )}
      </View>
      <Text style={styles.name}>{profile.fullName ?? 'Estudiante Unities'}</Text>
      {profile.credentialVerified && (
        <View style={styles.badge}>
          <Ionicons name="shield-checkmark" size={14} color="#16a34a" />
          <Text style={styles.badgeText}>Credencial verificada</Text>
        </View>
      )}

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{profile.ratingAvg?.toFixed(1) ?? '—'}</Text>
          <Text style={styles.statLabel}>Reputación</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{profile.completedTrips ?? 0}</Text>
          <Text style={styles.statLabel}>Viajes seguidos</Text>
        </View>
      </View>

      {profile.memberSince && (
        <Text style={styles.memberSince}>
          En Unities desde {new Date(profile.memberSince).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}
        </Text>
      )}

      {!isSelf && (
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.reportButton} onPress={() => setReportVisible(true)}>
            <Ionicons name="flag-outline" size={16} color="#b45309" />
            <Text style={styles.reportText}>Reportar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.blockButton, profile.isBlocked && styles.blockButtonActive]}
            onPress={handleToggleBlock}
            disabled={busy}
          >
            <Ionicons name={profile.isBlocked ? 'lock-open-outline' : 'lock-closed-outline'} size={16} color={profile.isBlocked ? '#0f172a' : '#dc2626'} />
            <Text style={[styles.blockText, profile.isBlocked && styles.blockTextActive]}>
              {profile.isBlocked ? 'Desbloquear' : 'Bloquear'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <ReportSheet
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        targetType="usuario"
        targetUserId={String(id)}
        allowBlock={!profile.isBlocked}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, alignItems: 'center', gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { color: '#64748b' },
  avatarWrap: { marginTop: 8 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarPlaceholder: { backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 28, fontWeight: '800', color: '#475569' },
  name: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f0fdf4', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#16a34a', fontWeight: '700', fontSize: 12 },
  statsRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  statCard: { alignItems: 'center', gap: 2, minWidth: 90 },
  statValue: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  statLabel: { color: '#64748b', fontSize: 12 },
  memberSince: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  reportButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
  },
  reportText: { color: '#b45309', fontWeight: '700' },
  blockButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
  },
  blockButtonActive: { borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
  blockText: { color: '#dc2626', fontWeight: '700' },
  blockTextActive: { color: '#0f172a' },
});

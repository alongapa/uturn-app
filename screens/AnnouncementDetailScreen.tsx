import React from 'react';
import { View, Text, ScrollView, StyleSheet, Image, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { useAppState } from '@/store/appState';
import { COLORS, RADII, SPACING, TYPE } from '@/constants/designSystem';
import { Card } from '@/components/ui/Card';
import { AppButton } from '@/components/ui/AppButton';
import { CategoryPill } from '@/components/ui/CategoryPill';
import { ORGANIZATION_TYPE_LABELS } from '@/models/types';

export default function AnnouncementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAppState();
  const a = state.announcements.find((x) => x.id === id);
  const org = a ? state.organizations.find((o) => o.id === a.organizationId) : undefined;

  if (!a) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.notFound}>
          <Text style={s.notFoundTxt}>Publicación no encontrada</Text>
          <AppButton label="Volver" variant="secondary" fullWidth={false} onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  function openLink() {
    if (!a?.linkUrl) return;
    Alert.alert(
      'Abrir enlace externo',
      `Vas a salir de UTurn hacia:\n${a.linkUrl}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Abrir', onPress: () => Linking.openURL(a.linkUrl!) },
      ],
    );
  }

  const publishedLabel = new Date(a.publishedAt).toLocaleString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.topbar}>
        <View onTouchEnd={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </View>
        <Text style={TYPE.heading}>Publicación</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Card style={{ gap: SPACING.md }}>
          <View style={s.orgRow}>
            <View style={s.orgIcon}>
              <Ionicons name={a.organizationIcon as keyof typeof Ionicons.glyphMap} size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={s.orgNameRow}>
                <Text style={s.orgName}>{a.organizationName}</Text>
                <Ionicons name="checkmark-circle" size={15} color={COLORS.primary} />
              </View>
              <Text style={s.orgType}>{org ? ORGANIZATION_TYPE_LABELS[org.type] : 'Organización oficial'}</Text>
            </View>
          </View>
        </Card>

        {a.imageUrl ? <Image source={{ uri: a.imageUrl }} style={s.image} resizeMode="cover" /> : null}

        <View style={{ gap: SPACING.sm }}>
          <CategoryPill category={a.category} />
          <Text style={s.title}>{a.title}</Text>
          <Text style={s.date}>Publicado {publishedLabel}</Text>
        </View>

        <Text style={s.body}>{a.body}</Text>

        {a.linkUrl && (
          <AppButton label={a.linkLabel ?? 'Más información'} icon="open-outline" onPress={openLink} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md },
  scroll: { padding: SPACING.xl, paddingTop: 0, gap: SPACING.lg, paddingBottom: 40 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.lg },
  notFoundTxt: { fontSize: 16, color: COLORS.textMuted },
  orgRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  orgIcon: { width: 44, height: 44, borderRadius: RADII.md, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  orgNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  orgName: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  orgType: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  image: { width: '100%', height: 200, borderRadius: RADII.lg, backgroundColor: COLORS.surfaceMuted },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  date: { fontSize: 12, color: COLORS.textSubtle, textTransform: 'capitalize' },
  body: { fontSize: 15, color: COLORS.text, lineHeight: 23 },
});

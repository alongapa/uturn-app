import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useAppState } from '@/store/appState';
import { COLORS, RADII, SPACING, TYPE } from '@/constants/designSystem';
import { Card } from '@/components/ui/Card';
import { CategoryPill } from '@/components/ui/CategoryPill';
import { ANNOUNCEMENT_CATEGORY_LABELS, type Announcement, type AnnouncementCategory } from '@/models/types';

const FILTERS: Array<{ id: AnnouncementCategory | 'todos'; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'anuncio', label: 'Anuncios' },
  { id: 'evento', label: 'Eventos' },
  { id: 'promocion', label: 'Promos' },
  { id: 'descuento', label: 'Descuentos' },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'hace un momento';
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

export default function CommunityScreen() {
  const { state } = useAppState();
  const [filter, setFilter] = useState<AnnouncementCategory | 'todos'>('todos');

  const feed = useMemo(() => {
    const list = filter === 'todos'
      ? state.announcements
      : state.announcements.filter((a) => a.category === filter);
    return [...list].sort((a, b) => {
      if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
  }, [state.announcements, filter]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <View>
          <Text style={TYPE.display}>Comunidad</Text>
          <Text style={s.sub}>Anuncios oficiales de tu universidad</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <TouchableOpacity key={f.id} style={[s.chip, active && s.chipActive]} onPress={() => setFilter(f.id)}>
                <Text style={[s.chipTxt, active && s.chipTxtActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={feed}
        keyExtractor={(a) => a.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="newspaper-outline" size={44} color={COLORS.textSubtle} />
            <Text style={s.emptyTxt}>No hay publicaciones en esta categoría</Text>
          </View>
        }
        renderItem={({ item }) => <AnnouncementCard a={item} />}
      />
    </SafeAreaView>
  );
}

function AnnouncementCard({ a }: { a: Announcement }) {
  return (
    <TouchableOpacity onPress={() => router.push({ pathname: '/comunidad/[id]', params: { id: a.id } } as never)} activeOpacity={0.9}>
      <Card style={{ gap: SPACING.md }}>
        <View style={s.orgRow}>
          <View style={s.orgIcon}>
            <Ionicons name={a.organizationIcon as keyof typeof Ionicons.glyphMap} size={16} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={s.orgNameRow}>
              <Text style={s.orgName}>{a.organizationShortName}</Text>
              <Ionicons name="checkmark-circle" size={13} color={COLORS.primary} />
            </View>
            <Text style={s.time}>{timeAgo(a.publishedAt)}</Text>
          </View>
          {a.pinned && (
            <View style={s.pinnedTag}>
              <Ionicons name="pin" size={11} color={COLORS.warning} />
              <Text style={s.pinnedTxt}>Fijado</Text>
            </View>
          )}
        </View>

        {a.imageUrl ? <Image source={{ uri: a.imageUrl }} style={s.image} resizeMode="cover" /> : null}

        <View style={{ gap: 6 }}>
          <CategoryPill category={a.category} />
          <Text style={s.title}>{a.title}</Text>
          <Text style={s.body} numberOfLines={3}>{a.body}</Text>
        </View>

        {a.linkUrl && (
          <View style={s.linkRow}>
            <Ionicons name="link-outline" size={14} color={COLORS.primary} />
            <Text style={s.linkTxt}>{a.linkLabel ?? 'Más información'}</Text>
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: { padding: SPACING.xl, gap: SPACING.md },
  sub: { ...TYPE.body, marginTop: 4 },
  filters: { gap: SPACING.sm },
  chip: { backgroundColor: COLORS.surface, borderRadius: RADII.pill, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  chipTxt: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  chipTxtActive: { color: '#fff' },
  list: { paddingHorizontal: SPACING.xl, paddingBottom: 24, gap: SPACING.md },
  orgRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  orgIcon: { width: 34, height: 34, borderRadius: RADII.sm, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  orgNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  orgName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  time: { fontSize: 11, color: COLORS.textSubtle },
  pinnedTag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.warningSoft, borderRadius: RADII.sm, paddingHorizontal: 7, paddingVertical: 3 },
  pinnedTxt: { fontSize: 10, fontWeight: '700', color: COLORS.warning },
  image: { width: '100%', height: 160, borderRadius: RADII.md, backgroundColor: COLORS.surfaceMuted },
  title: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  body: { fontSize: 13, color: COLORS.textMuted, lineHeight: 19 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkTxt: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  empty: { alignItems: 'center', paddingTop: 60, gap: SPACING.md },
  emptyTxt: { fontSize: 15, color: COLORS.textMuted, textAlign: 'center' },
});

export { ANNOUNCEMENT_CATEGORY_LABELS };

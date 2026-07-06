import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { AdminGuard } from '@/components/admin/admin-guard';
import { EventsWeekWidget } from '@/components/feed/events-week-widget';
import { formatEventDate } from '@/components/feed/feed-utils';
import type { EventWidgetConfig } from '@/services/api/admin';
import { listEventWidgetConfig, saveEventWidgetConfig } from '@/services/api/admin';
import type { FeedPost } from '@/services/api/feed';
import { listWeekEvents } from '@/services/api/feed';

type Row = { post: FeedPost; pinned: boolean; featured: boolean };

/**
 * Gestión del widget "Eventos de la semana": ordenar (flechas), fijar y
 * destacar los posts tipo evento de los próximos 7 días, con vista previa de
 * cómo lo verá el alumno. Guarda una fila widget_config por evento (la RLS
 * limita a los publishers del admin; el owner puede todo).
 */
export default function WidgetAdminScreen() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let active = true;
    // listWeekEvents ya viene en el orden editorial vigente.
    Promise.all([listWeekEvents(), listEventWidgetConfig()])
      .then(([events, config]) => {
        if (!active) return;
        setRows(
          events.map((post) => {
            const c = config.get(post.id);
            return { post, pinned: c?.pinned ?? false, featured: c?.featured ?? false };
          })
        );
      })
      .catch(() => active && Alert.alert('No se pudieron cargar los eventos'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const move = useCallback((index: number, delta: number) => {
    setRows((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  }, []);

  const toggle = useCallback((index: number, key: 'pinned' | 'featured') => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: !row[key] } : row)));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      for (const [index, row] of rows.entries()) {
        const config: EventWidgetConfig = {
          postId: row.post.id,
          sortOrder: index,
          pinned: row.pinned,
          featured: row.featured,
        };
        await saveEventWidgetConfig(config);
      }
      setDirty(false);
      Alert.alert('Widget guardado', 'El feed de Inicio ya muestra este orden.');
    } catch (error) {
      // Aquí cae el rechazo de RLS si el admin no administra ese publisher.
      Alert.alert(
        'No se pudo guardar',
        error instanceof Error ? error.message : 'Revisa tus permisos sobre estos publishers.'
      );
    } finally {
      setSaving(false);
    }
  }, [rows]);

  // Vista previa con el mismo criterio del servicio: fijados primero.
  const preview = useMemo(() => {
    const ordered = [...rows].sort((a, b) => Number(b.pinned) - Number(a.pinned));
    return ordered.map((row) => ({ ...row.post, destacado: row.featured }));
  }, [rows]);

  return (
    <AdminGuard>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator style={styles.loader} size="large" color="#246BFD" />
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>
            No hay eventos en los próximos 7 días. Publica un post tipo evento para alimentar el
            widget.
          </Text>
        ) : (
          <>
            <Text style={styles.hint}>
              Ordena con las flechas; el pin fija el evento al inicio y la estrella lo destaca.
            </Text>
            {rows.map((row, index) => (
              <View key={row.post.id} style={styles.eventRow}>
                <View style={styles.orderButtons}>
                  <TouchableOpacity onPress={() => move(index, -1)} hitSlop={8}>
                    <Ionicons name="chevron-up" size={20} color={index === 0 ? '#cbd5e1' : '#0f172a'} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => move(index, 1)} hitSlop={8}>
                    <Ionicons
                      name="chevron-down"
                      size={20}
                      color={index === rows.length - 1 ? '#cbd5e1' : '#0f172a'}
                    />
                  </TouchableOpacity>
                </View>
                <View style={styles.eventInfo}>
                  <Text style={styles.eventTitle} numberOfLines={2}>
                    {row.post.texto}
                  </Text>
                  <Text style={styles.eventMeta} numberOfLines={1}>
                    {row.post.publisher.name}
                    {row.post.eventoFecha ? ` · ${formatEventDate(row.post.eventoFecha)}` : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => toggle(index, 'pinned')} hitSlop={8}>
                  <Ionicons
                    name={row.pinned ? 'pin' : 'pin-outline'}
                    size={20}
                    color={row.pinned ? '#246BFD' : '#94a3b8'}
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => toggle(index, 'featured')} hitSlop={8}>
                  <Ionicons
                    name={row.featured ? 'star' : 'star-outline'}
                    size={20}
                    color={row.featured ? '#f59e0b' : '#94a3b8'}
                  />
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              style={[styles.saveButton, (!dirty || saving) && styles.saveDisabled]}
              onPress={handleSave}
              disabled={!dirty || saving}
            >
              <Text style={styles.saveText}>{saving ? 'Guardando…' : 'Guardar cambios'}</Text>
            </TouchableOpacity>

            <Text style={styles.previewTitle}>Vista previa (así lo ve el alumno)</Text>
            <View style={styles.previewBox}>
              <EventsWeekWidget events={preview} />
            </View>
          </>
        )}
      </ScrollView>
    </AdminGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  loader: { marginTop: 48 },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 32, lineHeight: 20 },
  hint: { color: '#64748b', fontSize: 12.5, lineHeight: 18 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  orderButtons: { gap: 2 },
  eventInfo: { flex: 1, gap: 3 },
  eventTitle: { color: '#0f172a', fontWeight: '700', fontSize: 13, lineHeight: 18 },
  eventMeta: { color: '#64748b', fontSize: 12 },
  saveButton: {
    backgroundColor: '#0A1525',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  saveDisabled: { opacity: 0.5 },
  saveText: { color: '#ffffff', fontWeight: '800' },
  previewTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginTop: 10 },
  previewBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 4,
  },
});

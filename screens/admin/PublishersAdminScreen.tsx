import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { AdminGuard } from '@/components/admin/admin-guard';
import { PublisherAvatar } from '@/components/feed/publisher-avatar';
import { PUBLISHER_KIND_LABEL } from '@/components/feed/feed-utils';
import type { PublisherMember } from '@/services/api/admin';
import {
  addPublisherMember,
  createPublisher,
  listPublisherMembers,
  removePublisherMember,
} from '@/services/api/admin';
import type { FeedPublisher } from '@/services/api/feed';
import { listPublishers } from '@/services/api/feed';
import type { PublisherKind } from '@/types/database';

const KINDS: PublisherKind[] = ['federacion', 'departamento', 'centro_alumnos', 'universidad', 'marca'];

/**
 * Vista owner: crear publishers (federaciones, centros, marcas…) y asignar
 * qué usuarios los administran (publisher_members). La RLS restringe estas
 * escrituras al rol owner.
 */
export default function PublishersAdminScreen() {
  const [publishers, setPublishers] = useState<FeedPublisher[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, PublisherMember[]>>({});
  const [memberEmail, setMemberEmail] = useState('');
  const [working, setWorking] = useState(false);

  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<PublisherKind>('centro_alumnos');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setPublishers(await listPublishers());
  }, []);

  useEffect(() => {
    let active = true;
    load()
      .catch(() => active && Alert.alert('No se pudieron cargar los publishers'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load]);

  const toggleExpand = useCallback(
    async (publisherId: string) => {
      if (expanded === publisherId) {
        setExpanded(null);
        return;
      }
      setExpanded(publisherId);
      setMemberEmail('');
      try {
        const list = await listPublisherMembers(publisherId);
        setMembers((prev) => ({ ...prev, [publisherId]: list }));
      } catch {
        Alert.alert('No se pudieron cargar los miembros');
      }
    },
    [expanded]
  );

  const handleAddMember = useCallback(
    async (publisherId: string) => {
      if (!memberEmail.trim()) {
        Alert.alert('Escribe el correo institucional del usuario');
        return;
      }
      setWorking(true);
      try {
        await addPublisherMember(publisherId, memberEmail);
        setMemberEmail('');
        setMembers((prev) => ({ ...prev, [publisherId]: [] }));
        const list = await listPublisherMembers(publisherId);
        setMembers((prev) => ({ ...prev, [publisherId]: list }));
      } catch (error) {
        Alert.alert(
          'No se pudo asignar',
          error instanceof Error ? error.message : 'Solo el owner asigna miembros.'
        );
      } finally {
        setWorking(false);
      }
    },
    [memberEmail]
  );

  const handleRemoveMember = useCallback((member: PublisherMember) => {
    Alert.alert('Quitar miembro', `¿Quitar a ${member.fullName} de este publisher?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          try {
            await removePublisherMember(member.publisherId, member.userId);
            setMembers((prev) => ({
              ...prev,
              [member.publisherId]: (prev[member.publisherId] ?? []).filter(
                (m) => m.userId !== member.userId
              ),
            }));
          } catch {
            Alert.alert('No se pudo quitar al miembro');
          }
        },
      },
    ]);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) {
      Alert.alert('Escribe el nombre del publisher');
      return;
    }
    setCreating(true);
    try {
      await createPublisher({ name: newName, kind: newKind, universityId: 'uai' });
      setNewName('');
      await load();
    } catch (error) {
      Alert.alert(
        'No se pudo crear',
        error instanceof Error ? error.message : 'Solo el owner crea publishers.'
      );
    } finally {
      setCreating(false);
    }
  }, [newName, newKind, load]);

  return (
    <AdminGuard ownerOnly>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator style={styles.loader} size="large" color="#246BFD" />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Nuevo publisher</Text>
            <View style={styles.chipRowWrap}>
              {KINDS.map((kind) => (
                <TouchableOpacity
                  key={kind}
                  style={[styles.chip, newKind === kind && styles.chipActive]}
                  onPress={() => setNewKind(kind)}
                >
                  <Text style={[styles.chipText, newKind === kind && styles.chipTextActive]}>
                    {PUBLISHER_KIND_LABEL[kind]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.createRow}>
              <TextInput
                style={styles.input}
                placeholder="P. ej. CA — Centro de Alumnos Medicina"
                placeholderTextColor="#94a3b8"
                value={newName}
                onChangeText={setNewName}
              />
              <TouchableOpacity
                style={[styles.createButton, creating && styles.disabled]}
                onPress={handleCreate}
                disabled={creating}
              >
                <Text style={styles.createText}>{creating ? '…' : 'Crear'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Publishers y miembros</Text>
            {publishers.map((pub) => (
              <View key={pub.id} style={styles.publisherCard}>
                <TouchableOpacity style={styles.publisherHeader} onPress={() => toggleExpand(pub.id)}>
                  <PublisherAvatar publisher={pub} size={36} />
                  <View style={styles.publisherInfo}>
                    <Text style={styles.publisherName} numberOfLines={1}>
                      {pub.name}
                    </Text>
                    <Text style={styles.publisherMeta}>{PUBLISHER_KIND_LABEL[pub.kind]}</Text>
                  </View>
                  <Ionicons
                    name={expanded === pub.id ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color="#94a3b8"
                  />
                </TouchableOpacity>

                {expanded === pub.id && (
                  <View style={styles.membersBox}>
                    {(members[pub.id] ?? []).map((member) => (
                      <View key={member.userId} style={styles.memberRow}>
                        <View style={styles.memberInfo}>
                          <Text style={styles.memberName} numberOfLines={1}>
                            {member.fullName}
                          </Text>
                          <Text style={styles.memberEmail} numberOfLines={1}>
                            {member.email}
                          </Text>
                        </View>
                        <TouchableOpacity onPress={() => handleRemoveMember(member)} hitSlop={8}>
                          <Ionicons name="close-circle-outline" size={20} color="#dc2626" />
                        </TouchableOpacity>
                      </View>
                    ))}
                    {(members[pub.id] ?? []).length === 0 && (
                      <Text style={styles.noMembers}>Sin miembros asignados.</Text>
                    )}
                    <View style={styles.addMemberRow}>
                      <TextInput
                        style={styles.memberInput}
                        placeholder="correo@alumnos.uai.cl"
                        placeholderTextColor="#94a3b8"
                        value={memberEmail}
                        onChangeText={setMemberEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                      />
                      <TouchableOpacity
                        style={[styles.addMemberButton, working && styles.disabled]}
                        onPress={() => handleAddMember(pub.id)}
                        disabled={working}
                      >
                        <Ionicons name="person-add-outline" size={18} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ))}
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
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginTop: 6 },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  chipActive: { backgroundColor: '#246BFD', borderColor: '#246BFD' },
  chipText: { color: '#475569', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#ffffff' },
  createRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  createButton: {
    backgroundColor: '#0A1525',
    borderRadius: 12,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
  createText: { color: '#ffffff', fontWeight: '800' },
  publisherCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  publisherHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  publisherInfo: { flex: 1, gap: 2 },
  publisherName: { color: '#0f172a', fontWeight: '700', fontSize: 14 },
  publisherMeta: { color: '#64748b', fontSize: 12 },
  membersBox: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    padding: 12,
    gap: 8,
  },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberInfo: { flex: 1, gap: 1 },
  memberName: { color: '#0f172a', fontWeight: '600', fontSize: 13 },
  memberEmail: { color: '#64748b', fontSize: 12 },
  noMembers: { color: '#94a3b8', fontSize: 12.5 },
  addMemberRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  memberInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#0f172a',
    fontSize: 13,
  },
  addMemberButton: {
    backgroundColor: '#0A1525',
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

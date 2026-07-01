import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useUser } from '@/contexts/UserContext';
import { useAppState } from '@/store/appState';
import { COLORS, RADII, SPACING, TYPE } from '@/constants/designSystem';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { TierBadge } from '@/components/ui/TierBadge';
import { AppButton } from '@/components/ui/AppButton';
import { countInstitutionalEmails } from '@/constants/institutionalEmails';
import { registerInstitutionalEmails } from '@/services/verification';
import { CategoryPill } from '@/components/ui/CategoryPill';
import {
  TIER_LABELS,
  ORGANIZATION_TYPE_LABELS,
  type OrganizationType,
  type AnnouncementCategory,
  type Organization,
  type Announcement,
} from '@/models/types';

type Section = 'dashboard' | 'verificaciones' | 'padron' | 'usuarios' | 'comunidad';

const ORG_TYPES: OrganizationType[] = ['federacion', 'centro_alumnos', 'bienestar', 'deportes', 'otro'];
const ANN_CATEGORIES: AnnouncementCategory[] = ['anuncio', 'evento', 'promocion', 'descuento'];

// Cola de verificación de ejemplo (en producción viene de verification_requests).
type VerifReq = {
  id: string; name: string; email: string; ocrName: string; matchScore: number; isInfoAlumno: boolean;
};
const SEED_VERIFICATIONS: VerifReq[] = [
  { id: 'v1', name: 'Alonso García Pastor', email: 'alonso@alumnos.uai.cl', ocrName: 'GARCIA PASTOR, ALONSO N.', matchScore: 0.86, isInfoAlumno: true },
  { id: 'v2', name: 'Camila Soto', email: 'camila@alumnos.uai.cl', ocrName: 'SOTO REYES, CAMILA A.', matchScore: 0.5, isInfoAlumno: true },
  { id: 'v3', name: 'Diego Fuentes', email: 'diego@alumnos.uai.cl', ocrName: '(no se detectó nombre)', matchScore: 0.0, isInfoAlumno: false },
];

export default function AdminScreen() {
  const { user } = useUser();
  const { state, dispatch } = useAppState();
  const [section, setSection] = useState<Section>('dashboard');
  const [queue, setQueue] = useState<VerifReq[]>(SEED_VERIFICATIONS);
  const [rosterInput, setRosterInput] = useState('');
  const [rosterCount, setRosterCount] = useState(countInstitutionalEmails());

  // Formulario de nueva organización
  const [orgName, setOrgName] = useState('');
  const [orgShort, setOrgShort] = useState('');
  const [orgType, setOrgType] = useState<OrganizationType>('centro_alumnos');
  // Formulario de nuevo anuncio
  const [postOrgId, setPostOrgId] = useState<string | null>(null);
  const [postTitle, setPostTitle] = useState('');
  const [postBody, setPostBody] = useState('');
  const [postLink, setPostLink] = useState('');
  const [postCategory, setPostCategory] = useState<AnnouncementCategory>('anuncio');

  const kpis = useMemo(() => {
    const users = state.registeredUsers;
    const verified = users.filter((u) => u.verificationStatus === 'verified').length;
    const activeTrips = state.trips.filter((t) => t.status !== 'cancelled' && t.status !== 'completed').length;
    const credits = users.reduce((acc, u) => acc + u.uturnCredits, 0);
    return {
      users: users.length,
      verifiedPct: users.length ? Math.round((verified / users.length) * 100) : 0,
      trips: state.trips.length,
      activeTrips,
      bookings: state.bookings.length,
      tutoring: state.tutoringSessions.length,
      credits,
      pending: queue.length,
    };
  }, [state, queue]);

  // Gate: solo admins (después de declarar todos los hooks).
  if (!user?.isAdmin) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.denied}>
          <Ionicons name="lock-closed-outline" size={40} color={COLORS.textSubtle} />
          <Text style={s.deniedTxt}>Acceso solo para administradores</Text>
          <AppButton label="Volver" variant="ghost" fullWidth={false} onPress={() => router.replace('/(tabs)')} />
        </View>
      </SafeAreaView>
    );
  }

  function resolve(id: string, approved: boolean) {
    setQueue((q) => q.filter((v) => v.id !== id));
    Alert.alert(approved ? 'Verificación aprobada' : 'Verificación rechazada');
  }

  function importRoster() {
    const emails = rosterInput.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
    if (emails.length === 0) { Alert.alert('Pega al menos un correo'); return; }
    const added = registerInstitutionalEmails(emails);
    setRosterCount((c) => c + added);
    setRosterInput('');
    Alert.alert('Padrón actualizado', `${added} correo(s) agregado(s).`);
  }

  function createOrganization() {
    if (!orgName.trim() || !orgShort.trim()) { Alert.alert('Completa el nombre y la sigla de la organización'); return; }
    const org: Organization = {
      id: 'org_' + Date.now(),
      name: orgName.trim(),
      shortName: orgShort.trim(),
      type: orgType,
      icon: 'people',
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_ORGANIZATION', payload: org });
    setOrgName(''); setOrgShort('');
    setPostOrgId(org.id);
    Alert.alert('Organización creada', `${org.name} ya puede publicar anuncios.`);
  }

  function publishAnnouncement() {
    const org = state.organizations.find((o) => o.id === postOrgId);
    if (!org) { Alert.alert('Elige una organización que publica'); return; }
    if (!postTitle.trim() || !postBody.trim()) { Alert.alert('Completa el título y el texto del anuncio'); return; }
    const ann: Announcement = {
      id: 'ann_' + Date.now(),
      organizationId: org.id,
      organizationName: org.name,
      organizationShortName: org.shortName,
      organizationIcon: org.icon,
      title: postTitle.trim(),
      body: postBody.trim(),
      linkUrl: postLink.trim() || undefined,
      linkLabel: postLink.trim() ? 'Más información' : undefined,
      category: postCategory,
      publishedAt: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_ANNOUNCEMENT', payload: ann });
    setPostTitle(''); setPostBody(''); setPostLink('');
    Alert.alert('¡Publicado!', 'El anuncio ya aparece en Comunidad y en el Home.');
  }

  function deleteAnnouncement(id: string, title: string) {
    Alert.alert('Eliminar publicación', `¿Eliminar "${title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => dispatch({ type: 'DELETE_ANNOUNCEMENT', payload: id }) },
    ]);
  }

  const sections: Array<{ id: Section; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { id: 'dashboard', label: 'Dashboard', icon: 'stats-chart' },
    { id: 'verificaciones', label: 'Verificaciones', icon: 'shield-checkmark' },
    { id: 'comunidad', label: 'Comunidad', icon: 'newspaper' },
    { id: 'padron', label: 'Padrón', icon: 'list' },
    { id: 'usuarios', label: 'Usuarios', icon: 'people' },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Top bar */}
      <View style={s.topbar}>
        <View>
          <Text style={s.brand}>UTurn · Admin</Text>
          <Text style={s.brandSub}>Panel de gestión — UAI</Text>
        </View>
        <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={s.exitBtn}>
          <Ionicons name="exit-outline" size={18} color={COLORS.textMuted} />
          <Text style={s.exitTxt}>Salir</Text>
        </TouchableOpacity>
      </View>

      {/* Section nav */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.nav} contentContainerStyle={s.navContent}>
        {sections.map((sec) => {
          const active = section === sec.id;
          return (
            <TouchableOpacity key={sec.id} style={[s.navChip, active && s.navActive]} onPress={() => setSection(sec.id)}>
              <Ionicons name={sec.icon} size={15} color={active ? '#fff' : COLORS.textMuted} />
              <Text style={[s.navTxt, active && s.navTxtActive]}>{sec.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>

        {section === 'dashboard' && (
          <>
            <View style={s.kpiGrid}>
              <KpiCard icon="people" label="Usuarios" value={kpis.users} />
              <KpiCard icon="shield-checkmark" label="Verificados" value={`${kpis.verifiedPct}%`} accent={COLORS.success} />
              <KpiCard icon="car-sport" label="Viajes activos" value={kpis.activeTrips} accent={COLORS.primary} />
              <KpiCard icon="bookmark" label="Reservas" value={kpis.bookings} />
              <KpiCard icon="school" label="Asesorías" value={kpis.tutoring} />
              <KpiCard icon="wallet" label="Créditos en circulación" value={kpis.credits} accent={COLORS.warning} />
              <KpiCard icon="newspaper" label="Anuncios publicados" value={state.announcements.length} accent="#8B5CF6" />
              <KpiCard icon="people-circle" label="Organizaciones" value={state.organizations.length} />
            </View>
            <Card style={s.alertCard}>
              <Ionicons name="alert-circle" size={20} color={COLORS.warning} />
              <Text style={s.alertTxt}>{kpis.pending} verificación(es) pendiente(s) de revisión</Text>
              <TouchableOpacity onPress={() => setSection('verificaciones')}>
                <Text style={s.alertLink}>Revisar</Text>
              </TouchableOpacity>
            </Card>
          </>
        )}

        {section === 'verificaciones' && (
          <View style={{ gap: SPACING.md }}>
            <Text style={s.sectionHint}>Captura de InfoAlumno UAI · el OCR extrae el nombre y lo compara con el registrado.</Text>
            {queue.length === 0 ? (
              <Card style={s.empty}><Text style={s.emptyTxt}>No hay verificaciones pendientes</Text></Card>
            ) : queue.map((v) => {
              const good = v.isInfoAlumno && v.matchScore >= 0.8;
              const warn = v.isInfoAlumno && v.matchScore >= 0.5 && v.matchScore < 0.8;
              const scoreColor = good ? COLORS.success : warn ? COLORS.warning : COLORS.danger;
              return (
                <Card key={v.id} style={{ gap: SPACING.md }}>
                  <View style={s.verifTop}>
                    <Avatar name={v.name} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.verifName}>{v.name}</Text>
                      <Text style={s.verifEmail}>{v.email}</Text>
                    </View>
                    <View style={[s.scorePill, { backgroundColor: scoreColor + '1F' }]}>
                      <Text style={[s.scoreTxt, { color: scoreColor }]}>{Math.round(v.matchScore * 100)}%</Text>
                    </View>
                  </View>
                  <View style={s.verifRow}>
                    <Text style={s.verifLabel}>Nombre OCR</Text>
                    <Text style={s.verifValue}>{v.ocrName}</Text>
                  </View>
                  <View style={s.verifRow}>
                    <Text style={s.verifLabel}>¿Es InfoAlumno?</Text>
                    <Text style={[s.verifValue, { color: v.isInfoAlumno ? COLORS.success : COLORS.danger }]}>
                      {v.isInfoAlumno ? 'Sí' : 'No — página incorrecta'}
                    </Text>
                  </View>
                  <View style={s.verifActions}>
                    <AppButton label="Rechazar" variant="danger" fullWidth={false} style={{ flex: 1 }} onPress={() => resolve(v.id, false)} />
                    <AppButton label="Aprobar" variant="secondary" fullWidth={false} style={{ flex: 1 }} onPress={() => resolve(v.id, true)} />
                  </View>
                </Card>
              );
            })}
          </View>
        )}

        {section === 'padron' && (
          <View style={{ gap: SPACING.md }}>
            <Card style={s.padronHead}>
              <View>
                <Text style={s.padronCount}>{rosterCount}</Text>
                <Text style={s.padronLabel}>correos en el padrón</Text>
              </View>
              <Ionicons name="document-text" size={28} color={COLORS.primary} />
            </Card>
            <Card style={{ gap: SPACING.md }}>
              <Text style={TYPE.heading}>Cargar correos</Text>
              <Text style={s.sectionHint}>Pega los correos institucionales (separados por coma, espacio o salto de línea).</Text>
              <TextInput
                style={s.textArea}
                multiline
                value={rosterInput}
                onChangeText={setRosterInput}
                placeholder={'alumno1@alumnos.uai.cl\nalumno2@alumnos.uai.cl'}
                placeholderTextColor={COLORS.textSubtle}
              />
              <AppButton label="Agregar al padrón" icon="cloud-upload-outline" onPress={importRoster} />
            </Card>
          </View>
        )}

        {section === 'comunidad' && (
          <View style={{ gap: SPACING.lg }}>
            {/* Crear organización */}
            <Card style={{ gap: SPACING.md }}>
              <Text style={TYPE.heading}>Nueva organización</Text>
              <Text style={s.sectionHint}>Solo las organizaciones que crees aquí pueden publicar en Comunidad.</Text>
              <TextInput style={s.input} value={orgName} onChangeText={setOrgName} placeholder="Nombre (ej: Centro de Alumnos Derecho)" placeholderTextColor={COLORS.textSubtle} />
              <TextInput style={s.input} value={orgShort} onChangeText={setOrgShort} placeholder="Sigla corta (ej: CADerecho)" placeholderTextColor={COLORS.textSubtle} />
              <View style={s.chipsWrap}>
                {ORG_TYPES.map((t) => (
                  <TouchableOpacity key={t} style={[s.selChip, orgType === t && s.selChipActive]} onPress={() => setOrgType(t)}>
                    <Text style={[s.selChipTxt, orgType === t && s.selChipTxtActive]}>{ORGANIZATION_TYPE_LABELS[t]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <AppButton label="Crear organización" icon="add-circle-outline" onPress={createOrganization} />
            </Card>

            {/* Publicar anuncio */}
            <Card style={{ gap: SPACING.md }}>
              <Text style={TYPE.heading}>Publicar anuncio</Text>
              <Text style={s.sectionHint}>Publica en nombre de una organización.</Text>
              <View style={s.chipsWrap}>
                {state.organizations.map((o) => (
                  <TouchableOpacity key={o.id} style={[s.selChip, postOrgId === o.id && s.selChipActive]} onPress={() => setPostOrgId(o.id)}>
                    <Text style={[s.selChipTxt, postOrgId === o.id && s.selChipTxtActive]}>{o.shortName}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={s.input} value={postTitle} onChangeText={setPostTitle} placeholder="Título del anuncio" placeholderTextColor={COLORS.textSubtle} />
              <TextInput style={[s.input, s.textArea]} value={postBody} onChangeText={setPostBody} placeholder="Texto del anuncio..." multiline placeholderTextColor={COLORS.textSubtle} />
              <TextInput style={s.input} value={postLink} onChangeText={setPostLink} placeholder="Link opcional (https://...)" autoCapitalize="none" keyboardType="url" placeholderTextColor={COLORS.textSubtle} />
              <View style={s.chipsWrap}>
                {ANN_CATEGORIES.map((c) => (
                  <TouchableOpacity key={c} style={[s.selChip, postCategory === c && s.selChipActive]} onPress={() => setPostCategory(c)}>
                    <Text style={[s.selChipTxt, postCategory === c && s.selChipTxtActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <AppButton label="Publicar" icon="send-outline" onPress={publishAnnouncement} />
            </Card>

            {/* Publicaciones existentes */}
            <Text style={TYPE.heading}>Publicaciones ({state.announcements.length})</Text>
            {state.announcements.map((a) => (
              <Card key={a.id} style={s.annRow}>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={s.annTopRow}>
                    <Text style={s.annOrg}>{a.organizationShortName}</Text>
                    <CategoryPill category={a.category} />
                  </View>
                  <Text style={s.annTitle} numberOfLines={1}>{a.title}</Text>
                </View>
                <TouchableOpacity onPress={() => deleteAnnouncement(a.id, a.title)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
                </TouchableOpacity>
              </Card>
            ))}
          </View>
        )}

        {section === 'usuarios' && (
          <View style={{ gap: SPACING.sm }}>
            {state.registeredUsers.map((u) => (
              <Card key={u.id} style={s.userRow}>
                <Avatar name={u.name} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={s.userName}>{u.name}</Text>
                  <Text style={s.userMeta}>{u.email} · {TIER_LABELS[u.tier]} · ⭐ {u.rating.toFixed(1)}</Text>
                </View>
                <TierBadge tier={u.tier} size="sm" />
              </Card>
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

function KpiCard({ icon, label, value, accent }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string | number; accent?: string }) {
  return (
    <Card style={s.kpiCard}>
      <View style={[s.kpiIcon, { backgroundColor: (accent ?? COLORS.ink) + '14' }]}>
        <Ionicons name={icon} size={18} color={accent ?? COLORS.ink} />
      </View>
      <Text style={s.kpiValue}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
    </Card>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.xl },
  deniedTxt: { fontSize: 16, color: COLORS.textMuted },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md },
  brand: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  brandSub: { fontSize: 12, color: COLORS.textMuted },
  exitBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  exitTxt: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
  nav: { maxHeight: 56, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  navContent: { paddingHorizontal: SPACING.xl, gap: SPACING.sm, alignItems: 'center' },
  navChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: RADII.pill, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  navActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  navTxt: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  navTxtActive: { color: '#fff' },
  body: { padding: SPACING.xl, gap: SPACING.lg, paddingBottom: 40 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  kpiCard: { width: '47%', flexGrow: 1, gap: 6 },
  kpiIcon: { width: 36, height: 36, borderRadius: RADII.sm, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginTop: 4 },
  kpiLabel: { fontSize: 12, color: COLORS.textMuted },
  alertCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  alertTxt: { flex: 1, fontSize: 13, color: COLORS.text, fontWeight: '600' },
  alertLink: { fontSize: 13, color: COLORS.primary, fontWeight: '700' },

  sectionHint: { fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
  empty: { alignItems: 'center', paddingVertical: SPACING.xxl },
  emptyTxt: { fontSize: 14, color: COLORS.textSubtle },
  verifTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  verifName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  verifEmail: { fontSize: 12, color: COLORS.textMuted },
  scorePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADII.pill },
  scoreTxt: { fontSize: 13, fontWeight: '800' },
  verifRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  verifLabel: { fontSize: 12, color: COLORS.textMuted },
  verifValue: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  verifActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: 4 },

  padronHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  padronCount: { fontSize: 30, fontWeight: '800', color: COLORS.text },
  padronLabel: { fontSize: 13, color: COLORS.textMuted },
  textArea: { minHeight: 110, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADII.md, padding: 14, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.surface, textAlignVertical: 'top' },
  input: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADII.md, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.surface },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  selChip: { borderRadius: RADII.pill, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.surfaceMuted, borderWidth: 1, borderColor: 'transparent' },
  selChipActive: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primary },
  selChipTxt: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, textTransform: 'capitalize' },
  selChipTxtActive: { color: COLORS.primary },
  annRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  annTopRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  annOrg: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  annTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },

  userRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  userName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  userMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
});

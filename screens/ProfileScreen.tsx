import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { WEEKLY_HIGHLIGHTS } from '@/constants/mock-unities';
import { useUser } from '@/contexts/UserContext';
import { usePermissions } from '@/hooks/use-permissions';
import type { WeeklyHighlightType } from '@/models/unities';
import { updateProfile } from '@/services/api/profiles';
import { uploadAvatar } from '@/services/api/storage';
import { isSupabaseConfigured } from '@/services/supabase';
import { formatCLP, hoursUntil } from '@/services/payments';
import {
  PAYMENT_STRIKES_FOR_BAN,
  getBlockedUntil,
  getPaymentBanRemainingMs,
  isPaymentBanned,
} from '@/services/penalties';
import { useAppState } from '@/store/appState';

const HIGHLIGHT_LABELS: Record<WeeklyHighlightType, string> = {
  evento: 'Evento',
  activacion: 'Activación',
  canjeable: 'Canje',
};

const formatDayCL = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(date);
};

export default function ProfileScreen() {
  const { currentUser, setCurrentUser, cars, updateCar, addCar, creditBalance, bookings, trips } =
    useAppState();
  const { isAuthenticated } = useUser();
  const permissions = usePermissions();
  const primaryCar = cars[0];

  const [nombre, setNombre] = useState(currentUser?.nombre ?? '');
  const [email, setEmail] = useState(currentUser?.email ?? '');
  const [universidad, setUniversidad] = useState(currentUser?.universidad ?? '');
  const [campus, setCampus] = useState(currentUser?.campus ?? '');
  const [fechaNacimiento, setFechaNacimiento] = useState(currentUser?.fechaNacimiento ?? '');
  const [modelo, setModelo] = useState(primaryCar?.modelo ?? '');
  const [anio, setAnio] = useState(primaryCar?.anio?.toString() ?? '');
  const [patente, setPatente] = useState(primaryCar?.patente ?? '');
  const [capacidad, setCapacidad] = useState(primaryCar?.capacidadAsientos?.toString() ?? '');
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);

  const now = new Date();
  const paymentPenalty = currentUser?.paymentPenalty;
  const paymentBanned = isPaymentBanned(paymentPenalty, now);
  const paymentBanHours = Math.ceil(getPaymentBanRemainingMs(paymentPenalty, now) / (1000 * 60 * 60));
  const cancelBlockedUntil = getBlockedUntil(currentUser?.penaltyState, now);

  useEffect(() => {
    setNombre(currentUser?.nombre ?? '');
    setEmail(currentUser?.email ?? '');
    setUniversidad(currentUser?.universidad ?? '');
    setCampus(currentUser?.campus ?? '');
    setFechaNacimiento(currentUser?.fechaNacimiento ?? '');
  }, [currentUser]);

  useEffect(() => {
    if (primaryCar) {
      setModelo(primaryCar.modelo);
      setAnio(primaryCar.anio.toString());
      setPatente(primaryCar.patente);
      setCapacidad(primaryCar.capacidadAsientos.toString());
    }
  }, [primaryCar]);

  const tripSummary = useMemo(() => {
    const active = bookings.filter((booking) => booking.estado !== 'cancelada');
    const porPagar = active.filter(
      (booking) => booking.pago.estado === 'pendiente' || booking.pago.estado === 'vencido'
    );
    const pagados = active.filter((booking) => booking.pago.estado === 'confirmado');
    const nextPending = [...porPagar].sort(
      (a, b) => new Date(a.pago.venceAt).getTime() - new Date(b.pago.venceAt).getTime()
    )[0];
    const nextPendingTrip = nextPending ? trips.find((trip) => trip.id === nextPending.tripId) : undefined;
    return {
      recientes: active.length,
      porPagar: porPagar.length,
      pagados: pagados.length,
      nextPending,
      nextPendingTrip,
    };
  }, [bookings, trips]);

  const weeklyHighlights = useMemo(() => {
    const nowMs = Date.now();
    const weekAhead = nowMs + 7 * 24 * 60 * 60 * 1000;
    return WEEKLY_HIGHLIGHTS.filter((highlight) => {
      const time = new Date(highlight.fecha).getTime();
      return time >= nowMs - 24 * 60 * 60 * 1000 && time <= weekAhead;
    }).sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
  }, []);

  const handlePickPhoto = async () => {
    if (!currentUser || isPickingPhoto) return;
    try {
      setIsPickingPhoto(true);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para cambiar la foto de perfil.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('Error', 'No pudimos obtener la imagen seleccionada.');
        return;
      }
      // Con sesión: sube al bucket privado `avatars` y guarda la ruta en el
      // profile; localmente se muestra la URL firmada. Sin sesión: URI local.
      if (isSupabaseConfigured && isAuthenticated) {
        try {
          const { path, signedUrl } = await uploadAvatar(currentUser.id, asset.uri);
          await updateProfile(currentUser.id, { avatar_url: path });
          setCurrentUser({ ...currentUser, urlFotoPerfil: signedUrl });
          return;
        } catch {
          Alert.alert(
            'Foto no sincronizada',
            'No pudimos subir tu foto a Unities; se mostrará solo en este dispositivo por ahora.'
          );
        }
      }
      setCurrentUser({ ...currentUser, urlFotoPerfil: asset.uri });
    } catch {
      Alert.alert('Error', 'No pudimos abrir tu galería. Intenta nuevamente.');
    } finally {
      setIsPickingPhoto(false);
    }
  };

  const handleVerifyCredential = () => {
    router.push({
      pathname: '/verify-profile',
      params: { name: nombre, email },
    });
  };

  const handlePayPending = () => {
    if (!tripSummary.nextPending) return;
    router.push({ pathname: '/payment', params: { bookingId: tripSummary.nextPending.id } });
  };

  const handleSave = () => {
    if (!currentUser) return;

    setCurrentUser({
      ...currentUser,
      nombre,
      email,
      universidad,
      campus,
      fechaNacimiento,
    });

    if (primaryCar) {
      updateCar(primaryCar.id, {
        modelo,
        anio: Number(anio) || primaryCar.anio,
        patente,
        capacidadAsientos: Number(capacidad) || primaryCar.capacidadAsientos,
      });
    } else {
      addCar({
        id: `car-${Date.now()}`,
        modelo,
        anio: Number(anio) || new Date().getFullYear(),
        patente,
        color: 'Sin especificar',
        capacidadAsientos: Number(capacidad) || 4,
      });
    }

    Alert.alert('Perfil actualizado');
  };

  const isVerified = currentUser?.credencialVerificada ?? false;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Perfil</Text>
            <Text style={styles.subtitle}>Tu cuenta, créditos y viajes en un solo lugar.</Text>
          </View>
          <TouchableOpacity style={styles.settingsLink} onPress={() => router.push('/settings')}>
            <Text style={styles.settingsLinkText}>Configuración</Text>
          </TouchableOpacity>
        </View>

        {permissions.isAdmin && (
          <TouchableOpacity style={styles.adminCard} onPress={() => router.push('/admin')}>
            <View style={styles.adminCardText}>
              <Text style={styles.adminCardTitle}>Panel de administración</Text>
              <Text style={styles.adminCardCaption}>
                Publica al feed, gestiona widgets, carpetas, marcas y canjeables.
              </Text>
            </View>
            <Text style={styles.adminCardChevron}>›</Text>
          </TouchableOpacity>
        )}

        {permissions.isTutor && (
          <TouchableOpacity style={styles.adminCard} onPress={() => router.push('/tutor-bots')}>
            <View style={styles.adminCardText}>
              <Text style={styles.adminCardTitle}>Bots de tutoría</Text>
              <Text style={styles.adminCardCaption}>
                Activa un bot de IA por asignatura que responda preguntas frecuentes por chat.
              </Text>
            </View>
            <Text style={styles.adminCardChevron}>›</Text>
          </TouchableOpacity>
        )}

        <View style={styles.card}>
          <View style={styles.avatarRow}>
            <TouchableOpacity onPress={handlePickPhoto} disabled={isPickingPhoto}>
              <View style={styles.avatarPlaceholder}>
                {currentUser?.urlFotoPerfil ? (
                  <Image source={{ uri: currentUser.urlFotoPerfil }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarInitials}>{nombre?.slice(0, 2).toUpperCase()}</Text>
                )}
              </View>
              <Text style={styles.avatarHint}>{isPickingPhoto ? 'Abriendo…' : 'Cambiar foto'}</Text>
            </TouchableOpacity>
            {isVerified ? (
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>Credencial verificada</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.statusPillPending} onPress={handleVerifyCredential}>
                <Text style={styles.statusPillPendingText}>Credencial pendiente · Verificar</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nombre completo</Text>
            <TextInput value={nombre} onChangeText={setNombre} style={styles.input} placeholder="Nombre" />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email institucional</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              placeholder="correo@alumnos.uai.cl"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.half]}>
              <Text style={styles.label}>Universidad</Text>
              <TextInput value={universidad} onChangeText={setUniversidad} style={styles.input} placeholder="UAI" />
            </View>
            <View style={[styles.inputGroup, styles.half]}>
              <Text style={styles.label}>Campus principal</Text>
              <TextInput value={campus} onChangeText={setCampus} style={styles.input} placeholder="Peñalolén" />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Fecha de nacimiento</Text>
            <TextInput
              value={fechaNacimiento}
              onChangeText={setFechaNacimiento}
              style={styles.input}
              placeholder="YYYY-MM-DD"
            />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Créditos Unities</Text>
            <Text style={styles.creditsValue}>{creditBalance.toLocaleString('es-CL')}</Text>
          </View>
          <Text style={styles.cardCaption}>
            Gana créditos pagando tus viajes a tiempo y manteniendo tu racha.
          </Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/credits')}>
              <Text style={styles.secondaryButtonText}>Ver movimientos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/redeem')}>
              <Text style={styles.secondaryButtonText}>Canjear</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.linkCard} onPress={() => router.push('/rewards')}>
          <View style={styles.linkCardText}>
            <Text style={styles.linkCardTitle}>Premios</Text>
            <Text style={styles.linkCardCaption}>
              Tu nivel, rachas y progreso por viajar con Unities.
            </Text>
          </View>
          <Text style={styles.adminCardChevron}>›</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mis viajes</Text>
          <View style={styles.summaryRow}>
            <SummaryStat label="Recientes" value={tripSummary.recientes} />
            <SummaryStat label="Por pagar" value={tripSummary.porPagar} highlight={tripSummary.porPagar > 0} />
            <SummaryStat label="Pagados" value={tripSummary.pagados} />
          </View>
          {tripSummary.nextPending ? (
            <TouchableOpacity style={styles.payPendingButton} onPress={handlePayPending}>
              <Text style={styles.payPendingText}>
                Pagar viaje pendiente · {formatCLP(tripSummary.nextPending.pago.totalCLP)}
              </Text>
              <Text style={styles.payPendingDeadline}>
                {tripSummary.nextPending.pago.estado === 'vencido'
                  ? 'Pago vencido: ya recibiste un strike'
                  : `Vence en ${hoursUntil(tripSummary.nextPending.pago.venceAt, now)} h`}
                {tripSummary.nextPendingTrip
                  ? ` · ${tripSummary.nextPendingTrip.origenCampus} → ${tripSummary.nextPendingTrip.destinoCampus}`
                  : ''}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.cardCaption}>No tienes pagos pendientes. ¡Racha a salvo!</Text>
          )}
        </View>

        <TouchableOpacity style={styles.earningsCard} onPress={() => router.push('/earnings')}>
          <View style={styles.earningsText}>
            <Text style={styles.earningsTitle}>Mis ganancias</Text>
            <Text style={styles.earningsCaption}>
              Bruto, comisión Unities y neto de tus viajes como conductor.
            </Text>
          </View>
          <Text style={styles.adminCardChevron}>›</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Penalizaciones</Text>
          <View style={styles.penaltyRow}>
            <Text style={styles.label}>Strikes por impago</Text>
            <Text style={styles.penaltyValue}>
              {paymentPenalty?.paymentStrikesCount ?? 0}/{PAYMENT_STRIKES_FOR_BAN}
            </Text>
          </View>
          <View style={styles.penaltyRow}>
            <Text style={styles.label}>Cancelaciones tardías</Text>
            <Text style={styles.penaltyValue}>{currentUser?.penaltyState.lateCancellationsCount ?? 0}</Text>
          </View>
          {paymentBanned && paymentPenalty?.paymentBanUntil ? (
            <Text style={styles.banText}>
              Baneado de los turnos por impago hasta el{' '}
              {new Date(paymentPenalty.paymentBanUntil).toLocaleString('es-CL')} (quedan ~{paymentBanHours} h).
            </Text>
          ) : cancelBlockedUntil ? (
            <Text style={styles.banText}>
              Bloqueado por cancelaciones tardías hasta el {cancelBlockedUntil.toLocaleString('es-CL')}.
            </Text>
          ) : (
            <Text style={styles.cardCaption}>
              Sin baneos activos. 3 strikes por impago = 2 días sin poder reservar.
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Esta semana en Unities</Text>
          {weeklyHighlights.length === 0 ? (
            <Text style={styles.cardCaption}>Sin novedades esta semana.</Text>
          ) : (
            weeklyHighlights.map((highlight) => (
              <TouchableOpacity
                key={highlight.id}
                style={styles.highlightRow}
                disabled={highlight.tipo !== 'canjeable'}
                onPress={() => router.push('/redeem')}
              >
                <View style={styles.highlightChip}>
                  <Text style={styles.highlightChipText}>{HIGHLIGHT_LABELS[highlight.tipo]}</Text>
                </View>
                <View style={styles.highlightInfo}>
                  <Text style={styles.highlightTitle}>{highlight.titulo}</Text>
                  <Text style={styles.highlightMeta}>
                    {formatDayCL(highlight.fecha)}
                    {highlight.lugar ? ` · ${highlight.lugar}` : ''}
                  </Text>
                  <Text style={styles.highlightDescription}>{highlight.descripcion}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Auto principal</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Modelo</Text>
            <TextInput value={modelo} onChangeText={setModelo} style={styles.input} placeholder="Mazda 3" />
          </View>
          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.half]}>
              <Text style={styles.label}>Año</Text>
              <TextInput value={anio} onChangeText={setAnio} style={styles.input} keyboardType="number-pad" />
            </View>
            <View style={[styles.inputGroup, styles.half]}>
              <Text style={styles.label}>Patente</Text>
              <TextInput value={patente} onChangeText={setPatente} style={styles.input} autoCapitalize="characters" />
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Capacidad de asientos</Text>
            <TextInput
              value={capacidad}
              onChangeText={setCapacidad}
              style={styles.input}
              keyboardType="number-pad"
            />
          </View>
        </View>

        <TouchableOpacity style={styles.linkCard} onPress={() => router.push('/support')}>
          <View style={styles.linkCardText}>
            <Text style={styles.linkCardTitle}>Ayuda / Soporte</Text>
            <Text style={styles.linkCardCaption}>
              Chatea con el equipo Unities: pagos, viajes, cuenta y más.
            </Text>
          </View>
          <Text style={styles.adminCardChevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.primaryButton} onPress={handleSave}>
          <Text style={styles.primaryText}>Guardar cambios</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <View style={[styles.summaryStat, highlight && styles.summaryStatHighlight]}>
      <Text style={[styles.summaryValue, highlight && styles.summaryValueHighlight]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#E2E8F0',
  },
  subtitle: {
    color: '#94A3B8',
    marginBottom: 8,
  },
  settingsLink: {
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#111827',
  },
  settingsLinkText: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  adminCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  adminCardText: { flex: 1, gap: 3 },
  adminCardTitle: { color: '#38BDF8', fontWeight: '800', fontSize: 15 },
  adminCardCaption: { color: '#94A3B8', fontSize: 12, lineHeight: 17 },
  adminCardChevron: { color: '#38BDF8', fontSize: 26, fontWeight: '600' },
  earningsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  earningsText: { flex: 1, gap: 3 },
  earningsTitle: { color: '#4ade80', fontWeight: '800', fontSize: 15 },
  earningsCaption: { color: '#94A3B8', fontSize: 12, lineHeight: 17 },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  linkCardText: { flex: 1, gap: 3 },
  linkCardTitle: { color: '#38BDF8', fontWeight: '800', fontSize: 15 },
  linkCardCaption: { color: '#94A3B8', fontSize: 12, lineHeight: 17 },
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 12,
  },
  cardTitle: {
    color: '#E2E8F0',
    fontWeight: '700',
    fontSize: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  creditsValue: {
    color: '#38BDF8',
    fontWeight: '800',
    fontSize: 22,
  },
  cardCaption: {
    color: '#94A3B8',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 16,
  },
  avatarInitials: {
    color: '#E2E8F0',
    fontWeight: '800',
    fontSize: 18,
  },
  avatarHint: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  statusPill: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusPillText: {
    color: '#052E16',
    fontWeight: '700',
  },
  statusPillPending: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    flexShrink: 1,
  },
  statusPillPendingText: {
    color: '#F59E0B',
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#0EA5E9',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryStat: {
    flex: 1,
    backgroundColor: '#0B1220',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 12,
    alignItems: 'center',
    gap: 2,
  },
  summaryStatHighlight: {
    borderColor: '#F59E0B',
  },
  summaryValue: {
    color: '#E2E8F0',
    fontWeight: '800',
    fontSize: 20,
  },
  summaryValueHighlight: {
    color: '#F59E0B',
  },
  summaryLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  payPendingButton: {
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    padding: 12,
    gap: 2,
  },
  payPendingText: {
    color: '#0B1220',
    fontWeight: '800',
  },
  payPendingDeadline: {
    color: '#78350F',
    fontSize: 12,
    fontWeight: '600',
  },
  penaltyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  penaltyValue: {
    color: '#E2E8F0',
    fontWeight: '800',
    fontSize: 16,
  },
  banText: {
    color: '#FCA5A5',
    fontWeight: '600',
  },
  highlightRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  highlightChip: {
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#0EA5E9',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  highlightChipText: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 11,
  },
  highlightInfo: {
    flex: 1,
    gap: 2,
  },
  highlightTitle: {
    color: '#E2E8F0',
    fontWeight: '700',
  },
  highlightMeta: {
    color: '#38BDF8',
    fontSize: 12,
  },
  highlightDescription: {
    color: '#94A3B8',
    fontSize: 13,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#0B1220',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#E2E8F0',
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  half: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: '#0EA5E9',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  primaryText: {
    color: '#0B1220',
    fontWeight: '800',
  },
});

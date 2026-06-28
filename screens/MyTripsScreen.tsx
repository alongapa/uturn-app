import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useUser } from '@/contexts/UserContext';
import { useAppState } from '@/store/appState';
import { COLORS, RADII, SPACING, TYPE } from '@/constants/designSystem';
import { Card } from '@/components/ui/Card';

const STATUS = {
  reserved: { bg: COLORS.primarySoft, text: COLORS.primaryDark, label: 'Confirmado' },
  cancelled: { bg: COLORS.dangerSoft, text: COLORS.danger, label: 'Cancelado' },
  completed: { bg: COLORS.successSoft, text: COLORS.success, label: 'Completado' },
};

export default function MyTripsScreen() {
  const { user } = useUser();
  const { state, dispatch } = useAppState();
  const [tab, setTab] = useState<'pasajero' | 'conductor'>('pasajero');

  const passengerBookings = state.bookings.filter((b) => b.passengerId === user?.id);
  const driverTrips = state.trips.filter((t) => t.driverId === user?.id);

  function handleCancel(bookingId: string) {
    Alert.alert('Cancelar reserva', '¿Estás seguro?', [
      { text: 'No', style: 'cancel' },
      { text: 'Sí, cancelar', style: 'destructive', onPress: () => dispatch({ type: 'UPDATE_BOOKING_STATUS', payload: { id: bookingId, status: 'cancelled' } }) },
    ]);
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={TYPE.display}>Mis viajes</Text>
        <View style={s.tabs}>
          {(['pasajero', 'conductor'] as const).map((t) => (
            <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
              <Text style={[s.tabTxt, tab === t && s.tabTxtActive]}>{t === 'pasajero' ? 'Pasajero' : 'Conductor'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {tab === 'pasajero' ? (
        <FlatList
          data={passengerBookings}
          keyExtractor={(b) => b.id}
          contentContainerStyle={s.list}
          ListEmptyComponent={<EmptyState msg="Aún no tienes reservas como pasajero" />}
          renderItem={({ item }) => {
            const trip = state.trips.find((t) => t.id === item.tripId);
            const st = STATUS[item.status];
            return (
              <Card style={{ gap: SPACING.md }}>
                <View style={s.cardTop}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={s.route}>{trip?.meetPoint ?? '—'} → {trip?.dest ?? '—'}</Text>
                    <Text style={s.driver}>con {trip?.driverName ?? '—'}</Text>
                    {trip && (
                      <Text style={s.time}>
                        {new Date(trip.departAt).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    )}
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                    <Text style={[s.statusTxt, { color: st.text }]}>{st.label}</Text>
                  </View>
                </View>
                {trip && <Text style={s.price}>${trip.price.toLocaleString('es-CL')}</Text>}
                {item.status === 'reserved' && (
                  <TouchableOpacity style={s.cancelBtn} onPress={() => handleCancel(item.id)}>
                    <Ionicons name="close-circle-outline" size={16} color={COLORS.danger} />
                    <Text style={s.cancelTxt}>Cancelar reserva</Text>
                  </TouchableOpacity>
                )}
              </Card>
            );
          }}
        />
      ) : (
        <FlatList
          data={driverTrips}
          keyExtractor={(t) => t.id}
          contentContainerStyle={s.list}
          ListEmptyComponent={<EmptyState msg="Aún no has publicado viajes como conductor" />}
          renderItem={({ item }) => {
            const bookedSeats = state.bookings.filter((b) => b.tripId === item.id && b.status === 'reserved').length;
            const st = item.status === 'completed' ? STATUS.completed : item.status === 'cancelled' ? STATUS.cancelled : STATUS.reserved;
            return (
              <Card style={{ gap: SPACING.md }}>
                <View style={s.cardTop}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={s.route}>{item.meetPoint} → {item.dest}</Text>
                    <Text style={s.time}>
                      {new Date(item.departAt).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Text style={s.seats}>{bookedSeats}/{item.seats} asientos ocupados</Text>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                    <Text style={[s.statusTxt, { color: st.text }]}>{st.label}</Text>
                  </View>
                </View>
                <Text style={s.price}>${item.price.toLocaleString('es-CL')} / pasajero</Text>
              </Card>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <View style={s.empty}>
      <Ionicons name="car-outline" size={44} color={COLORS.textSubtle} />
      <Text style={s.emptyTxt}>{msg}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: { padding: SPACING.xl, gap: SPACING.md },
  tabs: { flexDirection: 'row', backgroundColor: COLORS.surfaceMuted, borderRadius: RADII.md, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: RADII.sm },
  tabActive: { backgroundColor: COLORS.surface },
  tabTxt: { fontSize: 14, fontWeight: '600', color: COLORS.textMuted },
  tabTxtActive: { color: COLORS.text },
  list: { paddingHorizontal: SPACING.xl, paddingBottom: 24, gap: SPACING.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  route: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  driver: { fontSize: 13, color: COLORS.textMuted },
  time: { fontSize: 12, color: COLORS.textMuted },
  seats: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADII.sm },
  statusTxt: { fontSize: 12, fontWeight: '700' },
  price: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: COLORS.danger, borderRadius: RADII.sm, paddingVertical: 11 },
  cancelTxt: { fontSize: 13, fontWeight: '700', color: COLORS.danger },
  empty: { alignItems: 'center', paddingTop: 60, gap: SPACING.md },
  emptyTxt: { fontSize: 15, color: COLORS.textMuted, textAlign: 'center' },
});

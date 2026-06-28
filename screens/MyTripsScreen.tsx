import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useUser } from '@/contexts/UserContext';
import { useAppState } from '@/store/appState';

const STATUS_COLORS = {
  reserved: { bg: '#EFF6FF', text: '#1D4ED8', label: 'Confirmado' },
  cancelled: { bg: '#FEF2F2', text: '#DC2626', label: 'Cancelado' },
  completed: { bg: '#F0FDF4', text: '#15803D', label: 'Completado' },
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
      {
        text: 'Sí, cancelar', style: 'destructive',
        onPress: () => dispatch({ type: 'UPDATE_BOOKING_STATUS', payload: { id: bookingId, status: 'cancelled' } }),
      },
    ]);
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>Mis viajes</Text>
        <View style={s.tabs}>
          <TouchableOpacity style={[s.tab, tab === 'pasajero' && s.tabActive]} onPress={() => setTab('pasajero')}>
            <Text style={[s.tabTxt, tab === 'pasajero' && s.tabTxtActive]}>Pasajero</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tab, tab === 'conductor' && s.tabActive]} onPress={() => setTab('conductor')}>
            <Text style={[s.tabTxt, tab === 'conductor' && s.tabTxtActive]}>Conductor</Text>
          </TouchableOpacity>
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
            const st = STATUS_COLORS[item.status];
            return (
              <View style={s.card}>
                <View style={s.cardTop}>
                  <View style={s.routeInfo}>
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
                {trip && (
                  <Text style={s.price}>${trip.price.toLocaleString('es-CL')}</Text>
                )}
                {item.status === 'reserved' && (
                  <TouchableOpacity style={s.cancelBtn} onPress={() => handleCancel(item.id)}>
                    <Text style={s.cancelTxt}>Cancelar reserva</Text>
                  </TouchableOpacity>
                )}
              </View>
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
            const st = item.status === 'completed'
              ? STATUS_COLORS.completed
              : item.status === 'cancelled'
              ? STATUS_COLORS.cancelled
              : STATUS_COLORS.reserved;
            return (
              <View style={s.card}>
                <View style={s.cardTop}>
                  <View style={s.routeInfo}>
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
              </View>
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
      <Text style={s.emptyIcon}>🚗</Text>
      <Text style={s.emptyTxt}>{msg}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { padding: 20, gap: 14 },
  title: { fontSize: 26, fontWeight: '800', color: '#0A1525' },
  tabs: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  tabTxt: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  tabTxtActive: { color: '#0A1525' },
  list: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  routeInfo: { flex: 1, gap: 4 },
  route: { fontSize: 15, fontWeight: '700', color: '#0A1525' },
  driver: { fontSize: 13, color: '#64748B' },
  time: { fontSize: 12, color: '#64748B' },
  seats: { fontSize: 12, color: '#246BFD', fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusTxt: { fontSize: 12, fontWeight: '700' },
  price: { fontSize: 16, fontWeight: '800', color: '#246BFD' },
  cancelBtn: { borderWidth: 1, borderColor: '#DC2626', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  cancelTxt: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyTxt: { fontSize: 15, color: '#64748B', textAlign: 'center' },
});

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type UserProfile = {
  id: string;
  nombre: string;
  email: string;
  universidad: string;
  campus: string;
  fechaNacimiento: string;
  urlFotoPerfil?: string;
  lateCancellationsCount: number;
  lastLateCancellationAt: Date | null;
  blockedUntil: Date | null;
};

export type Car = {
  id: string;
  modelo: string;
  año: number;
  patente: string;
  color: string;
  capacidadAsientos: number;
};

export type Trip = {
  id: string;
  driverId: string;
  origenCampus: string;
  destinoCampus: string;
  puntoEncuentroId: string;
  horaSalida: string;
  precioCLP: number;
  asientosDisponibles: number;
  asientosOcupados: number;
  coordenadasOrigen: Coordinates;
  coordenadasDestino: Coordinates;
};

export type Booking = {
  id: string;
  tripId: string;
  passengerId: string;
  estado: 'pendiente' | 'confirmada' | 'cancelada';
  createdAt: string;
};

type AppState = {
  currentUser: UserProfile | null;
  setCurrentUser: (user: UserProfile | null) => void;
  cars: Car[];
  addCar: (car: Car) => void;
  updateCar: (carId: string, updated: Partial<Car>) => void;
  removeCar: (carId: string) => void;
  trips: Trip[];
  addTrip: (trip: Omit<Trip, 'id' | 'asientosOcupados'> & { asientosOcupados?: number }) => Trip;
  updateTrip: (tripId: string, updated: Partial<Trip>) => void;
  cancelTrip: (tripId: string) => void;
  bookings: Booking[];
  addBooking: (booking: Omit<Booking, 'id' | 'estado' | 'createdAt'> & { estado?: Booking['estado']; createdAt?: string }) => Booking;
  updateBooking: (bookingId: string, updated: Partial<Booking>) => void;
  canUserBookOrCancel: (user: UserProfile | null, now: Date) => { allowed: boolean; reason?: string };
  cancelBooking: (bookingId: string, now: Date) => { success: boolean; reason?: string };
  rewardSummary: RewardSummary;
};

export type RewardSummary = {
  totalPoints: number;
  currentLevel: 'Bronce' | 'Plata' | 'Oro' | 'Platino';
  nextLevel: 'Plata' | 'Oro' | 'Platino' | null;
  pointsToNext: number | null;
  stats: {
    completedTrips: number;
    averageRating: number;
    punctuality: number;
    monthsActive: number;
    totalTrips: number;
    cancellations: number;
  };
  badgesUnlocked: { title: string; description: string }[];
  badgesLocked: { title: string; description: string }[];
  earnRules: { title: string; value: string }[];
};

const AppStateContext = createContext<AppState | undefined>(undefined);

const mockTrips: Trip[] = [
  {
    id: 'trip-1',
    driverId: 'driver-1',
    origenCampus: 'Campus Peñalolén',
    destinoCampus: 'Providencia',
    puntoEncuentroId: 'mp-1',
    horaSalida: new Date().toISOString(),
    precioCLP: 2500,
    asientosDisponibles: 3,
    asientosOcupados: 1,
    coordenadasOrigen: { latitude: -33.489, longitude: -70.497 },
    coordenadasDestino: { latitude: -33.4329, longitude: -70.63 },
  },
  {
    id: 'trip-2',
    driverId: 'driver-2',
    origenCampus: 'Campus San Carlos',
    destinoCampus: 'La Reina',
    puntoEncuentroId: 'mp-2',
    horaSalida: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    precioCLP: 2200,
    asientosDisponibles: 2,
    asientosOcupados: 2,
    coordenadasOrigen: { latitude: -33.4248, longitude: -70.5133 },
    coordenadasDestino: { latitude: -33.441, longitude: -70.546 },
  },
];

const mockBookings: Booking[] = [
  {
    id: 'booking-1',
    tripId: 'trip-1',
    passengerId: 'user-1',
    estado: 'confirmada',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'booking-2',
    tripId: 'trip-2',
    passengerId: 'user-1',
    estado: 'pendiente',
    createdAt: new Date().toISOString(),
  },
];

const initialUser: UserProfile = {
  id: 'user-1',
  nombre: 'Estudiante UTURN',
  email: 'estudiante@alumnos.uai.cl',
  universidad: 'UAI',
  campus: 'Peñalolén',
  fechaNacimiento: '2000-01-01',
  urlFotoPerfil: undefined,
  lateCancellationsCount: 0,
  lastLateCancellationAt: null,
  blockedUntil: null,
};

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(initialUser);
  const [cars, setCars] = useState<Car[]>([
    {
      id: 'car-1',
      modelo: 'Mazda 3',
      año: 2021,
      patente: 'UT-URN1',
      color: 'Azul',
      capacidadAsientos: 4,
    },
  ]);
  const [trips, setTrips] = useState<Trip[]>(mockTrips);
  const [bookings, setBookings] = useState<Booking[]>(mockBookings);

  const addCar = useCallback((car: Car) => {
    setCars((prev) => [...prev, car]);
  }, []);

  const updateCar = useCallback((carId: string, updated: Partial<Car>) => {
    setCars((prev) => prev.map((car) => (car.id === carId ? { ...car, ...updated } : car)));
  }, []);

  const removeCar = useCallback((carId: string) => {
    setCars((prev) => prev.filter((car) => car.id !== carId));
  }, []);

  const addTrip = useCallback(
    (trip: Omit<Trip, 'id' | 'asientosOcupados'> & { asientosOcupados?: number }): Trip => {
      const newTrip: Trip = {
        ...trip,
        id: `trip-${Date.now()}`,
        asientosOcupados: trip.asientosOcupados ?? 0,
      };
      setTrips((prev) => [newTrip, ...prev]);
      return newTrip;
    },
    []
  );

  const updateTrip = useCallback((tripId: string, updated: Partial<Trip>) => {
    setTrips((prev) => prev.map((trip) => (trip.id === tripId ? { ...trip, ...updated } : trip)));
  }, []);

  const cancelTrip = useCallback((tripId: string) => {
    setTrips((prev) =>
      prev.map((trip) =>
        trip.id === tripId
          ? {
              ...trip,
              asientosDisponibles: 0,
              asientosOcupados: 0,
            }
          : trip
      )
    );
  }, []);

  const addBooking = useCallback(
    (
      booking: Omit<Booking, 'id' | 'estado' | 'createdAt'> & {
        estado?: Booking['estado'];
        createdAt?: string;
      }
    ): Booking => {
      const newBooking: Booking = {
        ...booking,
        id: `booking-${Date.now()}`,
        estado: booking.estado ?? 'pendiente',
        createdAt: booking.createdAt ?? new Date().toISOString(),
      };
      setBookings((prev) => [newBooking, ...prev]);
      return newBooking;
    },
    []
  );

  const updateBooking = useCallback((bookingId: string, updated: Partial<Booking>) => {
    setBookings((prev) => prev.map((booking) => (booking.id === bookingId ? { ...booking, ...updated } : booking)));
  }, []);

  const canUserBookOrCancel = useCallback((user: UserProfile | null, now: Date) => {
    if (!user) {
      return { allowed: false, reason: 'Debes iniciar sesión para continuar' };
    }

    const blockedUntil = user.blockedUntil ? new Date(user.blockedUntil) : null;
    if (blockedUntil && blockedUntil > now) {
      return {
        allowed: false,
        reason: `Usuario bloqueado hasta ${blockedUntil.toLocaleString('es-CL')}`,
      };
    }

    if (user.lastLateCancellationAt) {
      const daysSinceLastLate =
        (now.getTime() - new Date(user.lastLateCancellationAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastLate >= 30 && user.lateCancellationsCount > 0) {
        setCurrentUser({ ...user, lateCancellationsCount: 0, lastLateCancellationAt: null });
      }
    }

    return { allowed: true };
  }, [setCurrentUser]);

  const cancelBooking = useCallback(
    (bookingId: string, now: Date) => {
      const booking = bookings.find((b) => b.id === bookingId);
      if (!booking) {
        return { success: false, reason: 'Reserva no encontrada' };
      }

      const trip = trips.find((t) => t.id === booking.tripId);
      if (!trip) {
        return { success: false, reason: 'Viaje no encontrado' };
      }

      const user = currentUser;
      const canProceed = canUserBookOrCancel(user, now);
      if (!canProceed.allowed) {
        return { success: false, reason: canProceed.reason };
      }

      const departure = new Date(trip.horaSalida);
      const hour = departure.getHours();
      const isMorningArrival = hour >= 8 && hour < 10;
      const freeWindowHours = isMorningArrival ? 12 : 2;
      const diffHours = (departure.getTime() - now.getTime()) / (1000 * 60 * 60);
      const isLate = diffHours < freeWindowHours;

      setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, estado: 'cancelada' } : b)));

      if (!isLate || !user) {
        return { success: true };
      }

      setCurrentUser((prev) => {
        if (!prev) return prev;

        let count = prev.lateCancellationsCount;
        if (prev.lastLateCancellationAt) {
          const days = (now.getTime() - new Date(prev.lastLateCancellationAt).getTime()) / (1000 * 60 * 60 * 24);
          if (days >= 30) {
            count = 0;
          }
        }

        const newCount = count + 1;
        let blockedUntil: Date | null = prev.blockedUntil ? new Date(prev.blockedUntil) : null;

        if (newCount % 3 === 0) {
          const blockIndex = newCount / 3;
          if (blockIndex === 1) {
            blockedUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          } else if (blockIndex === 2) {
            blockedUntil = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
          } else if (blockIndex >= 3) {
            blockedUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          }
        }

        return {
          ...prev,
          lateCancellationsCount: newCount,
          lastLateCancellationAt: now,
          blockedUntil,
        };
      });

      return { success: true, reason: isLate ? 'Cancelación tardía registrada' : undefined };
    },
    [bookings, trips, currentUser, canUserBookOrCancel]
  );

  const rewardSummary = useMemo<RewardSummary>(() => {
    const completedTrips = bookings.filter((b) => b.estado === 'confirmada').length;
    const totalTrips = bookings.length + trips.filter((t) => t.driverId === currentUser?.id).length;
    const cancellations = bookings.filter((b) => b.estado === 'cancelada').length;
    const totalPoints = completedTrips * 2 + Math.max(0, 10 - cancellations * 5);

    let currentLevel: RewardSummary['currentLevel'] = 'Bronce';
    let nextLevel: RewardSummary['nextLevel'] = 'Plata';
    let pointsToNext: number | null = 50 - totalPoints;

    if (totalPoints >= 200) {
      currentLevel = 'Platino';
      nextLevel = null;
      pointsToNext = null;
    } else if (totalPoints >= 120) {
      currentLevel = 'Oro';
      nextLevel = 'Platino';
      pointsToNext = 200 - totalPoints;
    } else if (totalPoints >= 60) {
      currentLevel = 'Plata';
      nextLevel = 'Oro';
      pointsToNext = 120 - totalPoints;
    }

    return {
      totalPoints,
      currentLevel,
      nextLevel,
      pointsToNext,
      stats: {
        completedTrips,
        averageRating: 4.8,
        punctuality: 95,
        monthsActive: 6,
        totalTrips,
        cancellations,
      },
      badgesUnlocked: [
        { title: 'Conductor confiable', description: '10+ viajes completados sin cancelaciones.' },
        { title: 'Siempre puntual', description: 'Puntualidad mayor al 90%.' },
      ],
      badgesLocked: [
        { title: 'Veterano U-TURN', description: '100+ viajes completados.' },
        { title: 'Cero cancelaciones', description: '20 viajes seguidos sin cancelar.' },
      ],
      earnRules: [
        { title: 'Completar un viaje', value: '+2 puntos' },
        { title: 'Calificación 5 estrellas', value: '+4 puntos' },
        { title: 'Cada mes activo', value: '+5 puntos' },
        { title: 'Ser puntual', value: '+0.5 puntos' },
        { title: 'Cancelar un viaje', value: '−5 puntos' },
      ],
    };
  }, [bookings, trips, currentUser?.id]);

  const value = useMemo(
    () => ({
      currentUser,
      setCurrentUser,
      cars,
      addCar,
      updateCar,
      removeCar,
      trips,
      addTrip,
      updateTrip,
      cancelTrip,
      bookings,
      addBooking,
      updateBooking,
      canUserBookOrCancel,
      cancelBooking,
      rewardSummary,
    }),
    [
      currentUser,
      cars,
      trips,
      bookings,
      addCar,
      updateCar,
      removeCar,
      addTrip,
      updateTrip,
      cancelTrip,
      addBooking,
      updateBooking,
      canUserBookOrCancel,
      cancelBooking,
      rewardSummary,
    ]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState debe usarse dentro de AppStateProvider');
  }
  return context;
}

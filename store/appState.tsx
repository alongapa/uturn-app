import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { CampusId } from '@/constants/campuses';
import { CAMPUSES, getCampusById, getMeetingPointById } from '@/constants/campuses';
import type { PenaltyState } from '@/models/types';
import {
  EMPTY_PENALTY_STATE,
  applyLateCancellation,
  getBlockedUntil,
  resetExpiredPenalties,
} from '@/services/penalties';

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
  penaltyState: PenaltyState;
};

export type Car = {
  id: string;
  modelo: string;
  anio: number;
  patente: string;
  color: string;
  capacidadAsientos: number;
};

export type Trip = {
  id: string;
  driverId: string;
  driverReputation?: number;
  origenCampus: string;
  destinoCampus: string;
  origenCampusId?: CampusId;
  destinoCampusId?: CampusId;
  puntoEncuentroId?: string;
  horaSalida: string;
  precioCLP: number;
  asientosDisponibles: number;
  asientosOcupados: number;
  coordenadasOrigen: Coordinates;
  coordenadasDestino: Coordinates;
  meetingPointCoords?: Coordinates | null;
  routePolyline?: Coordinates[];
};

export type Booking = {
  id: string;
  tripId: string;
  passengerId: string;
  estado: 'pendiente' | 'confirmada' | 'cancelada';
  createdAt: string;
};

type RewardBadge = {
  title: string;
  description: string;
};

type RewardSummary = {
  currentLevel: number;
  totalPoints: number;
  nextLevel: number | null;
  pointsToNext: number | null;
  progressToNext: number;
  stats: {
    completedTrips: number;
    averageRating: number;
    punctuality: number;
    monthsActive: number;
    totalTrips: number;
    cancellations: number;
  };
  badgesUnlocked: RewardBadge[];
  badgesLocked: RewardBadge[];
  earnRules: { title: string; value: string }[];
};

type Notification = {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'action';
  targetUserId?: string;
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
  addTrip: (
    trip: Omit<Trip, 'id' | 'asientosOcupados' | 'routePolyline'> & { asientosOcupados?: number }
  ) => Trip;
  updateTrip: (tripId: string, updated: Partial<Trip>) => void;
  cancelTrip: (tripId: string) => void;
  bookings: Booking[];
  addBooking: (booking: Omit<Booking, 'id' | 'estado' | 'createdAt'> & { estado?: Booking['estado']; createdAt?: string }) => Booking;
  updateBooking: (bookingId: string, updated: Partial<Booking>) => void;
  canUserBookOrCancel: (user: UserProfile | null, now: Date) => { allowed: boolean; reason?: string };
  cancelBooking: (bookingId: string, now: Date) => { success: boolean; reason?: string };
  rewardSummary: RewardSummary;
  setRewardSummary: React.Dispatch<React.SetStateAction<RewardSummary>>;
  addRewardPoints: (points: number) => void;
  notifications: Notification[];
  pushNotification: (payload: Omit<Notification, 'id' | 'createdAt'>) => Notification;
};

const AppStateContext = createContext<AppState | undefined>(undefined);

const LEVEL_THRESHOLDS = [0, 500, 1200, 2000, 3000];

function computeLevel(points: number) {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i += 1) {
    if (points >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
    }
  }
  const currentThreshold = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const nextThreshold = LEVEL_THRESHOLDS[level] ?? null;
  const pointsToNext = nextThreshold ? Math.max(0, nextThreshold - points) : null;
  const progressToNext = nextThreshold
    ? Math.min(1, Math.max(0, (points - currentThreshold) / (nextThreshold - currentThreshold)))
    : 1;
  return {
    currentLevel: level,
    nextLevel: nextThreshold ? level + 1 : null,
    pointsToNext,
    progressToNext,
  };
}

const buildPolyline = (from: Coordinates, meeting: Coordinates | null | undefined, to: Coordinates) => {
  const points: Coordinates[] = [from];
  if (meeting) {
    points.push(meeting);
  }
  points.push(to);
  return points;
};

const campus = (id: CampusId) => getCampusById(id)!;

const meeting = (id?: string) => {
  const point = id ? getMeetingPointById(id) : undefined;
  return point ? { latitude: point.latitude, longitude: point.longitude } : null;
};

const baseTrips: Trip[] = [
  {
    id: 'trip-1',
    driverId: 'driver-1',
    driverReputation: 4.8,
    origenCampus: 'Campus Peñalolén',
    destinoCampus: 'Campus San Carlos de Apoquindo',
    origenCampusId: 'uai-penalolen',
    destinoCampusId: 'uandes-san-carlos',
    puntoEncuentroId: 'mp-uai-pen-entradaprin',
    horaSalida: new Date().toISOString(),
    precioCLP: 2500,
    asientosDisponibles: 3,
    asientosOcupados: 1,
    coordenadasOrigen: { latitude: campus('uai-penalolen').latitude, longitude: campus('uai-penalolen').longitude },
    coordenadasDestino: { latitude: campus('uandes-san-carlos').latitude, longitude: campus('uandes-san-carlos').longitude },
    meetingPointCoords: meeting('mp-uai-pen-entradaprin'),
  },
  {
    id: 'trip-2',
    driverId: 'driver-2',
    driverReputation: 4.5,
    origenCampus: 'Campus Peñalolén',
    destinoCampus: 'Campus Las Condes',
    origenCampusId: 'uai-penalolen',
    destinoCampusId: 'udd-las-condes',
    puntoEncuentroId: 'mp-udd-las-principal',
    horaSalida: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    precioCLP: 2200,
    asientosDisponibles: 2,
    asientosOcupados: 2,
    coordenadasOrigen: { latitude: campus('uai-penalolen').latitude, longitude: campus('uai-penalolen').longitude },
    coordenadasDestino: { latitude: campus('udd-las-condes').latitude, longitude: campus('udd-las-condes').longitude },
    meetingPointCoords: meeting('mp-udd-las-principal'),
  },
];

const mockTrips: Trip[] = baseTrips.map((trip) => ({
  ...trip,
  routePolyline: buildPolyline(trip.coordenadasOrigen, trip.meetingPointCoords, trip.coordenadasDestino),
}));

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
  penaltyState: EMPTY_PENALTY_STATE,
};

const buildRewardSummary = (points: number): RewardSummary => {
  const levelInfo = computeLevel(points);
  return {
    ...levelInfo,
    totalPoints: points,
    stats: {
      completedTrips: 42,
      averageRating: 4.8,
      punctuality: 96,
      monthsActive: 8,
      totalTrips: 45,
      cancellations: 3,
    },
    badgesUnlocked: [
      { title: 'Puntual', description: 'Llegaste a tiempo a 10 viajes seguidos' },
      { title: 'Comunidad', description: 'Compartiste 20 viajes' },
    ],
    badgesLocked: [
      { title: 'Experto', description: 'Completa 60 viajes' },
      { title: 'Estrella', description: 'Mantén 5.0 estrellas por 2 meses' },
    ],
    earnRules: [
      { title: 'Completar viaje', value: '+2 pts' },
      { title: 'Calificación 5 estrellas', value: '+4 pts' },
      { title: 'Mes activo', value: '+5 pts' },
      { title: 'Puntualidad', value: '+0.5 pts' },
      { title: 'Cancelar viaje', value: '-5 pts' },
    ],
  };
};

const initialRewardSummary: RewardSummary = buildRewardSummary(1850);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(initialUser);
  const [cars, setCars] = useState<Car[]>([
    {
      id: 'car-1',
      modelo: 'Mazda 3',
      anio: 2021,
      patente: 'UT-URN1',
      color: 'Azul',
      capacidadAsientos: 4,
    },
  ]);
  const [trips, setTrips] = useState<Trip[]>(mockTrips);
  const [bookings, setBookings] = useState<Booking[]>(mockBookings);
  const [rewardSummary, setRewardSummary] = useState<RewardSummary>(initialRewardSummary);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addCar = useCallback((car: Car) => {
    setCars((prev) => [...prev, car]);
  }, []);

  const updateCar = useCallback((carId: string, updated: Partial<Car>) => {
    setCars((prev) => prev.map((car) => (car.id === carId ? { ...car, ...updated } : car)));
  }, []);

  const removeCar = useCallback((carId: string) => {
    setCars((prev) => prev.filter((car) => car.id !== carId));
  }, []);

  const pushNotification = useCallback((payload: Omit<Notification, 'id' | 'createdAt'>) => {
    const notification: Notification = {
      ...payload,
      id: `notif-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setNotifications((prev) => [notification, ...prev].slice(0, 50));
    return notification;
  }, []);

  const addTrip = useCallback(
    (
      trip: Omit<Trip, 'id' | 'asientosOcupados' | 'routePolyline'> & {
        asientosOcupados?: number;
      }
    ): Trip => {
      const meetingFromId = trip.puntoEncuentroId ? meeting(trip.puntoEncuentroId) : null;
      const meetingCoords = trip.meetingPointCoords ?? meetingFromId ?? null;
      const routePolyline = buildPolyline(trip.coordenadasOrigen, meetingCoords, trip.coordenadasDestino);
      const newTrip: Trip = {
        ...trip,
        id: `trip-${Date.now()}`,
        asientosOcupados: trip.asientosOcupados ?? 0,
        meetingPointCoords: meetingCoords ?? undefined,
        routePolyline,
      };
      setTrips((prev) => [newTrip, ...prev]);
      pushNotification({
        message: 'Se publicó un nuevo viaje',
        type: 'action',
      });
      return newTrip;
    },
    [pushNotification]
  );

  const updateTrip = useCallback((tripId: string, updated: Partial<Trip>) => {
    setTrips((prev) =>
      prev.map((trip) => {
        if (trip.id !== tripId) return trip;
        const next = { ...trip, ...updated };
        const meetingPoint =
          next.meetingPointCoords ??
          (next.puntoEncuentroId ? meeting(next.puntoEncuentroId) : undefined) ??
          null;
        next.meetingPointCoords = meetingPoint ?? null;
        next.routePolyline = buildPolyline(next.coordenadasOrigen, next.meetingPointCoords, next.coordenadasDestino);
        return next;
      })
    );
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

  const canUserBookOrCancel = useCallback(
    (user: UserProfile | null, now: Date) => {
      if (!user) {
        return { allowed: false, reason: 'Debes iniciar sesión para continuar' };
      }

      const blockedUntil = getBlockedUntil(user.penaltyState, now);
      if (blockedUntil) {
        return {
          allowed: false,
          reason: `Usuario bloqueado hasta ${blockedUntil.toLocaleString('es-CL')}`,
        };
      }

      const refreshedPenaltyState = resetExpiredPenalties(user.penaltyState, now);
      if (refreshedPenaltyState !== user.penaltyState) {
        setCurrentUser({ ...user, penaltyState: refreshedPenaltyState });
      }

      return { allowed: true };
    },
    []
  );

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

        return {
          ...prev,
          penaltyState: applyLateCancellation(prev.penaltyState, now),
        };
      });

      pushNotification({
        message: 'Un pasajero canceló un viaje',
        type: 'warning',
        targetUserId: trip.driverId,
      });

      return { success: true, reason: isLate ? 'Cancelación tardía registrada' : undefined };
    },
    [bookings, trips, currentUser, canUserBookOrCancel, pushNotification]
  );

  const addRewardPoints = useCallback((points: number) => {
    setRewardSummary((prev) => {
      const totalPoints = Math.max(0, prev.totalPoints + points);
      const levelInfo = computeLevel(totalPoints);
      return { ...prev, ...levelInfo, totalPoints };
    });
  }, []);

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
      setRewardSummary,
      addRewardPoints,
      notifications,
      pushNotification,
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
      setRewardSummary,
      addRewardPoints,
      notifications,
      pushNotification,
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

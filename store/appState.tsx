import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { CampusId } from '@/constants/campuses';
import { CAMPUSES, getCampusById, getMeetingPointById } from '@/constants/campuses';
import {
  INITIAL_CREDIT_TRANSACTIONS,
  INITIAL_REDEMPTIONS,
  INITIAL_SETTINGS,
} from '@/constants/mock-uturn';
import type {
  AppSettings,
  CreditTransaction,
  DriverBankInfo,
  NotificationPrefs,
  PaymentState,
  PrivacyPrefs,
  RedeemableItem,
  Redemption,
} from '@/models/uturn';
import {
  CREDITS_PER_PAID_TRIP,
  generateRedemptionCode,
  PAYMENT_WINDOW_HOURS,
  STREAK_BONUS_CREDITS,
  STREAK_TRIP_TARGET,
} from '@/services/credits';

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
  credencialVerificada: boolean;
  lateCancellationsCount: number;
  lastLateCancellationAt: Date | null;
  blockedUntil: Date | null;
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
  // Pago del viaje con plazo de 48 h (Sesión 1)
  estadoPago: PaymentState;
  montoCLP?: number;
  pagoVenceAt?: string;
  pagadoAt?: string;
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
  addBooking: (
    booking: Omit<Booking, 'id' | 'estado' | 'createdAt' | 'estadoPago' | 'pagoVenceAt'> & {
      estado?: Booking['estado'];
      createdAt?: string;
      estadoPago?: PaymentState;
      pagoVenceAt?: string;
    }
  ) => Booking;
  updateBooking: (bookingId: string, updated: Partial<Booking>) => void;
  canUserBookOrCancel: (user: UserProfile | null, now: Date) => { allowed: boolean; reason?: string };
  cancelBooking: (bookingId: string, now: Date) => { success: boolean; reason?: string };
  payBooking: (bookingId: string) => { success: boolean; reason?: string; creditosGanados?: number };
  creditBalance: number;
  creditTransactions: CreditTransaction[];
  addCreditTransaction: (
    transaction: Omit<CreditTransaction, 'id' | 'createdAt'> & { createdAt?: string }
  ) => CreditTransaction;
  rachaViajes: number;
  redemptions: Redemption[];
  redeemItem: (item: RedeemableItem) => { success: boolean; reason?: string; redemption?: Redemption };
  markRedemptionUsed: (redemptionId: string) => void;
  settings: AppSettings;
  updateNotificationPrefs: (updates: Partial<NotificationPrefs>) => void;
  updatePrivacyPrefs: (updates: Partial<PrivacyPrefs>) => void;
  setBankInfo: (info: DriverBankInfo | null) => void;
  setCredencialVerificada: (verified: boolean) => void;
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
  {
    id: 'trip-3',
    driverId: 'driver-2',
    driverReputation: 4.5,
    origenCampus: 'Campus Las Condes',
    destinoCampus: 'Campus Peñalolén',
    origenCampusId: 'udd-las-condes',
    destinoCampusId: 'uai-penalolen',
    puntoEncuentroId: 'mp-udd-las-principal',
    horaSalida: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    precioCLP: 2300,
    asientosDisponibles: 0,
    asientosOcupados: 4,
    coordenadasOrigen: { latitude: campus('udd-las-condes').latitude, longitude: campus('udd-las-condes').longitude },
    coordenadasDestino: { latitude: campus('uai-penalolen').latitude, longitude: campus('uai-penalolen').longitude },
    meetingPointCoords: meeting('mp-udd-las-principal'),
  },
  {
    id: 'trip-4',
    driverId: 'driver-1',
    driverReputation: 4.8,
    origenCampus: 'Campus Peñalolén',
    destinoCampus: 'Campus San Carlos de Apoquindo',
    origenCampusId: 'uai-penalolen',
    destinoCampusId: 'uandes-san-carlos',
    puntoEncuentroId: 'mp-uai-pen-entradaprin',
    horaSalida: new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString(),
    precioCLP: 2500,
    asientosDisponibles: 0,
    asientosOcupados: 3,
    coordenadasOrigen: { latitude: campus('uai-penalolen').latitude, longitude: campus('uai-penalolen').longitude },
    coordenadasDestino: { latitude: campus('uandes-san-carlos').latitude, longitude: campus('uandes-san-carlos').longitude },
    meetingPointCoords: meeting('mp-uai-pen-entradaprin'),
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
    estadoPago: 'pendiente',
    montoCLP: 2500,
    pagoVenceAt: new Date(Date.now() + 46 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'booking-2',
    tripId: 'trip-2',
    passengerId: 'user-1',
    estado: 'pendiente',
    createdAt: new Date().toISOString(),
    estadoPago: 'pendiente',
    montoCLP: 2200,
    pagoVenceAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'booking-3',
    tripId: 'trip-3',
    passengerId: 'user-1',
    estado: 'confirmada',
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    estadoPago: 'pagado',
    montoCLP: 2300,
    pagadoAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'booking-4',
    tripId: 'trip-4',
    passengerId: 'user-1',
    estado: 'confirmada',
    createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    estadoPago: 'pendiente',
    montoCLP: 2500,
    pagoVenceAt: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
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
  credencialVerificada: false,
  lateCancellationsCount: 0,
  lastLateCancellationAt: null,
  blockedUntil: null,
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
  const [creditTransactions, setCreditTransactions] = useState<CreditTransaction[]>(
    INITIAL_CREDIT_TRANSACTIONS
  );
  const [redemptions, setRedemptions] = useState<Redemption[]>(INITIAL_REDEMPTIONS);
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);
  const [rachaViajes, setRachaViajes] = useState(4);

  const creditBalance = useMemo(
    () =>
      creditTransactions.reduce(
        (sum, transaction) => sum + (transaction.tipo === 'abono' ? transaction.monto : -transaction.monto),
        0
      ),
    [creditTransactions]
  );

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
      booking: Omit<Booking, 'id' | 'estado' | 'createdAt' | 'estadoPago' | 'pagoVenceAt'> & {
        estado?: Booking['estado'];
        createdAt?: string;
        estadoPago?: PaymentState;
        pagoVenceAt?: string;
      }
    ): Booking => {
      const createdAt = booking.createdAt ?? new Date().toISOString();
      const newBooking: Booking = {
        ...booking,
        id: `booking-${Date.now()}`,
        estado: booking.estado ?? 'pendiente',
        createdAt,
        estadoPago: booking.estadoPago ?? 'pendiente',
        pagoVenceAt:
          booking.pagoVenceAt ??
          new Date(new Date(createdAt).getTime() + PAYMENT_WINDOW_HOURS * 60 * 60 * 1000).toISOString(),
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

        let count = prev.lateCancellationsCount;
        if (prev.lastLateCancellationAt) {
          const days =
            (now.getTime() - new Date(prev.lastLateCancellationAt).getTime()) / (1000 * 60 * 60 * 24);
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

  const addCreditTransaction = useCallback(
    (transaction: Omit<CreditTransaction, 'id' | 'createdAt'> & { createdAt?: string }) => {
      const newTransaction: CreditTransaction = {
        ...transaction,
        id: `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: transaction.createdAt ?? new Date().toISOString(),
      };
      setCreditTransactions((prev) => [newTransaction, ...prev]);
      return newTransaction;
    },
    []
  );

  const payBooking = useCallback(
    (bookingId: string) => {
      const booking = bookings.find((b) => b.id === bookingId);
      if (!booking) {
        return { success: false, reason: 'Reserva no encontrada' };
      }
      if (booking.estadoPago === 'pagado') {
        return { success: false, reason: 'Esta reserva ya está pagada' };
      }

      const nowIso = new Date().toISOString();
      setBookings((prev) =>
        prev.map((b) =>
          b.id === bookingId ? { ...b, estado: 'confirmada', estadoPago: 'pagado', pagadoAt: nowIso } : b
        )
      );

      const nextRacha = rachaViajes + 1;
      setRachaViajes(nextRacha);

      let creditosGanados = CREDITS_PER_PAID_TRIP;
      addCreditTransaction({
        tipo: 'abono',
        fuente: 'viaje',
        monto: CREDITS_PER_PAID_TRIP,
        descripcion: 'Viaje pagado a tiempo',
        referenciaId: bookingId,
      });
      if (nextRacha % STREAK_TRIP_TARGET === 0) {
        creditosGanados += STREAK_BONUS_CREDITS;
        addCreditTransaction({
          tipo: 'abono',
          fuente: 'racha',
          monto: STREAK_BONUS_CREDITS,
          descripcion: `Racha de ${nextRacha} viajes pagados`,
        });
      }
      addRewardPoints(2);
      pushNotification({ message: 'Pago registrado. ¡Sumaste créditos Uturn!', type: 'info' });

      return { success: true, creditosGanados };
    },
    [bookings, rachaViajes, addCreditTransaction, addRewardPoints, pushNotification]
  );

  const redeemItem = useCallback(
    (item: RedeemableItem) => {
      if (creditBalance < item.costoCreditos) {
        return { success: false, reason: 'No tienes créditos suficientes para este canje' };
      }
      const now = new Date();
      const redemption: Redemption = {
        id: `redemption-${Date.now()}`,
        itemId: item.id,
        titulo: item.titulo,
        costoCreditos: item.costoCreditos,
        codigo: generateRedemptionCode(),
        createdAt: now.toISOString(),
        expiraAt: new Date(now.getTime() + item.vigenciaDias * 24 * 60 * 60 * 1000).toISOString(),
        estado: 'disponible',
      };
      setRedemptions((prev) => [redemption, ...prev]);
      addCreditTransaction({
        tipo: 'cargo',
        fuente: 'canje',
        monto: item.costoCreditos,
        descripcion: `Canje: ${item.titulo}`,
        referenciaId: redemption.id,
      });
      return { success: true, redemption };
    },
    [creditBalance, addCreditTransaction]
  );

  const markRedemptionUsed = useCallback((redemptionId: string) => {
    setRedemptions((prev) =>
      prev.map((redemption) =>
        redemption.id === redemptionId
          ? { ...redemption, estado: 'canjeado', canjeadoAt: new Date().toISOString() }
          : redemption
      )
    );
  }, []);

  const updateNotificationPrefs = useCallback((updates: Partial<NotificationPrefs>) => {
    setSettings((prev) => ({ ...prev, notificaciones: { ...prev.notificaciones, ...updates } }));
  }, []);

  const updatePrivacyPrefs = useCallback((updates: Partial<PrivacyPrefs>) => {
    setSettings((prev) => ({ ...prev, privacidad: { ...prev.privacidad, ...updates } }));
  }, []);

  const setBankInfo = useCallback((info: DriverBankInfo | null) => {
    setSettings((prev) => ({ ...prev, datosBancarios: info }));
  }, []);

  const setCredencialVerificada = useCallback((verified: boolean) => {
    setCurrentUser((prev) => (prev ? { ...prev, credencialVerificada: verified } : prev));
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
      payBooking,
      creditBalance,
      creditTransactions,
      addCreditTransaction,
      rachaViajes,
      redemptions,
      redeemItem,
      markRedemptionUsed,
      settings,
      updateNotificationPrefs,
      updatePrivacyPrefs,
      setBankInfo,
      setCredencialVerificada,
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
      payBooking,
      creditBalance,
      creditTransactions,
      addCreditTransaction,
      rachaViajes,
      redemptions,
      redeemItem,
      markRedemptionUsed,
      settings,
      updateNotificationPrefs,
      updatePrivacyPrefs,
      setBankInfo,
      setCredencialVerificada,
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

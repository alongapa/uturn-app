import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { CampusId } from '@/constants/campuses';
import { getCampusById, getMeetingPointById } from '@/constants/campuses';
import {
  INITIAL_CREDIT_TRANSACTIONS,
  INITIAL_REDEMPTIONS,
  INITIAL_SETTINGS,
} from '@/constants/mock-uturn';
import type { BankDetails, PaymentPenaltyState } from '@/models/types';
import type {
  AppSettings,
  CreditTransaction,
  NotificationPrefs,
  PrivacyPrefs,
  RedeemableItem,
  Redemption,
} from '@/models/uturn';
import {
  CREDITS_PER_PAID_TRIP,
  generateRedemptionCode,
  STREAK_BONUS_CREDITS,
  STREAK_TRIP_TARGET,
} from '@/services/credits';
import { getPaymentBreakdown, getPaymentDeadline } from '@/services/payments';
import {
  getPaymentBanRemainingMs,
  isPaymentBanned,
  registerPaymentStrike,
} from '@/services/penalties';

export type { BankDetails, PaymentPenaltyState };

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
  datosBancarios?: BankDetails;
  paymentPenalty: PaymentPenaltyState;
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

export type PaymentStatus = 'pendiente' | 'marcado' | 'confirmado' | 'vencido';

export type BookingPayment = {
  estado: PaymentStatus;
  precioCLP: number;
  comisionCLP: number;
  totalCLP: number;
  venceAt: string; // plazo de 48 horas para pagar
  marcadoAt?: string; // el pasajero marcó el pago como realizado
  confirmadoAt?: string; // el conductor confirmó la recepción
};

export type Booking = {
  id: string;
  tripId: string;
  passengerId: string;
  estado: 'pendiente' | 'confirmada' | 'cancelada' | 'completada';
  createdAt: string;
  pago: BookingPayment;
};

export type Rating = {
  id: string;
  bookingId?: string;
  tripId?: string;
  fromId: string;
  toId?: string;
  stars: number;
  comment?: string;
  createdAt: string;
};

export type Streaks = {
  pagosATiempo: number;
  mejorPagosATiempo: number;
  viajesCompletados: number;
  mejorViajesCompletados: number;
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
    onTimePayments: number;
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
  addBooking: (booking: {
    tripId: string;
    passengerId: string;
    estado?: Booking['estado'];
    createdAt?: string;
  }) => Booking;
  updateBooking: (bookingId: string, updated: Partial<Booking>) => void;
  canUserBookOrCancel: (user: UserProfile | null, now: Date) => { allowed: boolean; reason?: string };
  cancelBooking: (bookingId: string, now: Date) => { success: boolean; reason?: string };
  markPaymentSent: (bookingId: string, now?: Date) => { success: boolean; reason?: string };
  confirmPaymentReceived: (bookingId: string, now?: Date) => { success: boolean; reason?: string };
  expireOverduePayments: (now: Date) => number;
  completeBooking: (bookingId: string) => { success: boolean; reason?: string };
  getDriverBankDetails: (driverId: string) => BankDetails | null;
  ratings: Rating[];
  addRating: (rating: {
    bookingId?: string;
    tripId?: string;
    toId?: string;
    stars: number;
    comment?: string;
  }) => Rating;
  streaks: Streaks;
  creditBalance: number;
  creditTransactions: CreditTransaction[];
  addCreditTransaction: (
    transaction: Omit<CreditTransaction, 'id' | 'createdAt'> & { createdAt?: string }
  ) => CreditTransaction;
  redemptions: Redemption[];
  redeemItem: (item: RedeemableItem) => { success: boolean; reason?: string; redemption?: Redemption };
  markRedemptionUsed: (redemptionId: string) => void;
  settings: AppSettings;
  updateNotificationPrefs: (updates: Partial<NotificationPrefs>) => void;
  updatePrivacyPrefs: (updates: Partial<PrivacyPrefs>) => void;
  setCredencialVerificada: (verified: boolean) => void;
  rewardSummary: RewardSummary;
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

// Datos bancarios de los conductores de demostración (en producción vendrían de su perfil).
const DRIVER_BANK_DETAILS: Record<string, BankDetails> = {
  'driver-1': {
    banco: 'Banco de Chile',
    tipoCuenta: 'Cuenta Corriente',
    numeroCuenta: '00-123-45678-9',
    titular: 'Carlos Muñoz',
    rut: '18.456.789-2',
  },
  'driver-2': {
    banco: 'BancoEstado',
    tipoCuenta: 'CuentaRUT',
    numeroCuenta: '19.876.543',
    titular: 'Fernanda Rojas',
    rut: '19.876.543-1',
  },
};

const buildPago = (
  precioCLP: number,
  createdAtIso: string,
  overrides?: Partial<BookingPayment>
): BookingPayment => ({
  estado: 'pendiente',
  ...getPaymentBreakdown(precioCLP),
  venceAt: getPaymentDeadline(new Date(createdAtIso)),
  ...overrides,
});

const booking1CreatedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
const booking2CreatedAt = new Date().toISOString();
const booking3CreatedAt = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
const booking4CreatedAt = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();

const mockBookings: Booking[] = [
  {
    id: 'booking-1',
    tripId: 'trip-1',
    passengerId: 'user-1',
    estado: 'completada',
    createdAt: booking1CreatedAt,
    pago: buildPago(2500, booking1CreatedAt, {
      estado: 'confirmado',
      marcadoAt: new Date(new Date(booking1CreatedAt).getTime() + 3 * 60 * 60 * 1000).toISOString(),
      confirmadoAt: new Date(new Date(booking1CreatedAt).getTime() + 5 * 60 * 60 * 1000).toISOString(),
    }),
  },
  {
    id: 'booking-2',
    tripId: 'trip-2',
    passengerId: 'user-1',
    estado: 'confirmada',
    createdAt: booking2CreatedAt,
    pago: buildPago(2200, booking2CreatedAt),
  },
  {
    id: 'booking-3',
    tripId: 'trip-3',
    passengerId: 'user-1',
    estado: 'completada',
    createdAt: booking3CreatedAt,
    pago: buildPago(2300, booking3CreatedAt, {
      estado: 'confirmado',
      marcadoAt: new Date(new Date(booking3CreatedAt).getTime() + 8 * 60 * 60 * 1000).toISOString(),
      confirmadoAt: new Date(new Date(booking3CreatedAt).getTime() + 10 * 60 * 60 * 1000).toISOString(),
    }),
  },
  {
    // Viaje de ayer con el pago aún pendiente: vence dentro del plazo de 48 h.
    id: 'booking-4',
    tripId: 'trip-4',
    passengerId: 'user-1',
    estado: 'confirmada',
    createdAt: booking4CreatedAt,
    pago: buildPago(2500, booking4CreatedAt),
  },
];

const mockRatings: Rating[] = [
  {
    id: 'rating-1',
    bookingId: 'booking-1',
    tripId: 'trip-1',
    fromId: 'driver-1',
    toId: 'user-1',
    stars: 5,
    comment: 'Pasajero puntual y amable',
    createdAt: booking1CreatedAt,
  },
  {
    id: 'rating-2',
    tripId: 'trip-2',
    fromId: 'driver-2',
    toId: 'user-1',
    stars: 4,
    createdAt: booking1CreatedAt,
  },
];

const initialStreaks: Streaks = {
  pagosATiempo: 1,
  mejorPagosATiempo: 1,
  viajesCompletados: 1,
  mejorViajesCompletados: 1,
};

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
  paymentPenalty: { paymentStrikesCount: 0 },
};

type RewardInputs = {
  totalPoints: number;
  bookings: Booking[];
  ratings: Rating[];
  streaks: Streaks;
  currentUserId?: string;
};

// Construye la reputación con datos reales: viajes completados, calificación
// recibida como pasajero, puntualidad de pagos y rachas activas.
const buildRewardSummary = ({
  totalPoints,
  bookings,
  ratings,
  streaks,
  currentUserId,
}: RewardInputs): RewardSummary => {
  const levelInfo = computeLevel(totalPoints);
  const activeBookings = bookings.filter((b) => b.estado !== 'cancelada');
  const completedTrips = bookings.filter((b) => b.estado === 'completada').length;
  const cancellations = bookings.filter((b) => b.estado === 'cancelada').length;
  const confirmedPayments = bookings.filter((b) => b.pago.estado === 'confirmado');
  const onTimePayments = confirmedPayments.filter((b) => {
    const paidAt = b.pago.marcadoAt ?? b.pago.confirmadoAt;
    return paidAt ? new Date(paidAt).getTime() <= new Date(b.pago.venceAt).getTime() : false;
  }).length;
  const punctuality =
    confirmedPayments.length > 0 ? Math.round((onTimePayments / confirmedPayments.length) * 100) : 100;
  const ratingsReceived = ratings.filter((r) => r.toId && r.toId === currentUserId);
  const averageRating =
    ratingsReceived.length > 0
      ? ratingsReceived.reduce((sum, r) => sum + r.stars, 0) / ratingsReceived.length
      : 0;

  const badgeChecks = [
    {
      title: 'Pagador confiable',
      description: 'Logra una racha de 3 pagos a tiempo',
      unlocked: streaks.mejorPagosATiempo >= 3,
    },
    {
      title: 'Racha viajera',
      description: 'Completa 5 viajes seguidos',
      unlocked: streaks.mejorViajesCompletados >= 5,
    },
    {
      title: 'Puntual',
      description: 'Mantén un 90% de pagos dentro del plazo',
      unlocked: confirmedPayments.length > 0 && punctuality >= 90,
    },
    {
      title: 'Comunidad',
      description: 'Completa 20 viajes',
      unlocked: completedTrips >= 20,
    },
    {
      title: 'Estrella',
      description: 'Calificación 4.5+ como pasajero',
      unlocked: ratingsReceived.length > 0 && averageRating >= 4.5,
    },
  ];

  return {
    ...levelInfo,
    totalPoints,
    stats: {
      completedTrips,
      averageRating,
      punctuality,
      onTimePayments,
      monthsActive: 8,
      totalTrips: activeBookings.length,
      cancellations,
    },
    badgesUnlocked: badgeChecks
      .filter((b) => b.unlocked)
      .map(({ title, description }) => ({ title, description })),
    badgesLocked: badgeChecks
      .filter((b) => !b.unlocked)
      .map(({ title, description }) => ({ title, description })),
    earnRules: [
      { title: 'Completar viaje', value: '+2 pts' },
      { title: 'Calificación 5 estrellas', value: '+4 pts' },
      { title: 'Pago confirmado a tiempo', value: '+5 pts' },
      { title: 'Racha de 3 pagos a tiempo', value: '+25 pts' },
      { title: 'Racha de 5 viajes completados', value: '+20 pts' },
      { title: 'Pago vencido', value: '1 strike' },
    ],
  };
};

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
  const [ratings, setRatings] = useState<Rating[]>(mockRatings);
  const [streaks, setStreaks] = useState<Streaks>(initialStreaks);
  const [totalPoints, setTotalPoints] = useState(1850);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [creditTransactions, setCreditTransactions] = useState<CreditTransaction[]>(
    INITIAL_CREDIT_TRANSACTIONS
  );
  const [redemptions, setRedemptions] = useState<Redemption[]>(INITIAL_REDEMPTIONS);
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);

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
    (booking: {
      tripId: string;
      passengerId: string;
      estado?: Booking['estado'];
      createdAt?: string;
    }): Booking => {
      const trip = trips.find((t) => t.id === booking.tripId);
      const createdAt = booking.createdAt ?? new Date().toISOString();
      const newBooking: Booking = {
        tripId: booking.tripId,
        passengerId: booking.passengerId,
        id: `booking-${Date.now()}`,
        estado: booking.estado ?? 'pendiente',
        createdAt,
        pago: buildPago(trip?.precioCLP ?? 0, createdAt),
      };
      setBookings((prev) => [newBooking, ...prev]);
      return newBooking;
    },
    [trips]
  );

  const updateBooking = useCallback((bookingId: string, updated: Partial<Booking>) => {
    setBookings((prev) => prev.map((booking) => (booking.id === bookingId ? { ...booking, ...updated } : booking)));
  }, []);

  const canUserBookOrCancel = useCallback(
    (user: UserProfile | null, now: Date) => {
      if (!user) {
        return { allowed: false, reason: 'Debes iniciar sesión para continuar' };
      }

      if (isPaymentBanned(user.paymentPenalty, now)) {
        const until = new Date(user.paymentPenalty.paymentBanUntil!);
        const remainingHours = Math.ceil(
          getPaymentBanRemainingMs(user.paymentPenalty, now) / (1000 * 60 * 60)
        );
        return {
          allowed: false,
          reason: `Baneado de los turnos por impago hasta ${until.toLocaleString('es-CL')} (quedan ~${remainingHours} h)`,
        };
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

  const markPaymentSent = useCallback(
    (bookingId: string, now: Date = new Date()) => {
      const booking = bookings.find((b) => b.id === bookingId);
      if (!booking) {
        return { success: false, reason: 'Reserva no encontrada' };
      }
      if (booking.pago.estado === 'marcado') {
        return { success: false, reason: 'Ya marcaste este pago; espera la confirmación del conductor' };
      }
      if (booking.pago.estado === 'confirmado') {
        return { success: false, reason: 'Este pago ya fue confirmado' };
      }

      setBookings((prev) =>
        prev.map((b) =>
          b.id === bookingId
            ? { ...b, pago: { ...b.pago, estado: 'marcado', marcadoAt: now.toISOString() } }
            : b
        )
      );

      const trip = trips.find((t) => t.id === booking.tripId);
      pushNotification({
        message: 'Un pasajero marcó su pago como realizado',
        type: 'action',
        targetUserId: trip?.driverId,
      });
      return { success: true };
    },
    [bookings, trips, pushNotification]
  );

  const confirmPaymentReceived = useCallback(
    (bookingId: string, now: Date = new Date()) => {
      const booking = bookings.find((b) => b.id === bookingId);
      if (!booking) {
        return { success: false, reason: 'Reserva no encontrada' };
      }
      if (booking.pago.estado === 'confirmado') {
        return { success: false, reason: 'Este pago ya estaba confirmado' };
      }

      const paidAtIso = booking.pago.marcadoAt ?? now.toISOString();
      const onTime = new Date(paidAtIso).getTime() <= new Date(booking.pago.venceAt).getTime();

      setBookings((prev) =>
        prev.map((b) =>
          b.id === bookingId
            ? {
                ...b,
                pago: {
                  ...b.pago,
                  estado: 'confirmado',
                  marcadoAt: b.pago.marcadoAt ?? paidAtIso,
                  confirmadoAt: now.toISOString(),
                },
              }
            : b
        )
      );

      if (booking.passengerId === currentUser?.id) {
        if (onTime) {
          const nextStreak = streaks.pagosATiempo + 1;
          setStreaks((prev) => ({
            ...prev,
            pagosATiempo: nextStreak,
            mejorPagosATiempo: Math.max(prev.mejorPagosATiempo, nextStreak),
          }));
          let earned = 5;
          // Los pagos a tiempo también suman créditos Uturn (canjeables en /redeem)
          addCreditTransaction({
            tipo: 'abono',
            fuente: 'viaje',
            monto: CREDITS_PER_PAID_TRIP,
            descripcion: 'Pago confirmado a tiempo',
            referenciaId: bookingId,
          });
          if (nextStreak % STREAK_TRIP_TARGET === 0) {
            earned += 25;
            addCreditTransaction({
              tipo: 'abono',
              fuente: 'racha',
              monto: STREAK_BONUS_CREDITS,
              descripcion: `Racha de ${nextStreak} pagos a tiempo`,
            });
            pushNotification({
              message: `¡Racha de ${nextStreak} pagos a tiempo! Ganaste +25 pts y +${STREAK_BONUS_CREDITS} créditos extra`,
              type: 'info',
              targetUserId: booking.passengerId,
            });
          }
          setTotalPoints((prev) => Math.max(0, prev + earned));
        } else {
          setStreaks((prev) => ({ ...prev, pagosATiempo: 0 }));
        }
      }

      pushNotification({
        message: 'El conductor confirmó la recepción de tu pago',
        type: 'info',
        targetUserId: booking.passengerId,
      });
      return { success: true };
    },
    [bookings, currentUser, streaks, addCreditTransaction, pushNotification]
  );

  const expireOverduePayments = useCallback(
    (now: Date): number => {
      const expired = bookings.filter(
        (b) =>
          b.estado !== 'cancelada' &&
          b.pago.estado === 'pendiente' &&
          new Date(b.pago.venceAt).getTime() < now.getTime()
      );
      if (expired.length === 0) {
        return 0;
      }

      const expiredIds = new Set(expired.map((b) => b.id));
      setBookings((prev) =>
        prev.map((b) => (expiredIds.has(b.id) ? { ...b, pago: { ...b.pago, estado: 'vencido' } } : b))
      );

      const mine = expired.filter((b) => b.passengerId === currentUser?.id);
      if (mine.length > 0 && currentUser) {
        let penalty = currentUser.paymentPenalty;
        mine.forEach(() => {
          penalty = registerPaymentStrike(penalty, now);
        });
        setCurrentUser({ ...currentUser, paymentPenalty: penalty });
        setStreaks((prev) => ({ ...prev, pagosATiempo: 0 }));
        pushNotification({
          message: isPaymentBanned(penalty, now)
            ? 'Acumulaste 3 strikes por impago: baneado de los turnos por 2 días'
            : `Pago vencido: recibiste ${mine.length} strike${mine.length > 1 ? 's' : ''} por impago (${penalty.paymentStrikesCount}/3)`,
          type: 'warning',
          targetUserId: currentUser.id,
        });
      }
      return expired.length;
    },
    [bookings, currentUser, pushNotification]
  );

  const completeBooking = useCallback(
    (bookingId: string) => {
      const booking = bookings.find((b) => b.id === bookingId);
      if (!booking) {
        return { success: false, reason: 'Reserva no encontrada' };
      }
      if (booking.estado === 'completada') {
        return { success: false, reason: 'Este viaje ya fue completado' };
      }
      if (booking.estado === 'cancelada') {
        return { success: false, reason: 'No puedes completar un viaje cancelado' };
      }

      setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, estado: 'completada' } : b)));

      if (booking.passengerId === currentUser?.id) {
        const nextStreak = streaks.viajesCompletados + 1;
        setStreaks((prev) => ({
          ...prev,
          viajesCompletados: nextStreak,
          mejorViajesCompletados: Math.max(prev.mejorViajesCompletados, nextStreak),
        }));
        let earned = 2;
        if (nextStreak % 5 === 0) {
          earned += 20;
          pushNotification({
            message: `¡Racha de ${nextStreak} viajes completados! Ganaste +20 pts extra`,
            type: 'info',
            targetUserId: booking.passengerId,
          });
        }
        setTotalPoints((prev) => Math.max(0, prev + earned));
      }
      return { success: true };
    },
    [bookings, currentUser, streaks, pushNotification]
  );

  const getDriverBankDetails = useCallback(
    (driverId: string): BankDetails | null => {
      if (currentUser?.id === driverId && currentUser.datosBancarios) {
        return currentUser.datosBancarios;
      }
      return DRIVER_BANK_DETAILS[driverId] ?? null;
    },
    [currentUser]
  );

  const addRating = useCallback(
    (rating: { bookingId?: string; tripId?: string; toId?: string; stars: number; comment?: string }): Rating => {
      const newRating: Rating = {
        ...rating,
        id: `rating-${Date.now()}`,
        fromId: currentUser?.id ?? 'anon',
        createdAt: new Date().toISOString(),
      };
      setRatings((prev) => [newRating, ...prev]);
      setTotalPoints((prev) => Math.max(0, prev + (rating.stars === 5 ? 4 : 2)));
      return newRating;
    },
    [currentUser]
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

  const setCredencialVerificada = useCallback((verified: boolean) => {
    setCurrentUser((prev) => (prev ? { ...prev, credencialVerificada: verified } : prev));
  }, []);

  const addRewardPoints = useCallback((points: number) => {
    setTotalPoints((prev) => Math.max(0, prev + points));
  }, []);

  const rewardSummary = useMemo(
    () =>
      buildRewardSummary({
        totalPoints,
        bookings,
        ratings,
        streaks,
        currentUserId: currentUser?.id,
      }),
    [totalPoints, bookings, ratings, streaks, currentUser?.id]
  );

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
      markPaymentSent,
      confirmPaymentReceived,
      expireOverduePayments,
      completeBooking,
      getDriverBankDetails,
      ratings,
      addRating,
      streaks,
      creditBalance,
      creditTransactions,
      addCreditTransaction,
      redemptions,
      redeemItem,
      markRedemptionUsed,
      settings,
      updateNotificationPrefs,
      updatePrivacyPrefs,
      setCredencialVerificada,
      rewardSummary,
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
      markPaymentSent,
      confirmPaymentReceived,
      expireOverduePayments,
      completeBooking,
      getDriverBankDetails,
      ratings,
      addRating,
      streaks,
      creditBalance,
      creditTransactions,
      addCreditTransaction,
      redemptions,
      redeemItem,
      markRedemptionUsed,
      settings,
      updateNotificationPrefs,
      updatePrivacyPrefs,
      setCredencialVerificada,
      rewardSummary,
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

// Traductores fila-de-DB → forma que consumen las pantallas.
// Mantienen las firmas/tipos ya usados por la app (store/appState.tsx, models/*).

import { getCampusById } from '@/constants/campuses';
import type { CampusId } from '@/constants/campuses';
import type { UniversityId } from '@/constants/campuses';
import type { BankDetails, PenaltyState, PaymentPenaltyState, User } from '@/models/types';
import type { CreditTransaction, Redemption } from '@/models/unities';
import type {
  Booking,
  BookingPayment,
  Coordinates,
  PaymentStatus as ClientPaymentStatus,
  Rating,
  Streaks,
  Trip,
  UserProfile,
} from '@/store/appState';
import type {
  BookingRow,
  BookingStatus,
  CreditTransactionRow,
  PaymentRow,
  PaymentStatus,
  ProfileRow,
  RatingRow,
  RedemptionRow,
  TripRow,
} from '@/types/database';

// --- Mapas de estado (inglés en DB ⇄ español en pantallas) ---

const BOOKING_STATUS_TO_CLIENT: Record<BookingStatus, Booking['estado']> = {
  pending: 'pendiente',
  confirmed: 'confirmada',
  cancelled: 'cancelada',
  completed: 'completada',
};

const PAYMENT_STATUS_TO_CLIENT: Record<PaymentStatus, ClientPaymentStatus> = {
  pending: 'pendiente',
  marked: 'marcado',
  confirmed: 'confirmado',
  overdue: 'vencido',
  disputed: 'disputado',
};

export const toClientBookingStatus = (s: BookingStatus): Booking['estado'] =>
  BOOKING_STATUS_TO_CLIENT[s];
export const toClientPaymentStatus = (s: PaymentStatus): ClientPaymentStatus =>
  PAYMENT_STATUS_TO_CLIENT[s];

// --- Perfil ---

/** details (jsonb de bank_details / RPC get_driver_bank_details) → BankDetails. */
export const asBankDetails = (value: unknown): BankDetails | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as BankDetails;
};

export function mapProfileToPenaltyState(row: ProfileRow): PenaltyState {
  return {
    lateCancellationsCount: row.late_cancellations_count,
    lastLateCancellationAt: row.last_late_cancellation_at ?? undefined,
    currentBlockUntil: row.block_until ?? undefined,
  };
}

export function mapProfileToPaymentPenalty(row: ProfileRow): PaymentPenaltyState {
  return {
    paymentStrikesCount: row.payment_strikes_count,
    lastPaymentStrikeAt: row.last_payment_strike_at ?? undefined,
    paymentBanUntil: row.payment_ban_until ?? undefined,
  };
}

export function mapProfileToStreaks(row: ProfileRow): Streaks {
  return {
    pagosATiempo: row.streak_on_time_payments,
    mejorPagosATiempo: row.best_streak_on_time_payments,
    viajesCompletados: row.streak_completed_trips,
    mejorViajesCompletados: row.best_streak_completed_trips,
  };
}

export function mapProfileToUserProfile(row: ProfileRow, bankDetails?: BankDetails): UserProfile {
  const campus = row.home_campus_id ? getCampusById(row.home_campus_id as CampusId) : undefined;
  return {
    id: row.id,
    nombre: row.full_name ?? '',
    email: row.email,
    universidad: (row.university_id ?? '').toUpperCase(),
    campus: campus?.name ?? '',
    fechaNacimiento: row.date_of_birth ?? '',
    urlFotoPerfil: row.avatar_url ?? undefined,
    credencialVerificada: row.credential_verified,
    penaltyState: mapProfileToPenaltyState(row),
    datosBancarios: bankDetails,
    paymentPenalty: mapProfileToPaymentPenalty(row),
  };
}

/** ProfileRow → User (models/types), la forma que envuelve UserContext. */
export function mapProfileToUser(row: ProfileRow, bankDetails?: BankDetails): User {
  return {
    id: row.id,
    name: row.full_name ?? '',
    email: row.email,
    travelMode: row.travel_mode,
    accountRole: row.account_role,
    rating: row.rating_avg,
    universityId: (row.university_id as UniversityId | null) ?? undefined,
    homeCampusId: (row.home_campus_id as CampusId | null) ?? undefined,
    dateOfBirth: row.date_of_birth ?? undefined,
    driverLicenseNumber: row.driver_license_number ?? undefined,
    driverLicenseExpiration: row.driver_license_expiration ?? undefined,
    penaltyState: mapProfileToPenaltyState(row),
    paymentPenaltyState: mapProfileToPaymentPenalty(row),
    bankDetails,
  };
}

// --- Viajes ---

type TripRowWithDriver = TripRow & { driver?: { rating_avg: number | null } | null };

const asCoordinates = (lat: number, lng: number): Coordinates => ({ latitude: lat, longitude: lng });

const asPolyline = (value: TripRow['route_polyline']): Coordinates[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((p) =>
      p && typeof p === 'object' && !Array.isArray(p)
        ? { latitude: Number((p as Record<string, unknown>).latitude), longitude: Number((p as Record<string, unknown>).longitude) }
        : null
    )
    .filter((p): p is Coordinates => !!p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
};

export function mapTripRowToTrip(row: TripRowWithDriver): Trip {
  const originName =
    row.origin_campus_name ??
    (row.origin_campus_id ? getCampusById(row.origin_campus_id as CampusId)?.name : undefined) ??
    '';
  const destName =
    row.destination_campus_name ??
    (row.destination_campus_id ? getCampusById(row.destination_campus_id as CampusId)?.name : undefined) ??
    '';
  return {
    id: row.id,
    driverId: row.driver_id,
    driverReputation: row.driver?.rating_avg ?? undefined,
    origenCampus: originName,
    destinoCampus: destName,
    origenCampusId: (row.origin_campus_id as CampusId | null) ?? undefined,
    destinoCampusId: (row.destination_campus_id as CampusId | null) ?? undefined,
    puntoEncuentroId: row.meeting_point_id ?? undefined,
    horaSalida: row.departs_at,
    precioCLP: row.price_clp,
    asientosDisponibles: Math.max(0, row.seats_total - row.seats_taken),
    asientosOcupados: row.seats_taken,
    coordenadasOrigen: asCoordinates(row.origin_lat, row.origin_lng),
    coordenadasDestino: asCoordinates(row.destination_lat, row.destination_lng),
    meetingPointCoords:
      row.meeting_lat != null && row.meeting_lng != null
        ? asCoordinates(row.meeting_lat, row.meeting_lng)
        : null,
    routePolyline: asPolyline(row.route_polyline),
  };
}

// --- Reservas + pago ---

export function mapPaymentRowToBookingPayment(row: PaymentRow): BookingPayment {
  return {
    estado: toClientPaymentStatus(row.status),
    precioCLP: row.price_clp,
    comisionCLP: row.commission_clp,
    totalCLP: row.total_clp,
    venceAt: row.due_at,
    marcadoAt: row.marked_at ?? undefined,
    confirmadoAt: row.confirmed_at ?? undefined,
    proveedor: row.provider ?? undefined,
    verificadoAt: row.verified_at ?? undefined,
    creditosAplicados: row.credits_applied,
    creditosCLP: row.credits_clp,
    efectivoCLP: row.cash_clp ?? undefined,
  };
}

export function mapBookingRowToBooking(row: BookingRow, payment: PaymentRow | null): Booking {
  return {
    id: row.id,
    tripId: row.trip_id,
    passengerId: row.passenger_id,
    estado: toClientBookingStatus(row.status),
    createdAt: row.created_at,
    pago: payment
      ? mapPaymentRowToBookingPayment(payment)
      : { estado: 'pendiente', precioCLP: 0, comisionCLP: 0, totalCLP: 0, venceAt: row.created_at },
  };
}

// --- Calificaciones ---

export function mapRatingRowToRating(row: RatingRow): Rating {
  return {
    id: row.id,
    bookingId: row.booking_id ?? undefined,
    tripId: row.trip_id ?? undefined,
    fromId: row.from_id,
    toId: row.to_id ?? undefined,
    stars: row.stars,
    comment: row.note ?? undefined,
    createdAt: row.created_at,
  };
}

// --- Créditos y canjes ---

export function mapCreditRowToTransaction(row: CreditTransactionRow): CreditTransaction {
  return {
    id: row.id,
    tipo: row.entry_type,
    fuente: row.source,
    monto: row.amount,
    descripcion: row.description,
    createdAt: row.created_at,
    referenciaId: row.reference_id ?? undefined,
  };
}

export function mapRedemptionRowToRedemption(row: RedemptionRow): Redemption {
  return {
    id: row.id,
    itemId: row.item_id ?? '',
    titulo: row.title,
    costoCreditos: row.cost_credits,
    codigo: row.code,
    createdAt: row.created_at,
    expiraAt: row.expires_at,
    canjeadoAt: row.redeemed_at ?? undefined,
    estado: row.status,
  };
}

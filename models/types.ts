// Definición de tipos principales para la app UNITIES
import type { CampusId, UniversityId } from '@/constants/campuses';

// Modo de viaje: cómo participa la persona en un viaje concreto.
// Cualquier usuario puede alternar entre conducir y ser pasajero.
export type TravelMode = 'driver' | 'rider';

/** @deprecated Usa TravelMode. Se mantiene como alias por compatibilidad. */
export type Role = TravelMode;

// Rol de cuenta: nivel de autorización dentro de la plataforma,
// independiente del modo de viaje. Ordenados de menor a mayor privilegio.
export type AccountRole = 'user' | 'tutor' | 'admin' | 'owner';

export const ACCOUNT_ROLES: AccountRole[] = ['user', 'tutor', 'admin', 'owner'];

export type VehicleInfo = {
  brand: string;
  model: string;
  year: number;
  color?: string;
  plate?: string;
};

export interface PenaltyState {
  lateCancellationsCount: number;
  lastLateCancellationAt?: string;
  currentBlockUntil?: string;
}

// Penalización independiente de las cancelaciones tardías:
// strikes por impago de reservas y baneo temporal de los turnos.
export interface PaymentPenaltyState {
  paymentStrikesCount: number;
  lastPaymentStrikeAt?: string;
  paymentBanUntil?: string;
}

export type BankDetails = {
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  titular: string;
  rut?: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  travelMode: TravelMode;
  accountRole?: AccountRole;
  rating?: number;
  universityId?: UniversityId;
  homeCampusId?: CampusId;
  dateOfBirth?: string;
  driverLicenseNumber?: string;
  driverLicenseExpiration?: string;
  vehicle?: VehicleInfo;
  penaltyState?: PenaltyState;
  paymentPenaltyState?: PaymentPenaltyState;
  bankDetails?: BankDetails;
};

export type Trip = {
  id: string;
  driverId: string;
  driverName: string;
  dest: string;
  meetPoint: string;
  price: number;
  seats: number;
  departAt: string;     // fecha/hora en formato ISO
  routeNotes?: string;
  originCampusId: CampusId;
  destinationCampusId: CampusId;
  meetingPointId: string;
};

export type Booking = {
  id: string;
  tripId: string;
  riderId: string;
  status: 'reserved' | 'cancelled' | 'completed';
};

export type Rating = {
  id: string;
  fromId: string;
  toId: string;
  tripId: string;
  stars: 1 | 2 | 3 | 4 | 5;
  note?: string;
};


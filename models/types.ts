// Definición de tipos principales para la app UTURN
import type { CampusId, UniversityId } from '@/constants/campuses';

export type Role = 'driver' | 'rider';

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
  role: Role;
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


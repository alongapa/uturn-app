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


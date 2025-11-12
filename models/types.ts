// Definición de tipos principales para la app UTURN

export type Role = 'driver' | 'rider';

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  rating?: number;
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


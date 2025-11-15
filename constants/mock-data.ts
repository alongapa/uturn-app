import { Trip, User } from '@/models/types';

export type PassengerManifest = {
  id: string;
  name: string;
  faculty: string;
  pickup: string;
  seat: string;
  status: 'confirmado' | 'pendiente' | 'completado';
  badges?: string[];
};

export type BookingResume = {
  id: string;
  title: string;
  driverName: string;
  date: string;
  seats: number;
  status: 'confirmado' | 'pendiente' | 'completado' | 'cancelado';
};

export type DriverSpotlight = User & {
  car: string;
  completedTrips: number;
  expertise: string[];
};

export type TripTimelineEntry = {
  id: string;
  title: string;
  detail: string;
  time: string;
};

export const CAMPUS_LOCATIONS = [
  'Campus Peñalolén',
  'Campus San Carlos',
  'Campus Viña del Mar',
  'Centro de Innovación',
];

export const RECOMMENDED_TRIPS: Trip[] = [
  {
    id: 't1',
    driverId: 'u1',
    driverName: 'Constanza Vidal',
    dest: 'Providencia',
    meetPoint: 'Metro Grecia',
    price: 2500,
    seats: 2,
    departAt: '2024-10-31T07:45:00-03:00',
    routeNotes: 'Ruta rápida por Vespucio Sur',
  },
  {
    id: 't2',
    driverId: 'u2',
    driverName: 'Ignacio López',
    dest: 'Plaza Ñuñoa',
    meetPoint: 'Entrada principal Peñalolén',
    price: 2200,
    seats: 3,
    departAt: '2024-10-31T09:00:00-03:00',
    routeNotes: 'Acepta bicicletas plegables',
  },
  {
    id: 't3',
    driverId: 'u3',
    driverName: 'María Abarca',
    dest: 'La Reina',
    meetPoint: 'Estacionamientos sur',
    price: 2000,
    seats: 1,
    departAt: '2024-10-31T18:15:00-03:00',
    routeNotes: 'Hace parada en Tobalaba',
  },
];

export const DRIVER_SPOTLIGHT: DriverSpotlight[] = [
  {
    id: 'u1',
    name: 'Constanza Vidal',
    email: 'constanza@alumnos.uai.cl',
    role: 'driver',
    rating: 4.9,
    car: 'Mazda 3 2021',
    completedTrips: 182,
    expertise: ['Ruta costa', 'Viajes express'],
  },
  {
    id: 'u2',
    name: 'Ignacio López',
    email: 'ignacio@alumnos.uai.cl',
    role: 'driver',
    rating: 4.8,
    car: 'Hyundai Tucson 2019',
    completedTrips: 154,
    expertise: ['Equipaje extra', 'Mascotas'],
  },
];

export const UPCOMING_TRIP: Trip = {
  id: 't4',
  driverId: 'u4',
  driverName: 'Francisca Ortega',
  dest: 'Barrio Italia',
  meetPoint: 'Acceso Biblioteca',
  price: 2300,
  seats: 4,
  departAt: '2024-10-31T20:00:00-03:00',
  routeNotes: 'Incluye parada en Irarrázaval',
};

export const PASSENGER_MANIFEST: PassengerManifest[] = [
  {
    id: 'p1',
    name: 'Jorge Rivera',
    faculty: 'Ingeniería Comercial',
    pickup: 'Estacionamiento sur',
    seat: '2A',
    status: 'confirmado',
    badges: ['Pago verificado'],
  },
  {
    id: 'p2',
    name: 'Lucía Prado',
    faculty: 'Diseño',
    pickup: 'Entrada gimnasio',
    seat: '2B',
    status: 'pendiente',
    badges: ['Primera vez'],
  },
  {
    id: 'p3',
    name: 'Sebastián Valdés',
    faculty: 'Derecho',
    pickup: 'Metro Grecia',
    seat: '3A',
    status: 'completado',
    badges: ['5★ historial'],
  },
];

export const BOOKINGS_SUMMARY: BookingResume[] = [
  {
    id: 'b1',
    title: 'Peñalolén → Providencia',
    driverName: 'Constanza Vidal',
    date: 'Hoy, 07:45',
    seats: 1,
    status: 'confirmado',
  },
  {
    id: 'b2',
    title: 'San Carlos → Ñuñoa',
    driverName: 'Ignacio López',
    date: 'Hoy, 09:00',
    seats: 2,
    status: 'pendiente',
  },
  {
    id: 'b3',
    title: 'Viña → Valparaíso',
    driverName: 'María Abarca',
    date: 'Mañana, 18:15',
    seats: 1,
    status: 'completado',
  },
];

export const TRIP_TIMELINE: TripTimelineEntry[] = [
  {
    id: 'tt1',
    title: 'Encuentro',
    detail: 'Ingreso principal Campus Peñalolén',
    time: '18:10',
  },
  {
    id: 'tt2',
    title: 'Ruta intermedia',
    detail: 'Parada coordinada en Metro Tobalaba',
    time: '18:40',
  },
  {
    id: 'tt3',
    title: 'Destino final',
    detail: 'Barrio Italia, Av. Italia con Santa Isabel',
    time: '19:15',
  },
];

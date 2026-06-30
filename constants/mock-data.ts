import { CAMPUSES, getMeetingPointById } from '@/constants/campuses';
import { Trip } from '@/models/types';

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

export type DriverSpotlight = {
  id: string;
  name: string;
  email: string;
  role: 'driver';
  rating: number;
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

export const CAMPUS_LOCATIONS = CAMPUSES.map((campus) => campus.name);

const getMeetingPointLabel = (id: string) => getMeetingPointById(id)?.name ?? 'Punto de encuentro';

/** Fecha futura relativa a "ahora", para que los viajes mock nunca queden en el pasado. */
const inHours = (h: number) => new Date(Date.now() + h * 3600 * 1000).toISOString();

export const RECOMMENDED_TRIPS: Trip[] = [
  {
    id: 't1',
    driverId: 'u1',
    driverName: 'Constanza Vidal',
    driverRating: 4.9,
    driverTier: 'elite',
    dest: 'Providencia',
    meetPoint: getMeetingPointLabel('mp-uai-pen-entradaprin'),
    price: 2500,
    seats: 2,
    departAt: inHours(3),
    routeNotes: 'Ruta rápida por Vespucio Sur',
    originCampusId: 'uai-penalolen',
    destinationCampusId: 'uandes-san-carlos',
    meetingPointId: 'mp-uai-pen-entradaprin',
  },
  {
    id: 't2',
    driverId: 'u2',
    driverName: 'Ignacio López',
    driverRating: 4.8,
    driverTier: 'confiable',
    dest: 'Plaza Ñuñoa',
    meetPoint: getMeetingPointLabel('mp-uai-pen-biblioteca'),
    price: 2200,
    seats: 3,
    departAt: inHours(5),
    routeNotes: 'Acepta bicicletas plegables',
    originCampusId: 'uai-penalolen',
    destinationCampusId: 'udd-las-condes',
    meetingPointId: 'mp-uai-pen-biblioteca',
  },
  {
    id: 't3',
    driverId: 'u3',
    driverName: 'María Abarca',
    driverRating: 4.6,
    driverTier: 'habitual',
    dest: 'La Reina',
    meetPoint: getMeetingPointLabel('mp-uai-pen-estacionamientos'),
    price: 2000,
    seats: 1,
    departAt: inHours(9),
    routeNotes: 'Hace parada en Tobalaba',
    originCampusId: 'uai-penalolen',
    destinationCampusId: 'uandes-san-carlos',
    meetingPointId: 'mp-uai-pen-estacionamientos',
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
  driverRating: 4.7,
  driverTier: 'habitual',
  dest: 'Barrio Italia',
  meetPoint: getMeetingPointLabel('mp-uai-pen-biblioteca'),
  price: 2300,
  seats: 4,
  departAt: inHours(14),
  routeNotes: 'Incluye parada en Irarrázaval',
  originCampusId: 'uai-penalolen',
  destinationCampusId: 'uandes-san-carlos',
  meetingPointId: 'mp-uai-pen-biblioteca',
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
    title: 'Campus → Valparaíso',
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

export type UniversityId = 'uai' | 'udd' | 'uandes';

export type CampusId =
  | 'uai-penalolen'
  | 'uai-vina-del-mar'
  | 'udd-las-condes'
  | 'udd-concepcion'
  | 'uandes-san-carlos'
  | 'uandes-vina';

export interface MeetingPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  detail?: string;
}

export interface Campus {
  id: CampusId;
  universityId: UniversityId;
  name: string;
  city: string;
  address: string;
  latitude: number;
  longitude: number;
  meetingPoints: MeetingPoint[];
}

export interface University {
  id: UniversityId;
  name: string;
  domains: string[];
}

export const UNIVERSITIES: University[] = [
  {
    id: 'uai',
    name: 'Universidad Adolfo Ibáñez',
    domains: ['@alumnos.uai.cl'],
  },
  {
    id: 'udd',
    name: 'Universidad del Desarrollo',
    domains: ['@udd.cl'],
  },
  {
    id: 'uandes',
    name: 'Universidad de los Andes',
    domains: ['@miuandes.cl'],
  },
];

export const CAMPUSES: Campus[] = [
  {
    id: 'uai-penalolen',
    universityId: 'uai',
    name: 'Campus Peñalolén',
    city: 'Santiago',
    address: 'Diagonal Las Torres 2640, Peñalolén',
    latitude: -33.4884163,
    longitude: -70.5094354,
    meetingPoints: [
      { id: 'mp-uai-pen-entradaprin', name: 'Entrada principal Peñalolén', latitude: -33.4888, longitude: -70.5099 },
      { id: 'mp-uai-pen-estacionamientos', name: 'Estacionamientos Sur', latitude: -33.4899, longitude: -70.5086 },
      { id: 'mp-uai-pen-biblioteca', name: 'Acceso Biblioteca', latitude: -33.4879, longitude: -70.5106 },
    ],
  },
  {
    id: 'uai-vina-del-mar',
    universityId: 'uai',
    name: 'Campus Viña del Mar',
    city: 'Viña del Mar',
    address: 'Avenida Padre Hurtado 750, Viña del Mar',
    latitude: -33.0196718,
    longitude: -71.5304035,
    meetingPoints: [
      { id: 'mp-uai-vina-parque', name: 'Parque Tecnológico', latitude: -33.0214, longitude: -71.5308 },
      { id: 'mp-uai-vina-gimnasio', name: 'Entrada Gimnasio', latitude: -33.0191, longitude: -71.5295 },
    ],
  },
  {
    id: 'udd-las-condes',
    universityId: 'udd',
    name: 'Campus Las Condes',
    city: 'Santiago',
    address: 'Avenida Plaza 680, Las Condes (Campus Rector Ernesto Silva Bafalluy)',
    latitude: -33.3918355,
    longitude: -70.5005034,
    meetingPoints: [
      { id: 'mp-udd-las-principal', name: 'Acceso principal Av. La Plaza', latitude: -33.3917, longitude: -70.5002 },
      { id: 'mp-udd-las-plaza', name: 'Plaza Central', latitude: -33.3924, longitude: -70.5011 },
    ],
  },
  {
    id: 'udd-concepcion',
    universityId: 'udd',
    name: 'Campus Concepción',
    city: 'Concepción',
    address: 'Ainavillo 456, Concepción',
    latitude: -36.8212758,
    longitude: -73.0366801,
    meetingPoints: [
      { id: 'mp-udd-con-hospital', name: 'Hospital Clínico UDD', latitude: -36.8217, longitude: -73.0369 },
      { id: 'mp-udd-con-parque', name: 'Parque Empresarial', latitude: -36.8225, longitude: -73.0351 },
    ],
  },
  {
    id: 'uandes-san-carlos',
    universityId: 'uandes',
    name: 'Campus San Carlos de Apoquindo',
    city: 'Santiago',
    address: 'Avenida Mons. Álvaro del Portillo 12455, Las Condes',
    latitude: -33.4038341,
    longitude: -70.5080637,
    meetingPoints: [
      { id: 'mp-uandes-san-entrada', name: 'Entrada San Carlos', latitude: -33.4032, longitude: -70.5099 },
      { id: 'mp-uandes-san-estacionamientos', name: 'Estacionamientos Superiores', latitude: -33.4051, longitude: -70.5073 },
      { id: 'mp-uandes-san-gimnasio', name: 'Gimnasio universitario', latitude: -33.404, longitude: -70.506 },
    ],
  },
  {
    id: 'uandes-vina',
    universityId: 'uandes',
    name: 'Centro de Innovación Viña',
    city: 'Viña del Mar',
    address: 'Av. Marina 234, Viña del Mar',
    latitude: -33.0175,
    longitude: -71.5514,
    meetingPoints: [
      { id: 'mp-uandes-vina-lobby', name: 'Lobby principal', latitude: -33.0215, longitude: -71.5517 },
      { id: 'mp-uandes-vina-terraza', name: 'Terraza norte', latitude: -33.0209, longitude: -71.5524 },
    ],
  },
];

export function getMeetingPointById(id?: string) {
  if (!id) return undefined;
  for (const campus of CAMPUSES) {
    const point = campus.meetingPoints.find((meetingPoint) => meetingPoint.id === id);
    if (point) {
      return { ...point, campusName: campus.name };
    }
  }
  return undefined;
}

export function getCampusById(id?: CampusId) {
  if (!id) return undefined;
  return CAMPUSES.find((campus) => campus.id === id);
}

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
}

export interface Campus {
  id: CampusId;
  universityId: UniversityId;
  name: string;
  city: string;
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
    meetingPoints: [
      { id: 'mp-uai-pen-entradaprin', name: 'Entrada principal Peñalolén', latitude: -33.4904, longitude: -70.5158 },
      { id: 'mp-uai-pen-estacionamientos', name: 'Estacionamientos Sur', latitude: -33.4942, longitude: -70.5132 },
      { id: 'mp-uai-pen-biblioteca', name: 'Acceso Biblioteca', latitude: -33.4921, longitude: -70.5169 },
    ],
  },
  {
    id: 'uai-vina-del-mar',
    universityId: 'uai',
    name: 'Campus Viña del Mar',
    city: 'Viña del Mar',
    meetingPoints: [
      { id: 'mp-uai-vina-parque', name: 'Parque Tecnológico', latitude: -33.0242, longitude: -71.5511 },
      { id: 'mp-uai-vina-gimnasio', name: 'Entrada Gimnasio', latitude: -33.0229, longitude: -71.5494 },
    ],
  },
  {
    id: 'udd-las-condes',
    universityId: 'udd',
    name: 'Campus Las Condes',
    city: 'Santiago',
    meetingPoints: [
      { id: 'mp-udd-las-principal', name: 'Acceso principal Av. La Plaza', latitude: -33.4012, longitude: -70.5093 },
      { id: 'mp-udd-las-plaza', name: 'Plaza Central', latitude: -33.4002, longitude: -70.5077 },
    ],
  },
  {
    id: 'udd-concepcion',
    universityId: 'udd',
    name: 'Campus Concepción',
    city: 'Concepción',
    meetingPoints: [
      { id: 'mp-udd-con-hospital', name: 'Hospital Clínico UDD', latitude: -36.8262, longitude: -73.0485 },
      { id: 'mp-udd-con-parque', name: 'Parque Empresarial', latitude: -36.8236, longitude: -73.0508 },
    ],
  },
  {
    id: 'uandes-san-carlos',
    universityId: 'uandes',
    name: 'Campus San Carlos de Apoquindo',
    city: 'Santiago',
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

export type UniversityId = 'uai' | 'udd' | 'uandes';

export type CampusId = 'uai-penalolen' | 'udd-las-condes' | 'udd-concepcion' | 'uandes-san-carlos';

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
  commune: string;
  address: string;
  latitude: number;
  longitude: number;
  tags: Array<'conductor' | 'pasajero'>;
  bounds: {
    northEast: { latitude: number; longitude: number };
    southWest: { latitude: number; longitude: number };
  };
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
    commune: 'Peñalolén',
    address: 'Diagonal Las Torres 2640, Peñalolén',
    latitude: -33.4884163,
    longitude: -70.5094354,
    tags: ['conductor', 'pasajero'],
    bounds: {
      northEast: { latitude: -33.4825, longitude: -70.5038 },
      southWest: { latitude: -33.4943, longitude: -70.5151 },
    },
    meetingPoints: [
      { id: 'mp-uai-pen-entradaprin', name: 'Entrada principal Peñalolén', latitude: -33.4889, longitude: -70.5099 },
      { id: 'mp-uai-pen-estacionamientos', name: 'Estacionamientos Sur', latitude: -33.4899, longitude: -70.5086 },
      { id: 'mp-uai-pen-biblioteca', name: 'Acceso Biblioteca', latitude: -33.4879, longitude: -70.5106 },
    ],
  },
  {
    id: 'udd-las-condes',
    universityId: 'udd',
    name: 'Campus Las Condes',
    city: 'Santiago',
    commune: 'Las Condes',
    address: 'Avenida Plaza 680, Las Condes',
    latitude: -33.4052258,
    longitude: -70.5416861,
    tags: ['conductor', 'pasajero'],
    bounds: {
      northEast: { latitude: -33.4015, longitude: -70.5365 },
      southWest: { latitude: -33.409, longitude: -70.5471 },
    },
    meetingPoints: [
      { id: 'mp-udd-las-principal', name: 'Acceso principal Av. La Plaza', latitude: -33.4052, longitude: -70.5412 },
      { id: 'mp-udd-las-plaza', name: 'Plaza Central', latitude: -33.4054, longitude: -70.5423 },
    ],
  },
  {
    id: 'udd-concepcion',
    universityId: 'udd',
    name: 'Campus Concepción',
    city: 'Concepción',
    commune: 'Concepción',
    address: 'Ainavillo 456, Concepción',
    latitude: -36.8212758,
    longitude: -73.0366801,
    tags: ['conductor', 'pasajero'],
    bounds: {
      northEast: { latitude: -36.817, longitude: -73.032 },
      southWest: { latitude: -36.8255, longitude: -73.041 },
    },
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
    commune: 'Las Condes',
    address: 'Av. Mons. Álvaro del Portillo 12455, Las Condes',
    latitude: -33.4039484,
    longitude: -70.5084224,
    tags: ['conductor', 'pasajero'],
    bounds: {
      northEast: { latitude: -33.4002, longitude: -70.5035 },
      southWest: { latitude: -33.4076, longitude: -70.5135 },
    },
    meetingPoints: [
      { id: 'mp-uandes-san-entrada', name: 'Entrada San Carlos', latitude: -33.4032, longitude: -70.5099 },
      { id: 'mp-uandes-san-estacionamientos', name: 'Estacionamientos Superiores', latitude: -33.4051, longitude: -70.5073 },
      { id: 'mp-uandes-san-gimnasio', name: 'Gimnasio universitario', latitude: -33.404, longitude: -70.506 },
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

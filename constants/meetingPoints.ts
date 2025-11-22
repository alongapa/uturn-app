export type MeetingPoint = {
  id: string;
  nombre: string;
  tipo: 'meeting-point' | 'campus';
  universidad: string;
  coordenadas: {
    latitude: number;
    longitude: number;
  };
};

export const meetingPoints: MeetingPoint[] = [
  {
    id: 'mp-1',
    nombre: 'UAI Peñalolén',
    tipo: 'campus',
    universidad: 'UAI',
    coordenadas: { latitude: -33.489, longitude: -70.497 },
  },
  {
    id: 'mp-2',
    nombre: 'UAI Viña',
    tipo: 'campus',
    universidad: 'UAI',
    coordenadas: { latitude: -33.026, longitude: -71.538 },
  },
  {
    id: 'mp-3',
    nombre: 'UDD Las Condes',
    tipo: 'campus',
    universidad: 'UDD',
    coordenadas: { latitude: -33.405, longitude: -70.542 },
  },
  {
    id: 'mp-4',
    nombre: 'UAndes San Carlos',
    tipo: 'campus',
    universidad: 'UAndes',
    coordenadas: { latitude: -33.385, longitude: -70.509 },
  },
  {
    id: 'mp-5',
    nombre: 'Metro Grecia',
    tipo: 'meeting-point',
    universidad: 'UAI',
    coordenadas: { latitude: -33.463, longitude: -70.569 },
  },
  {
    id: 'mp-6',
    nombre: 'Entrada principal Peñalolén',
    tipo: 'meeting-point',
    universidad: 'UAI',
    coordenadas: { latitude: -33.4885, longitude: -70.4975 },
  },
  {
    id: 'mp-7',
    nombre: 'Metro Tobalaba',
    tipo: 'meeting-point',
    universidad: 'UAI',
    coordenadas: { latitude: -33.423, longitude: -70.605 },
  },
];

export type Campus = {
  id: string;
  universidad: 'UAI' | 'UDD' | 'UAndes' | 'Otro';
  nombre: string;
  ciudad: string;
  direccion: string;
  coordenadas: {
    latitude: number;
    longitude: number;
  };
};

export const campuses: Campus[] = [
  {
    id: 'campus-uai-penalolen',
    universidad: 'UAI',
    nombre: 'Campus Peñalolén',
    ciudad: 'Santiago',
    direccion: 'Diagonales 10000, Peñalolén',
    coordenadas: { latitude: -33.489, longitude: -70.497 },
  },
  {
    id: 'campus-uai-vina',
    universidad: 'UAI',
    nombre: 'Campus Viña del Mar',
    ciudad: 'Viña del Mar',
    direccion: 'Padre Hurtado 750, Viña del Mar',
    coordenadas: { latitude: -33.026, longitude: -71.538 },
  },
  {
    id: 'campus-udd-las-condes',
    universidad: 'UDD',
    nombre: 'UDD Las Condes',
    ciudad: 'Santiago',
    direccion: 'Av. Plaza 680, Las Condes',
    coordenadas: { latitude: -33.405, longitude: -70.542 },
  },
  {
    id: 'campus-uandes-san-carlos',
    universidad: 'UAndes',
    nombre: 'UAndes San Carlos',
    ciudad: 'Santiago',
    direccion: 'Mons. Álvaro del Portillo 12, Las Condes',
    coordenadas: { latitude: -33.385, longitude: -70.509 },
  },
];

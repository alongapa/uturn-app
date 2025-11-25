import { CAMPUSES } from './campuses';

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

const campusPoints: MeetingPoint[] = CAMPUSES.map((campus) => ({
  id: campus.id,
  nombre: campus.name,
  tipo: 'campus',
  universidad: campus.universityId.toUpperCase(),
  coordenadas: { latitude: campus.latitude, longitude: campus.longitude },
}));

const meetingPointRows: MeetingPoint[] = CAMPUSES.flatMap((campus) =>
  campus.meetingPoints.map((point) => ({
    id: point.id,
    nombre: point.name,
    tipo: 'meeting-point',
    universidad: campus.universityId.toUpperCase(),
    coordenadas: { latitude: point.latitude, longitude: point.longitude },
  }))
);

export const meetingPoints: MeetingPoint[] = [...campusPoints, ...meetingPointRows];

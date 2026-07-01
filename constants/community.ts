import type { Organization, Announcement } from '@/models/types';

/** Fecha pasada relativa a "ahora" (para que los anuncios semilla se vean recientes). */
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();

export const SEED_ORGANIZATIONS: Organization[] = [
  {
    id: 'org_fed',
    name: 'Federación de Estudiantes UAI',
    shortName: 'FEUAI',
    type: 'federacion',
    icon: 'megaphone',
    createdAt: hoursAgo(24 * 30),
  },
  {
    id: 'org_ceic',
    name: 'Centro de Alumnos Ing. Comercial',
    shortName: 'CEIC',
    type: 'centro_alumnos',
    icon: 'briefcase',
    createdAt: hoursAgo(24 * 20),
  },
  {
    id: 'org_bienestar',
    name: 'Bienestar Estudiantil UAI',
    shortName: 'Bienestar',
    type: 'bienestar',
    icon: 'heart',
    createdAt: hoursAgo(24 * 15),
  },
  {
    id: 'org_deportes',
    name: 'Dirección de Deportes UAI',
    shortName: 'Deportes',
    type: 'deportes',
    icon: 'barbell',
    createdAt: hoursAgo(24 * 10),
  },
];

export const SEED_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'ann1',
    organizationId: 'org_fed',
    organizationName: 'Federación de Estudiantes UAI',
    organizationShortName: 'FEUAI',
    organizationIcon: 'megaphone',
    title: 'Elecciones de Federación este viernes',
    body: 'Vota por tu lista este viernes de 9:00 a 18:00 en el hall central. Trae tu credencial UAI. ¡Tu voto define el próximo año!',
    category: 'anuncio',
    linkUrl: 'https://www.instagram.com/feuai',
    linkLabel: 'Ver listas en Instagram',
    publishedAt: hoursAgo(3),
    pinned: true,
  },
  {
    id: 'ann2',
    organizationId: 'org_ceic',
    organizationName: 'Centro de Alumnos Ing. Comercial',
    organizationShortName: 'CEIC',
    organizationIcon: 'briefcase',
    title: 'Charla: cómo conseguir tu práctica',
    body: 'Ex alumnos que hoy trabajan en banca, consultoría y startups cuentan cómo consiguieron su práctica. Miércoles 18:00, Auditorio B.',
    category: 'evento',
    linkUrl: 'https://forms.gle/ejemplo',
    linkLabel: 'Inscríbete aquí',
    publishedAt: hoursAgo(8),
  },
  {
    id: 'ann3',
    organizationId: 'org_deportes',
    organizationName: 'Dirección de Deportes UAI',
    organizationShortName: 'Deportes',
    organizationIcon: 'barbell',
    title: 'Torneo interfacultades de fútbol',
    body: 'Inscribe a tu equipo (7 jugadores) antes del domingo. Premios para los 3 primeros lugares y asado de cierre incluido.',
    category: 'evento',
    publishedAt: hoursAgo(20),
  },
  {
    id: 'ann4',
    organizationId: 'org_bienestar',
    organizationName: 'Bienestar Estudiantil UAI',
    organizationShortName: 'Bienestar',
    organizationIcon: 'heart',
    title: '20% de descuento en la librería del campus',
    body: 'Durante toda esta semana, presenta tu credencial UAI y obtén 20% de descuento en apuntes, libros y materiales.',
    category: 'descuento',
    publishedAt: hoursAgo(28),
  },
  {
    id: 'ann5',
    organizationId: 'org_ceic',
    organizationName: 'Centro de Alumnos Ing. Comercial',
    organizationShortName: 'CEIC',
    organizationIcon: 'briefcase',
    title: 'Beca de apuntes para primer año',
    body: 'Postula a la beca de apuntes del centro de alumnos. Cubre el 100% del material del primer semestre para quienes lo necesiten.',
    category: 'promocion',
    publishedAt: hoursAgo(48),
  },
];

export function getAnnouncementById(id?: string, announcements: Announcement[] = SEED_ANNOUNCEMENTS): Announcement | undefined {
  return announcements.find((a) => a.id === id);
}

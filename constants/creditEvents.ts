import type { Ionicons } from '@expo/vector-icons';

export interface CreditEvent {
  id: string;
  title: string;
  partner: string;
  category: 'fiesta' | 'concierto' | 'deporte' | 'comida' | 'cultura';
  dateLabel: string;
  creditsCost: number;
  spotsLeft: number;
  icon: keyof typeof Ionicons.glyphMap;
  detail: string;
}

/** Eventos próximos canjeables con créditos UTurn. */
export const CREDIT_EVENTS: CreditEvent[] = [
  {
    id: 'ev1',
    title: 'Fiesta de Bienvenida UAI',
    partner: 'Bar La Peña',
    category: 'fiesta',
    dateLabel: 'Viernes 21:00',
    creditsCost: 150,
    spotsLeft: 12,
    icon: 'sparkles',
    detail: 'Entrada liberada + primer trago cortesía. Lista de amigos UTurn en la puerta.',
  },
  {
    id: 'ev2',
    title: 'Tocata Indie en el Campus',
    partner: 'Centro de Alumnos',
    category: 'concierto',
    dateLabel: 'Sábado 19:30',
    creditsCost: 80,
    spotsLeft: 30,
    icon: 'musical-notes',
    detail: 'Acceso preferente a primera fila. Bandas locales en el patio central.',
  },
  {
    id: 'ev3',
    title: 'Asado interfacultades',
    partner: 'Club Deportivo UAI',
    category: 'comida',
    dateLabel: 'Domingo 13:00',
    creditsCost: 120,
    spotsLeft: 8,
    icon: 'restaurant',
    detail: 'Almuerzo completo + bebida. Punto de encuentro en cancha sintética.',
  },
  {
    id: 'ev4',
    title: 'Torneo de Pádel Relámpago',
    partner: 'Gimnasio Campus',
    category: 'deporte',
    dateLabel: 'Próximo martes 18:00',
    creditsCost: 60,
    spotsLeft: 16,
    icon: 'tennisball',
    detail: 'Inscripción de pareja incluida, arriendo de cancha sin costo adicional.',
  },
  {
    id: 'ev5',
    title: 'Noche de Cine al Aire Libre',
    partner: 'Bienestar Estudiantil',
    category: 'cultura',
    dateLabel: 'Jueves 20:00',
    creditsCost: 40,
    spotsLeft: 50,
    icon: 'film',
    detail: 'Snack y bebida incluidos. Trae tu manta, el resto lo ponemos nosotros.',
  },
];

export function getCreditEventById(id?: string): CreditEvent | undefined {
  return CREDIT_EVENTS.find((e) => e.id === id);
}

import type { ReputationTier } from '@/models/types';

export interface TutorSubject {
  name: string;
  grade: number; // nota con la que aprobó el ramo (verifica la expertise)
}

export interface TutorAvailability {
  day: string;
  slots: string[];
}

export interface Tutor {
  id: string;
  name: string;
  university: string;
  tier: ReputationTier;
  rating: number;
  sessionCount: number;
  approvalRate: number; // % de alumnos que aprobaron tras asesorarse
  pricePerHour: number;
  bio: string;
  subjects: TutorSubject[];
  availability: TutorAvailability[];
  modality: 'presencial' | 'online' | 'ambas';
}

export const TUTORS: Tutor[] = [
  {
    id: 'tut1',
    name: 'Martín Reyes',
    university: 'Universidad Adolfo Ibáñez',
    tier: 'elite',
    rating: 4.9,
    sessionCount: 214,
    approvalRate: 96,
    pricePerHour: 8000,
    bio: 'Ingeniería Comercial. Paso Cálculo y Álgebra como ayudante hace 3 años. Explico desde cero y con ejercicios de pruebas reales.',
    subjects: [
      { name: 'Cálculo I', grade: 6.8 },
      { name: 'Cálculo II', grade: 6.5 },
      { name: 'Álgebra', grade: 7.0 },
    ],
    availability: [
      { day: 'Lunes', slots: ['18:00', '19:00', '20:00'] },
      { day: 'Miércoles', slots: ['19:00', '20:00'] },
      { day: 'Sábado', slots: ['10:00', '11:00', '12:00'] },
    ],
    modality: 'ambas',
  },
  {
    id: 'tut2',
    name: 'Sofía Valdés',
    university: 'Universidad Adolfo Ibáñez',
    tier: 'confiable',
    rating: 5.0,
    sessionCount: 132,
    approvalRate: 98,
    pricePerHour: 10000,
    bio: 'Derecho, 4° año. Asesoro Derecho Civil y Constitucional con foco en cómo redactar y argumentar en pruebas.',
    subjects: [
      { name: 'Derecho Civil', grade: 6.9 },
      { name: 'Derecho Constitucional', grade: 6.7 },
    ],
    availability: [
      { day: 'Martes', slots: ['17:00', '18:00'] },
      { day: 'Jueves', slots: ['18:00', '19:00', '20:00'] },
    ],
    modality: 'online',
  },
  {
    id: 'tut3',
    name: 'Felipe Araya',
    university: 'Universidad Adolfo Ibáñez',
    tier: 'confiable',
    rating: 4.8,
    sessionCount: 98,
    approvalRate: 93,
    pricePerHour: 7500,
    bio: 'Ingeniería Comercial. Macro y Microeconomía explicadas con ejemplos del día a día. Te dejo guías propias.',
    subjects: [
      { name: 'Macroeconomía', grade: 6.6 },
      { name: 'Microeconomía', grade: 6.8 },
    ],
    availability: [
      { day: 'Lunes', slots: ['21:00'] },
      { day: 'Viernes', slots: ['16:00', '17:00', '18:00'] },
    ],
    modality: 'ambas',
  },
  {
    id: 'tut4',
    name: 'Catalina Núñez',
    university: 'Universidad Adolfo Ibáñez',
    tier: 'habitual',
    rating: 4.7,
    sessionCount: 41,
    approvalRate: 90,
    pricePerHour: 6500,
    bio: 'Ingeniería Civil. Programación y Estadística. Te ayudo a entender la lógica, no a memorizar.',
    subjects: [
      { name: 'Programación', grade: 6.5 },
      { name: 'Estadística', grade: 6.4 },
    ],
    availability: [
      { day: 'Miércoles', slots: ['16:00', '17:00'] },
      { day: 'Domingo', slots: ['11:00', '12:00', '17:00'] },
    ],
    modality: 'online',
  },
];

export function getTutorById(id?: string): Tutor | undefined {
  return TUTORS.find((t) => t.id === id);
}

/** Todos los ramos únicos del catálogo, para filtros. */
export function getAllSubjects(): string[] {
  const set = new Set<string>();
  for (const t of TUTORS) for (const s of t.subjects) set.add(s.name);
  return [...set].sort();
}

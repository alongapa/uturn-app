import type { Ionicons } from '@expo/vector-icons';

export interface CreditEarningMethod {
  id: string;
  title: string;
  description: string;
  credits: string; // texto: puede ser un rango o "por viaje"
  icon: keyof typeof Ionicons.glyphMap;
}

/** Formas de ganar créditos UTurn dentro de la app. */
export const CREDIT_EARNING_METHODS: CreditEarningMethod[] = [
  {
    id: 'earn1',
    title: 'Da una asesoría',
    description: 'Cada hora de asesoría que dictas como tutor suma créditos a tu cuenta.',
    credits: '+40 por hora',
    icon: 'school',
  },
  {
    id: 'earn2',
    title: 'Completa un viaje como conductor',
    description: 'Publica y completa viajes con pasajeros confirmados.',
    credits: '+10 por viaje',
    icon: 'car-sport',
  },
  {
    id: 'earn3',
    title: 'Viaja como pasajero puntual',
    description: 'Llega a tiempo al punto de encuentro y califica bien al conductor.',
    credits: '+5 por viaje',
    icon: 'walk',
  },
  {
    id: 'earn4',
    title: 'Verifica tu cuenta',
    description: 'Sube tu credencial UAI (InfoAlumno) y queda validada por el equipo.',
    credits: '+50 una vez',
    icon: 'shield-checkmark',
  },
  {
    id: 'earn5',
    title: 'Mantén buena reputación',
    description: '10 viajes seguidos con 5 estrellas te dan un bono de constancia.',
    credits: '+30 bono',
    icon: 'trophy',
  },
  {
    id: 'earn6',
    title: 'Invita a un amigo',
    description: 'Cuando tu invitado se verifica y completa su primer viaje o asesoría.',
    credits: '+25 por amigo',
    icon: 'people',
  },
];

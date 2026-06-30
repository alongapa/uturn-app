import React, { createContext, useContext, useReducer, useMemo } from 'react';

import type { Trip, Booking, TutoringSession, Benefit, User, ReputationTier } from '@/models/types';
import { RECOMMENDED_TRIPS } from '@/constants/mock-data';

interface AppState {
  trips: Trip[];
  bookings: Booking[];
  tutoringSessions: TutoringSession[];
  benefits: Benefit[];
  activeTrip: Trip | null;
  /** Padrón de cuentas registradas en la app (soporte multi-usuario). */
  registeredUsers: User[];
  /** IDs de eventos canjeados con créditos UTurn (evita doble canje). */
  redeemedEventIds: string[];
}

/** Construye un usuario completo con valores por defecto razonables. */
function buildUser(
  partial: Pick<User, 'id' | 'name' | 'email' | 'university'> &
    Partial<Pick<User, 'role' | 'rating' | 'tier' | 'completedTripsAsDriver' | 'completedTripsAsPassenger' | 'completedTutoringSessions' | 'uturnCredits' | 'carModel'>>
): User {
  const rating = partial.rating ?? 4.6;
  return {
    role: 'both',
    rating,
    reputationScore: {
      overall: rating, punctuality: rating, drivingQuality: rating,
      price: rating, disposition: rating, asPassenger: rating, asTutor: 0,
    },
    tier: (partial.tier ?? 'habitual') as ReputationTier,
    completedTripsAsDriver: partial.completedTripsAsDriver ?? 0,
    completedTripsAsPassenger: partial.completedTripsAsPassenger ?? 0,
    completedTutoringSessions: partial.completedTutoringSessions ?? 0,
    badges: [],
    uturnCredits: partial.uturnCredits ?? 0,
    verificationStatus: 'verified',
    ...partial,
  };
}

const SEED_USERS: User[] = [
  buildUser({ id: 'u1', name: 'Constanza Vidal', email: 'constanza@alumnos.uai.cl', university: 'Universidad Adolfo Ibáñez', tier: 'elite', rating: 4.9, completedTripsAsDriver: 182, carModel: 'Mazda 3 2021', uturnCredits: 340 }),
  buildUser({ id: 'u2', name: 'Ignacio López', email: 'ignacio@udd.cl', university: 'Universidad del Desarrollo', tier: 'confiable', rating: 4.8, completedTripsAsDriver: 154, carModel: 'Hyundai Tucson 2019', uturnCredits: 210 }),
  buildUser({ id: 'u3', name: 'María Abarca', email: 'maria@miuandes.cl', university: 'Universidad de los Andes', tier: 'habitual', rating: 4.6, completedTripsAsDriver: 47, uturnCredits: 90 }),
];

type Action =
  | { type: 'ADD_TRIP'; payload: Trip }
  | { type: 'CANCEL_TRIP'; payload: string }
  | { type: 'ADD_BOOKING'; payload: Booking }
  | { type: 'UPDATE_BOOKING_STATUS'; payload: { id: string; status: Booking['status'] } }
  | { type: 'ADD_TUTORING_SESSION'; payload: TutoringSession }
  | { type: 'UPDATE_TUTORING_STATUS'; payload: { id: string; status: TutoringSession['status'] } }
  | { type: 'SET_ACTIVE_TRIP'; payload: Trip | null }
  | { type: 'REGISTER_USER'; payload: User }
  | { type: 'UPDATE_USER'; payload: { id: string; updates: Partial<User> } }
  | { type: 'REDEEM_EVENT'; payload: string };

const INITIAL_BENEFITS: Benefit[] = [
  {
    id: 'b1',
    partner: 'Bar La Peña',
    description: 'Lista de amigos en fiestas universitarias',
    category: 'eventos',
    requiredTier: 'habitual',
    icon: '🍺',
    discount: 'Lista gratis',
    detail: 'Presenta tu perfil UTurn en la entrada para acceder a la lista de amigos sin costo.',
  },
  {
    id: 'b2',
    partner: 'Club Universitario',
    description: 'Entrada preferente a eventos de carrera',
    category: 'eventos',
    requiredTier: 'confiable',
    icon: '🎉',
    discount: '40% off',
    detail: 'Accede a todos los eventos universitarios con descuento especial.',
  },
  {
    id: 'b3',
    partner: 'Fotocopiadora Campus',
    description: 'Descuento en impresión y apuntes',
    category: 'academico',
    requiredTier: 'habitual',
    icon: '📚',
    discount: '20% off',
    detail: 'Descuento en impresiones, apuntes y encuadernados en el campus.',
  },
  {
    id: 'b4',
    partner: 'Cafetería UAI',
    description: 'Prioridad en fila de almuerzo',
    category: 'comida',
    requiredTier: 'confiable',
    icon: '🍽️',
    discount: 'Fila preferente',
    detail: 'Acceso a la fila preferente en horario de almuerzo de 12:00 a 14:00.',
  },
  {
    id: 'b5',
    partner: 'Gimnasio Campus',
    description: 'Acceso a precio estudiante en horario libre',
    category: 'deporte',
    requiredTier: 'elite',
    icon: '🏋️',
    discount: 'Gratis',
    detail: 'Acceso ilimitado al gimnasio del campus para usuarios Élite.',
  },
  {
    id: 'b6',
    partner: 'Bar Tocata',
    description: 'Descuento en tragos los viernes',
    category: 'entretenimiento',
    requiredTier: 'habitual',
    icon: '🎵',
    discount: '2x1 tragos',
    detail: 'Todos los viernes 2x1 en tragos para usuarios UTurn Habitual o superior.',
  },
];

const initialState: AppState = {
  trips: RECOMMENDED_TRIPS as Trip[],
  bookings: [],
  tutoringSessions: [],
  benefits: INITIAL_BENEFITS,
  activeTrip: null,
  registeredUsers: SEED_USERS,
  redeemedEventIds: [],
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ADD_TRIP':
      return { ...state, trips: [action.payload, ...state.trips] };
    case 'CANCEL_TRIP':
      return {
        ...state,
        trips: state.trips.map((t) =>
          t.id === action.payload ? { ...t, status: 'cancelled' as const } : t
        ),
      };
    case 'ADD_BOOKING':
      return { ...state, bookings: [action.payload, ...state.bookings] };
    case 'UPDATE_BOOKING_STATUS':
      return {
        ...state,
        bookings: state.bookings.map((b) =>
          b.id === action.payload.id ? { ...b, status: action.payload.status } : b
        ),
      };
    case 'ADD_TUTORING_SESSION':
      return { ...state, tutoringSessions: [action.payload, ...state.tutoringSessions] };
    case 'UPDATE_TUTORING_STATUS':
      return {
        ...state,
        tutoringSessions: state.tutoringSessions.map((s) =>
          s.id === action.payload.id ? { ...s, status: action.payload.status } : s
        ),
      };
    case 'SET_ACTIVE_TRIP':
      return { ...state, activeTrip: action.payload };
    case 'REGISTER_USER': {
      const exists = state.registeredUsers.some((u) => u.email === action.payload.email);
      if (exists) {
        return {
          ...state,
          registeredUsers: state.registeredUsers.map((u) =>
            u.email === action.payload.email ? { ...u, ...action.payload } : u
          ),
        };
      }
      return { ...state, registeredUsers: [...state.registeredUsers, action.payload] };
    }
    case 'UPDATE_USER':
      return {
        ...state,
        registeredUsers: state.registeredUsers.map((u) =>
          u.id === action.payload.id ? { ...u, ...action.payload.updates } : u
        ),
      };
    case 'REDEEM_EVENT':
      return { ...state, redeemedEventIds: [...state.redeemedEventIds, action.payload] };
    default:
      return state;
  }
}

interface AppStateContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const AppStateContext = createContext<AppStateContextValue | undefined>(undefined);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState debe usarse dentro de AppStateProvider');
  return ctx;
}

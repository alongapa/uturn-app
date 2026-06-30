import type { CampusId } from '@/constants/campuses';

export type StarRating = 1 | 2 | 3 | 4 | 5;

export type ReputationTier = 'novato' | 'habitual' | 'confiable' | 'elite';

export type UserRole = 'driver' | 'passenger' | 'both';

export interface ReputationScore {
  overall: number;
  punctuality: number;
  drivingQuality: number;
  price: number;
  disposition: number;
  asPassenger: number;
  asTutor: number;
}

export interface Badge {
  id: string;
  label: string;
  icon: string;
  earnedAt: string;
}

export interface PenaltyState {
  lateCancellationsCount: number;
  lastLateCancellationAt?: string;
  currentBlockUntil?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  university: string;
  role: UserRole;
  rating: number;
  reputationScore: ReputationScore;
  tier: ReputationTier;
  completedTripsAsDriver: number;
  completedTripsAsPassenger: number;
  completedTutoringSessions: number;
  badges: Badge[];
  photoUrl?: string;
  carModel?: string;
  carYear?: string;
  bio?: string;
  uturnCredits: number;
  penaltyState?: PenaltyState;
  verificationStatus?: 'unverified' | 'pending' | 'verified' | 'rejected';
  isAdmin?: boolean;
}

export interface Trip {
  id: string;
  driverId: string;
  driverName: string;
  driverRating?: number;
  driverTier?: ReputationTier;
  dest: string;
  meetPoint: string;
  price: number;
  seats: number;
  departAt: string;
  routeNotes?: string;
  originCampusId: CampusId;
  destinationCampusId?: CampusId;
  meetingPointId: string;
  status?: 'active' | 'completed' | 'cancelled';
}

export interface Booking {
  id: string;
  tripId: string;
  passengerId: string;
  passengerName: string;
  status: 'reserved' | 'cancelled' | 'completed';
  createdAt: string;
  seat?: string;
}

export interface Rating {
  id: string;
  fromId: string;
  toId: string;
  tripId: string;
  stars: StarRating;
  note?: string;
  categories?: {
    punctuality?: StarRating;
    drivingQuality?: StarRating;
    price?: StarRating;
    disposition?: StarRating;
  };
  createdAt: string;
}

export interface TutoredSubject {
  subjectId: string;
  subjectName: string;
  grade: number;
  verified: boolean;
}

export interface TimeSlot {
  start: string;
  end: string;
}

export interface WeeklyAvailability {
  monday: TimeSlot[];
  tuesday: TimeSlot[];
  wednesday: TimeSlot[];
  thursday: TimeSlot[];
  friday: TimeSlot[];
  saturday: TimeSlot[];
  sunday: TimeSlot[];
}

export interface TutorProfile {
  userId: string;
  subjects: TutoredSubject[];
  hourlyRate: number;
  availability: WeeklyAvailability;
  sessionCount: number;
  approvalRate: number;
  rating: number;
  bio: string;
}

export interface TutoringSession {
  id: string;
  tutorId: string;
  tutorName: string;
  studentId: string;
  studentName: string;
  subjectName: string;
  scheduledAt: string;
  durationMinutes: number;
  price: number;
  paidWithCredits: boolean;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  rating?: StarRating;
  note?: string;
}

export interface Benefit {
  id: string;
  partner: string;
  description: string;
  category: 'eventos' | 'comida' | 'academico' | 'entretenimiento' | 'deporte';
  requiredTier: ReputationTier;
  icon: string;
  discount?: string;
  detail: string;
}

export const TIER_LABELS: Record<ReputationTier, string> = {
  novato: 'Novato',
  habitual: 'Habitual',
  confiable: 'Confiable',
  elite: 'Élite',
};

export const TIER_COLORS: Record<ReputationTier, string> = {
  novato: '#94A3B8',
  habitual: '#3B82F6',
  confiable: '#8B5CF6',
  elite: '#F59E0B',
};

export const TIER_MIN_TRIPS: Record<ReputationTier, number> = {
  novato: 0,
  habitual: 20,
  confiable: 50,
  elite: 100,
};

export function getTierForUser(trips: number, rating: number): ReputationTier {
  if (trips >= 100 && rating >= 4.8) return 'elite';
  if (trips >= 50 && rating >= 4.5) return 'confiable';
  if (trips >= 20 && rating >= 4.2) return 'habitual';
  return 'novato';
}

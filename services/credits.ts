import type { Redemption, RedemptionStatus } from '@/models/unities';

// Reglas de créditos Unities, ligadas a los pagos a tiempo y rachas de la Sesión 1:
// cada pago confirmado dentro del plazo suma créditos y las rachas dan bono extra.
export const CREDITS_PER_PAID_TRIP = 25;
export const STREAK_TRIP_TARGET = 3; // cada N pagos a tiempo seguidos hay bono
export const STREAK_BONUS_CREDITS = 50;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const generateRedemptionCode = () => {
  const block = (length: number) =>
    Array.from({ length }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  return `UT-${block(4)}-${block(4)}`;
};

export const getRedemptionStatus = (redemption: Redemption, now: Date = new Date()): RedemptionStatus => {
  if (redemption.estado === 'canjeado') return 'canjeado';
  if (new Date(redemption.expiraAt).getTime() < now.getTime()) return 'expirado';
  return 'disponible';
};

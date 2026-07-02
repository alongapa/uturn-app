import type { Redemption, RedemptionStatus } from '@/models/uturn';

// Reglas de créditos (ligadas a los pagos a tiempo y rachas de la Sesión 1)
export const CREDITS_PER_PAID_TRIP = 25;
export const STREAK_TRIP_TARGET = 3; // cada N viajes pagados seguidos hay bono
export const STREAK_BONUS_CREDITS = 50;
export const PAYMENT_WINDOW_HOURS = 48;

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

export const formatCredits = (amount: number) => `${amount.toLocaleString('es-CL')} créditos`;

export const formatCLP = (amount: number) => `$${amount.toLocaleString('es-CL')}`;

export const formatDeadline = (isoDate: string, now: Date = new Date()) => {
  const deadline = new Date(isoDate);
  if (Number.isNaN(deadline.getTime())) return 'Plazo no disponible';
  const diffMs = deadline.getTime() - now.getTime();
  if (diffMs <= 0) return 'Pago vencido';
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 1) return 'Vence en menos de 1 h';
  if (hours < 48) return `Vence en ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Vence en ${days} días`;
};

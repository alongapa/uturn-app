import type { PaymentPenaltyState, PenaltyState, User } from '@/models/types';

export type { PaymentPenaltyState };

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_IN_MS = 30 * DAY_IN_MS;

// Reglas de negocio: 3/6/9 cancelaciones tardías → bloqueo de 1/3/7 días.
const BLOCK_RULES: { threshold: number; durationMs: number }[] = [
  { threshold: 3, durationMs: DAY_IN_MS },
  { threshold: 6, durationMs: 3 * DAY_IN_MS },
  { threshold: 9, durationMs: 7 * DAY_IN_MS },
];

export const EMPTY_PENALTY_STATE: PenaltyState = { lateCancellationsCount: 0 };

const getBlockDurationForCount = (count: number): number | null => {
  const rule = BLOCK_RULES.find((entry) => entry.threshold === count);
  return rule ? rule.durationMs : null;
};

export function isBlocked(state: PenaltyState | undefined, now: Date): boolean {
  const blockUntil = state?.currentBlockUntil;
  if (!blockUntil) {
    return false;
  }

  return new Date(blockUntil).getTime() > now.getTime();
}

export function getBlockedUntil(state: PenaltyState | undefined, now: Date): Date | null {
  return isBlocked(state, now) ? new Date(state!.currentBlockUntil!) : null;
}

/**
 * Si pasaron más de 30 días desde la última cancelación tardía, el contador
 * vuelve a cero. Devuelve el mismo objeto si no hay nada que resetear.
 */
export function resetExpiredPenalties(state: PenaltyState, now: Date): PenaltyState {
  if (!state.lastLateCancellationAt || state.lateCancellationsCount === 0) {
    return state;
  }

  const lastLate = new Date(state.lastLateCancellationAt).getTime();
  if (now.getTime() - lastLate <= THIRTY_DAYS_IN_MS) {
    return state;
  }

  return {
    lateCancellationsCount: 0,
    currentBlockUntil: isBlocked(state, now) ? state.currentBlockUntil : undefined,
  };
}

export function applyLateCancellation(state: PenaltyState | undefined, now: Date): PenaltyState {
  const prevState = resetExpiredPenalties(state ?? EMPTY_PENALTY_STATE, now);
  const nowMs = now.getTime();

  const nextCount = prevState.lateCancellationsCount + 1;
  const blockDuration = getBlockDurationForCount(nextCount);

  let currentBlockUntil: string | undefined;
  if (blockDuration) {
    currentBlockUntil = new Date(nowMs + blockDuration).toISOString();
  } else if (prevState.currentBlockUntil && isBlocked(prevState, now)) {
    currentBlockUntil = prevState.currentBlockUntil;
  }

  return {
    lateCancellationsCount: nextCount,
    lastLateCancellationAt: now.toISOString(),
    currentBlockUntil,
  };
}

export function isUserBlocked(user: User, now: Date): boolean {
  return isBlocked(user.penaltyState, now);
}

export function registerLateCancellation(user: User, now: Date): User {
  return {
    ...user,
    penaltyState: applyLateCancellation(user.penaltyState, now),
  };
}

// --- Strikes por impago (independientes de las cancelaciones tardías) ---
// Cada pago con plazo vencido suma 1 strike; al llegar a 3 el usuario queda
// baneado de los turnos (no puede reservar) por 2 días y el contador se reinicia.

export const PAYMENT_STRIKES_FOR_BAN = 3;
export const PAYMENT_BAN_DURATION_MS = 2 * DAY_IN_MS;

export const EMPTY_PAYMENT_PENALTY: PaymentPenaltyState = { paymentStrikesCount: 0 };

export function registerPaymentStrike(
  state: PaymentPenaltyState | undefined,
  now: Date
): PaymentPenaltyState {
  const prev = state ?? EMPTY_PAYMENT_PENALTY;
  const nextCount = (prev.paymentStrikesCount ?? 0) + 1;

  if (nextCount >= PAYMENT_STRIKES_FOR_BAN) {
    return {
      paymentStrikesCount: 0,
      lastPaymentStrikeAt: now.toISOString(),
      paymentBanUntil: new Date(now.getTime() + PAYMENT_BAN_DURATION_MS).toISOString(),
    };
  }

  return {
    ...prev,
    paymentStrikesCount: nextCount,
    lastPaymentStrikeAt: now.toISOString(),
  };
}

export function isPaymentBanned(state: PaymentPenaltyState | undefined, now: Date): boolean {
  const banUntil = state?.paymentBanUntil;
  if (!banUntil) {
    return false;
  }
  return new Date(banUntil).getTime() > now.getTime();
}

export function getPaymentBanRemainingMs(
  state: PaymentPenaltyState | undefined,
  now: Date
): number {
  const banUntil = state?.paymentBanUntil;
  if (!banUntil) {
    return 0;
  }
  return Math.max(0, new Date(banUntil).getTime() - now.getTime());
}

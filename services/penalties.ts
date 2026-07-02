import type { PaymentPenaltyState, User } from '@/models/types';

export type { PaymentPenaltyState };

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_IN_MS = 30 * DAY_IN_MS;

const BLOCK_RULES: { threshold: number; durationMs: number }[] = [
  { threshold: 3, durationMs: DAY_IN_MS },
  { threshold: 6, durationMs: 3 * DAY_IN_MS },
  { threshold: 9, durationMs: 7 * DAY_IN_MS },
];

const getBlockDurationForCount = (count: number): number | null => {
  const rule = BLOCK_RULES.find((entry) => entry.threshold === count);
  return rule ? rule.durationMs : null;
};

export function isUserBlocked(user: User, now: Date): boolean {
  const blockUntil = user.penaltyState?.currentBlockUntil;
  if (!blockUntil) {
    return false;
  }

  return new Date(blockUntil).getTime() > now.getTime();
}

export function registerLateCancellation(user: User, now: Date): User {
  const prevState = user.penaltyState ?? { lateCancellationsCount: 0 };
  const nowMs = now.getTime();
  const lastLate = prevState.lastLateCancellationAt
    ? new Date(prevState.lastLateCancellationAt).getTime()
    : null;

  let effectiveCount = prevState.lateCancellationsCount ?? 0;
  if (lastLate && nowMs - lastLate > THIRTY_DAYS_IN_MS) {
    effectiveCount = 0;
  }

  const nextCount = effectiveCount + 1;
  const blockDuration = getBlockDurationForCount(nextCount);

  let currentBlockUntil: string | undefined;
  if (blockDuration) {
    currentBlockUntil = new Date(nowMs + blockDuration).toISOString();
  } else if (prevState.currentBlockUntil) {
    const prevBlockTime = new Date(prevState.currentBlockUntil).getTime();
    if (prevBlockTime > nowMs) {
      currentBlockUntil = prevState.currentBlockUntil;
    }
  }

  return {
    ...user,
    penaltyState: {
      lateCancellationsCount: nextCount,
      lastLateCancellationAt: now.toISOString(),
      currentBlockUntil,
    },
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

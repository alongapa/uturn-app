import type { User } from '@/models/types';

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

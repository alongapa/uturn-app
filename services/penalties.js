const DAY_IN_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_IN_MS = 30 * DAY_IN_MS;
const BLOCK_RULES = [
    { threshold: 3, durationMs: DAY_IN_MS },
    { threshold: 6, durationMs: 3 * DAY_IN_MS },
    { threshold: 9, durationMs: 7 * DAY_IN_MS },
];
const getBlockDurationForCount = (count) => {
    const rule = BLOCK_RULES.find((entry) => entry.threshold === count);
    return rule ? rule.durationMs : null;
};
export function isUserBlocked(user, now) {
    var _a;
    const blockUntil = (_a = user.penaltyState) === null || _a === void 0 ? void 0 : _a.currentBlockUntil;
    if (!blockUntil) {
        return false;
    }
    return new Date(blockUntil).getTime() > now.getTime();
}
export function registerLateCancellation(user, now) {
    var _a, _b;
    const prevState = (_a = user.penaltyState) !== null && _a !== void 0 ? _a : { lateCancellationsCount: 0 };
    const nowMs = now.getTime();
    const lastLate = prevState.lastLateCancellationAt
        ? new Date(prevState.lastLateCancellationAt).getTime()
        : null;
    let effectiveCount = (_b = prevState.lateCancellationsCount) !== null && _b !== void 0 ? _b : 0;
    if (lastLate && nowMs - lastLate > THIRTY_DAYS_IN_MS) {
        effectiveCount = 0;
    }
    const nextCount = effectiveCount + 1;
    const blockDuration = getBlockDurationForCount(nextCount);
    let currentBlockUntil;
    if (blockDuration) {
        currentBlockUntil = new Date(nowMs + blockDuration).toISOString();
    }
    else if (prevState.currentBlockUntil) {
        const prevBlockTime = new Date(prevState.currentBlockUntil).getTime();
        if (prevBlockTime > nowMs) {
            currentBlockUntil = prevState.currentBlockUntil;
        }
    }
    return Object.assign(Object.assign({}, user), { penaltyState: {
            lateCancellationsCount: nextCount,
            lastLateCancellationAt: now.toISOString(),
            currentBlockUntil,
        } });
}

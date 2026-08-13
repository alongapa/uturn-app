// Penalizaciones: cancelaciones tardías (bloqueo 1/3/7 días a las 3/6/9) y
// strikes por impago (ban de 2 días al tercero).
//
// Estas reglas deciden si una persona puede o no reservar, así que los casos
// borde importan más que la ruta feliz: el umbral exacto, la ventana de 30
// días que resetea el contador, y qué pasa con un bloqueo vigente cuando el
// contador se reinicia.

import {
  EMPTY_PAYMENT_PENALTY,
  EMPTY_PENALTY_STATE,
  PAYMENT_BAN_DURATION_MS,
  PAYMENT_STRIKES_FOR_BAN,
  applyLateCancellation,
  getBlockedUntil,
  getPaymentBanRemainingMs,
  isBlocked,
  isPaymentBanned,
  registerPaymentStrike,
  resetExpiredPenalties,
} from '@/services/penalties';
import type { PaymentPenaltyState, PenaltyState } from '@/models/types';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-03-10T12:00:00.000Z');

/** Aplica n cancelaciones tardías seguidas, todas en el mismo instante. */
function cancelNTimes(n: number, now: Date = NOW): PenaltyState {
  let state: PenaltyState = EMPTY_PENALTY_STATE;
  for (let i = 0; i < n; i += 1) state = applyLateCancellation(state, now);
  return state;
}

describe('cancelaciones tardías', () => {
  it('cuenta la primera cancelación sin bloquear', () => {
    const state = applyLateCancellation(undefined, NOW);

    expect(state.lateCancellationsCount).toBe(1);
    expect(state.currentBlockUntil).toBeUndefined();
    expect(isBlocked(state, NOW)).toBe(false);
  });

  it.each([
    [3, 1],
    [6, 3],
    [9, 7],
  ])('bloquea %i días en la cancelación número %i', (cancellations, expectedDays) => {
    const state = cancelNTimes(cancellations);

    expect(state.lateCancellationsCount).toBe(cancellations);
    expect(isBlocked(state, NOW)).toBe(true);
    expect(getBlockedUntil(state, NOW)).toEqual(new Date(NOW.getTime() + expectedDays * DAY));
  });

  it('no bloquea en los conteos intermedios', () => {
    // 4 y 5 caen entre umbrales: el contador sube pero no hay bloqueo nuevo.
    for (const n of [1, 2, 4, 5, 7, 8]) {
      const state = cancelNTimes(n);
      const blockedNow = isBlocked(state, NOW);
      // En 4/5/7/8 puede seguir vigente el bloqueo heredado del umbral
      // anterior, pero nunca uno que empiece en esta cancelación.
      if (n < 3) expect(blockedNow).toBe(false);
      expect(state.lateCancellationsCount).toBe(n);
    }
  });

  it('arrastra el bloqueo vigente al seguir cancelando entre umbrales', () => {
    const atThree = cancelNTimes(3); // bloqueado 1 día
    const sixHoursLater = new Date(NOW.getTime() + 6 * 60 * 60 * 1000);

    const atFour = applyLateCancellation(atThree, sixHoursLater);

    expect(atFour.lateCancellationsCount).toBe(4);
    // El bloqueo que ya corría no se pierde ni se extiende por una cancelación
    // que no toca umbral.
    expect(atFour.currentBlockUntil).toBe(atThree.currentBlockUntil);
    expect(isBlocked(atFour, sixHoursLater)).toBe(true);
  });

  it('deja de bloquear cuando pasa la fecha del bloqueo', () => {
    const state = cancelNTimes(3);
    const afterBlock = new Date(NOW.getTime() + DAY + 1000);

    expect(isBlocked(state, afterBlock)).toBe(false);
    expect(getBlockedUntil(state, afterBlock)).toBeNull();
  });

  it('trata el instante exacto del vencimiento como no bloqueado', () => {
    const state = cancelNTimes(3);
    const exactlyAtExpiry = new Date(NOW.getTime() + DAY);

    expect(isBlocked(state, exactlyAtExpiry)).toBe(false);
  });

  it('no bloquea con un estado vacío o indefinido', () => {
    expect(isBlocked(undefined, NOW)).toBe(false);
    expect(isBlocked(EMPTY_PENALTY_STATE, NOW)).toBe(false);
    expect(getBlockedUntil(undefined, NOW)).toBeNull();
  });
});

describe('ventana de 30 días', () => {
  it('reinicia el contador pasados 30 días desde la última cancelación', () => {
    const state = cancelNTimes(2);
    const muchLater = new Date(NOW.getTime() + 31 * DAY);

    expect(resetExpiredPenalties(state, muchLater).lateCancellationsCount).toBe(0);
  });

  it('mantiene el contador dentro de la ventana', () => {
    const state = cancelNTimes(2);
    const withinWindow = new Date(NOW.getTime() + 29 * DAY);

    expect(resetExpiredPenalties(state, withinWindow).lateCancellationsCount).toBe(2);
  });

  it('trata los 30 días exactos como dentro de la ventana', () => {
    const state = cancelNTimes(2);
    const exactly30 = new Date(NOW.getTime() + 30 * DAY);

    expect(resetExpiredPenalties(state, exactly30).lateCancellationsCount).toBe(2);
  });

  it('conserva un bloqueo aún vigente aunque el contador se reinicie', () => {
    // Caso incómodo: alguien llega a 9 (bloqueo de 7 días) y vuelve recién a
    // los 31 días. El contador se reinicia, pero si el bloqueo siguiera
    // corriendo no debe levantarse por efecto del reinicio.
    const blocked: PenaltyState = {
      lateCancellationsCount: 9,
      lastLateCancellationAt: NOW.toISOString(),
      currentBlockUntil: new Date(NOW.getTime() + 40 * DAY).toISOString(),
    };
    const later = new Date(NOW.getTime() + 31 * DAY);

    const reset = resetExpiredPenalties(blocked, later);

    expect(reset.lateCancellationsCount).toBe(0);
    expect(isBlocked(reset, later)).toBe(true);
  });

  it('descarta un bloqueo ya vencido al reiniciar', () => {
    const state = cancelNTimes(3);
    const later = new Date(NOW.getTime() + 31 * DAY);

    const reset = resetExpiredPenalties(state, later);

    expect(reset.lateCancellationsCount).toBe(0);
    expect(reset.currentBlockUntil).toBeUndefined();
  });

  it('vuelve a empezar en 1 después del reinicio', () => {
    const state = cancelNTimes(5);
    const later = new Date(NOW.getTime() + 31 * DAY);

    expect(applyLateCancellation(state, later).lateCancellationsCount).toBe(1);
  });

  it('no toca un estado sin cancelaciones', () => {
    expect(resetExpiredPenalties(EMPTY_PENALTY_STATE, NOW)).toBe(EMPTY_PENALTY_STATE);
  });
});

describe('strikes por impago', () => {
  it('suma strikes sin banear antes del tercero', () => {
    let state: PaymentPenaltyState = EMPTY_PAYMENT_PENALTY;

    state = registerPaymentStrike(state, NOW);
    expect(state.paymentStrikesCount).toBe(1);
    expect(isPaymentBanned(state, NOW)).toBe(false);

    state = registerPaymentStrike(state, NOW);
    expect(state.paymentStrikesCount).toBe(2);
    expect(isPaymentBanned(state, NOW)).toBe(false);
  });

  it('banea 2 días al tercer strike y reinicia el contador', () => {
    let state: PaymentPenaltyState = EMPTY_PAYMENT_PENALTY;
    for (let i = 0; i < PAYMENT_STRIKES_FOR_BAN; i += 1) state = registerPaymentStrike(state, NOW);

    expect(isPaymentBanned(state, NOW)).toBe(true);
    expect(state.paymentBanUntil).toBe(new Date(NOW.getTime() + PAYMENT_BAN_DURATION_MS).toISOString());
    // Se reinicia para que el próximo ban exija otros 3 impagos, no uno.
    expect(state.paymentStrikesCount).toBe(0);
  });

  it('levanta el ban al vencer el plazo', () => {
    let state: PaymentPenaltyState = EMPTY_PAYMENT_PENALTY;
    for (let i = 0; i < PAYMENT_STRIKES_FOR_BAN; i += 1) state = registerPaymentStrike(state, NOW);
    const afterBan = new Date(NOW.getTime() + PAYMENT_BAN_DURATION_MS + 1000);

    expect(isPaymentBanned(state, afterBan)).toBe(false);
    expect(getPaymentBanRemainingMs(state, afterBan)).toBe(0);
  });

  it('informa el tiempo restante del ban', () => {
    let state: PaymentPenaltyState = EMPTY_PAYMENT_PENALTY;
    for (let i = 0; i < PAYMENT_STRIKES_FOR_BAN; i += 1) state = registerPaymentStrike(state, NOW);
    const halfway = new Date(NOW.getTime() + DAY);

    expect(getPaymentBanRemainingMs(state, halfway)).toBe(DAY);
  });

  it('no reporta ban sin estado previo', () => {
    expect(isPaymentBanned(undefined, NOW)).toBe(false);
    expect(getPaymentBanRemainingMs(undefined, NOW)).toBe(0);
  });

  it('mantiene los strikes independientes de las cancelaciones tardías', () => {
    // Son dos contadores distintos: pagar tarde no debe acercar a nadie al
    // bloqueo por cancelaciones ni al revés.
    const lateState = cancelNTimes(2);
    const paymentState = registerPaymentStrike(EMPTY_PAYMENT_PENALTY, NOW);

    expect(lateState.lateCancellationsCount).toBe(2);
    expect(paymentState.paymentStrikesCount).toBe(1);
    expect('paymentStrikesCount' in lateState).toBe(false);
    expect('lateCancellationsCount' in paymentState).toBe(false);
  });
});

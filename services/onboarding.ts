// Estado del onboarding de primer uso (Sesión 10).
//
// Dos cosas distintas, guardadas por separado a propósito:
//
//  1. `intro` — las diapositivas de bienvenida. Son informativas; si alguien se
//     las salta no pasa nada.
//  2. `paymentRules` — la aceptación explícita de las reglas de pago. Esta NO
//     es informativa: bloquea la primera reserva. Se guarda aparte para poder
//     volver a pedirla si las reglas cambian (ver RULES_VERSION) sin repetir
//     toda la bienvenida.
//
// Vive en AsyncStorage y no en `profiles` porque es estado de la instalación,
// no de la cuenta: el servidor no necesita saberlo y así funciona también
// antes de que haya sesión.

import { loadJSON, removeStored, saveJSON } from '@/services/storage';

/**
 * Sube este número cuando cambien las reglas de pago de fondo (el plazo, el
 * umbral de strikes, quién recibe el strike). Al subirlo, a todos se les vuelve
 * a exigir la lectura antes de su próxima reserva — que es el punto: nadie
 * debería quedar comprometido con reglas que aceptó en otra versión.
 */
export const RULES_VERSION = 1;

const KEYS = {
  intro: 'unities/onboarding-intro',
  paymentRules: 'unities/onboarding-payment-rules',
} as const;

type AcceptedRules = {
  version: number;
  acceptedAt: string;
};

/** true si ya vio (o se saltó) las diapositivas de bienvenida. */
export async function hasSeenIntro(): Promise<boolean> {
  return (await loadJSON<boolean>(KEYS.intro)) === true;
}

export async function markIntroSeen(): Promise<void> {
  await saveJSON(KEYS.intro, true);
}

/**
 * true si aceptó las reglas de pago **de esta versión**. Una aceptación vieja
 * no cuenta: es exactamente el caso que RULES_VERSION existe para atrapar.
 */
export async function hasAcceptedPaymentRules(): Promise<boolean> {
  const stored = await loadJSON<AcceptedRules>(KEYS.paymentRules);
  return stored?.version === RULES_VERSION;
}

export async function acceptPaymentRules(now: Date = new Date()): Promise<void> {
  const record: AcceptedRules = { version: RULES_VERSION, acceptedAt: now.toISOString() };
  await saveJSON(KEYS.paymentRules, record);
}

/** Solo para desarrollo y para el flujo de borrado de cuenta. */
export async function resetOnboarding(): Promise<void> {
  await removeStored(KEYS.intro);
  await removeStored(KEYS.paymentRules);
}

import { useCallback, useEffect, useState } from 'react';

import { hasAcceptedPaymentRules, hasSeenIntro } from '@/services/onboarding';

type OnboardingState = {
  /** null mientras se lee AsyncStorage; evita el parpadeo del onboarding. */
  seenIntro: boolean | null;
  acceptedRules: boolean | null;
  /** Vuelve a leer el estado guardado (tras aceptar en otra pantalla). */
  refresh: () => void;
};

/**
 * Lee el estado del onboarding desde AsyncStorage.
 *
 * El `null` inicial importa: si arrancara en `false`, la primera pasada de
 * render mandaría al onboarding a alguien que ya lo vio, y vería el flash de
 * bienvenida en cada arranque.
 */
export function useOnboarding(): OnboardingState {
  const [seenIntro, setSeenIntro] = useState<boolean | null>(null);
  const [acceptedRules, setAcceptedRules] = useState<boolean | null>(null);

  const refresh = useCallback(() => {
    let active = true;
    void hasSeenIntro().then((value) => active && setSeenIntro(value));
    void hasAcceptedPaymentRules().then((value) => active && setAcceptedRules(value));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => refresh(), [refresh]);

  return { seenIntro, acceptedRules, refresh };
}

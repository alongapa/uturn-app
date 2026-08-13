// Estado del onboarding. Lo que se prueba es la puerta de la primera reserva:
// si `hasAcceptedPaymentRules` devuelve true de más, alguien reserva sin haber
// leído nunca el plazo de 48 h.

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  RULES_VERSION,
  acceptPaymentRules,
  hasAcceptedPaymentRules,
  hasSeenIntro,
  markIntroSeen,
  resetOnboarding,
} from '@/services/onboarding';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('bienvenida', () => {
  it('arranca sin ver', async () => {
    expect(await hasSeenIntro()).toBe(false);
  });

  it('queda marcada tras verla', async () => {
    await markIntroSeen();

    expect(await hasSeenIntro()).toBe(true);
  });
});

describe('aceptación de las reglas de pago', () => {
  it('arranca sin aceptar', async () => {
    expect(await hasAcceptedPaymentRules()).toBe(false);
  });

  it('queda aceptada tras el toque explícito', async () => {
    await acceptPaymentRules();

    expect(await hasAcceptedPaymentRules()).toBe(true);
  });

  it('es independiente de haber visto la bienvenida', async () => {
    // Saltarse el intro no puede contar como aceptar las reglas: el intro
    // tiene botón "Saltar" y la aceptación no.
    await markIntroSeen();

    expect(await hasAcceptedPaymentRules()).toBe(false);
  });

  it('deja de valer si las reglas cambian de versión', async () => {
    // El caso que RULES_VERSION existe para atrapar: una aceptación de reglas
    // viejas no puede autorizar reservas bajo reglas nuevas.
    await AsyncStorage.setItem(
      'unities/onboarding-payment-rules',
      JSON.stringify({ version: RULES_VERSION - 1, acceptedAt: new Date().toISOString() })
    );

    expect(await hasAcceptedPaymentRules()).toBe(false);
  });

  it('guarda cuándo se aceptó', async () => {
    const now = new Date('2026-03-10T12:00:00.000Z');
    await acceptPaymentRules(now);

    const raw = await AsyncStorage.getItem('unities/onboarding-payment-rules');
    expect(JSON.parse(raw!)).toEqual({ version: RULES_VERSION, acceptedAt: now.toISOString() });
  });

  it('no se rompe con datos corruptos en el storage', async () => {
    // Un JSON inválido debe leerse como "no aceptó", nunca como aceptado.
    await AsyncStorage.setItem('unities/onboarding-payment-rules', 'no-es-json');

    expect(await hasAcceptedPaymentRules()).toBe(false);
  });
});

describe('reinicio', () => {
  it('borra ambas marcas', async () => {
    await markIntroSeen();
    await acceptPaymentRules();

    await resetOnboarding();

    expect(await hasSeenIntro()).toBe(false);
    expect(await hasAcceptedPaymentRules()).toBe(false);
  });
});

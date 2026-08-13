// Créditos y canjes: el estado de un canje se deriva de la fecha, no se
// guarda, así que un error de comparación deja códigos vencidos como válidos
// (o al revés, invalida uno que el local todavía debería aceptar).

import {
  CREDITS_PER_PAID_TRIP,
  STREAK_BONUS_CREDITS,
  STREAK_TRIP_TARGET,
  generateRedemptionCode,
  getRedemptionStatus,
} from '@/services/credits';
import type { Redemption } from '@/models/unities';

const NOW = new Date('2026-03-10T12:00:00.000Z');

function redemption(overrides: Partial<Redemption> = {}): Redemption {
  return {
    id: 'r1',
    itemId: 'item-1',
    titulo: 'Café gratis',
    costoCreditos: 100,
    codigo: 'UT-ABCD-1234',
    createdAt: '2026-03-01T12:00:00.000Z',
    expiraAt: '2026-03-20T12:00:00.000Z',
    estado: 'disponible',
    ...overrides,
  };
}

describe('estado del canje', () => {
  it('está disponible antes de expirar', () => {
    expect(getRedemptionStatus(redemption(), NOW)).toBe('disponible');
  });

  it('queda expirado pasada la fecha', () => {
    const expired = redemption({ expiraAt: '2026-03-01T12:00:00.000Z' });

    expect(getRedemptionStatus(expired, NOW)).toBe('expirado');
  });

  it('sigue disponible en el instante exacto de expiración', () => {
    // El borde va a favor del estudiante que está en la caja del local.
    const atExpiry = redemption({ expiraAt: NOW.toISOString() });

    expect(getRedemptionStatus(atExpiry, NOW)).toBe('disponible');
  });

  it('mantiene "canjeado" aunque la fecha haya pasado', () => {
    // Un canje usado no debe reetiquetarse como expirado: el historial tiene
    // que seguir mostrando que la persona lo ocupó.
    const used = redemption({ estado: 'canjeado', expiraAt: '2026-01-01T00:00:00.000Z' });

    expect(getRedemptionStatus(used, NOW)).toBe('canjeado');
  });
});

describe('código de canje', () => {
  it('usa el formato UT-XXXX-XXXX', () => {
    expect(generateRedemptionCode()).toMatch(/^UT-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it('excluye los caracteres que se confunden al dictarlo', () => {
    // El código se lee en voz alta o se tipea en la caja del local, así que el
    // alfabeto deja fuera los pares ambiguos: 0/O y 1/I. La L sí se usa —
    // habiendo sacado el 1, ya no compite con nada.
    const codes = Array.from({ length: 200 }, generateRedemptionCode).join('');

    expect(codes).not.toMatch(/[01IO]/);
    expect(codes).toMatch(/L/);
  });

  it('no repite el mismo código en tiradas seguidas', () => {
    const codes = new Set(Array.from({ length: 100 }, generateRedemptionCode));

    // 32^8 combinaciones: 100 colisiones seguidas serían un generador roto.
    expect(codes.size).toBe(100);
  });
});

describe('reglas de acumulación', () => {
  it('mantiene los valores que la pantalla de perfil promete', () => {
    // Si estos números cambian sin querer, el usuario ve un saldo distinto al
    // que la UI le anunció al reservar.
    expect(CREDITS_PER_PAID_TRIP).toBe(25);
    expect(STREAK_TRIP_TARGET).toBe(3);
    expect(STREAK_BONUS_CREDITS).toBe(50);
  });

  it('hace que el bono de racha supere a un viaje suelto', () => {
    // La racha tiene que sentirse como un premio, no como un viaje más.
    expect(STREAK_BONUS_CREDITS).toBeGreaterThan(CREDITS_PER_PAID_TRIP);
  });
});

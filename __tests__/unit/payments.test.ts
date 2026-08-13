// Comisión por cupo, plazo de 48 h y pago parcial con créditos.
//
// Es la parte que toca plata: un redondeo mal puesto acá cobra de más a un
// estudiante o le paga de menos a un conductor, y nadie lo va a notar mirando
// la pantalla.

import {
  DEFAULT_PAYMENT_CONFIG,
  PAYMENT_DEADLINE_HOURS,
  UNITIES_COMMISSION_CLP,
  formatCLP,
  getBreakdownWithCredits,
  getPaymentBreakdown,
  getPaymentDeadline,
  hoursUntil,
  isPaymentOverdue,
  maxCreditsForPrice,
  type PaymentConfig,
} from '@/services/payments';

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-03-10T12:00:00.000Z');

describe('comisión y total', () => {
  it('suma la comisión fija al precio del cupo', () => {
    const breakdown = getPaymentBreakdown(2000);

    expect(breakdown).toEqual({
      precioCLP: 2000,
      comisionCLP: UNITIES_COMMISSION_CLP,
      totalCLP: 2000 + UNITIES_COMMISSION_CLP,
    });
  });

  it('cobra la comisión incluso en un viaje gratis', () => {
    // Un cupo a $0 sigue costándole la pasarela a Unities.
    expect(getPaymentBreakdown(0).totalCLP).toBe(UNITIES_COMMISSION_CLP);
  });

  it('trata un precio negativo como cero en vez de descontar', () => {
    expect(getPaymentBreakdown(-5000).precioCLP).toBe(0);
    expect(getPaymentBreakdown(-5000).totalCLP).toBe(UNITIES_COMMISSION_CLP);
  });

  it('redondea el precio a pesos enteros', () => {
    // No existe la fracción de peso chileno; el total no puede tener decimales.
    expect(getPaymentBreakdown(1500.6).precioCLP).toBe(1501);
    expect(getPaymentBreakdown(1500.4).precioCLP).toBe(1500);
    expect(Number.isInteger(getPaymentBreakdown(1500.5).totalCLP)).toBe(true);
  });

  it('formatea montos en pesos chilenos', () => {
    // Separador de miles local; el símbolo va pegado al número.
    expect(formatCLP(2300)).toContain('2');
    expect(formatCLP(2300).startsWith('$')).toBe(true);
    expect(formatCLP(2300.7)).toBe(formatCLP(2301));
  });
});

describe('plazo de 48 horas', () => {
  it('vence exactamente 48 horas después de reservar', () => {
    const deadline = getPaymentDeadline(NOW);

    expect(new Date(deadline).getTime() - NOW.getTime()).toBe(PAYMENT_DEADLINE_HOURS * HOUR);
  });

  it('no está vencido justo antes del plazo', () => {
    const deadline = getPaymentDeadline(NOW);
    const almost = new Date(NOW.getTime() + PAYMENT_DEADLINE_HOURS * HOUR - 1000);

    expect(isPaymentOverdue(deadline, almost)).toBe(false);
  });

  it('está vencido pasado el plazo', () => {
    const deadline = getPaymentDeadline(NOW);
    const after = new Date(NOW.getTime() + PAYMENT_DEADLINE_HOURS * HOUR + 1000);

    expect(isPaymentOverdue(deadline, after)).toBe(true);
  });

  it('no marca vencido en el instante exacto del plazo', () => {
    // El borde va a favor del pasajero: a las 48:00:00 clavadas todavía paga.
    const deadline = getPaymentDeadline(NOW);
    const exactly = new Date(NOW.getTime() + PAYMENT_DEADLINE_HOURS * HOUR);

    expect(isPaymentOverdue(deadline, exactly)).toBe(false);
  });

  it('cuenta las horas restantes hacia arriba', () => {
    const deadline = getPaymentDeadline(NOW);

    expect(hoursUntil(deadline, NOW)).toBe(48);
    // A 90 minutos del vencimiento se muestran 2 h, no 1: redondear hacia
    // abajo haría que el aviso prometa menos tiempo del que queda.
    expect(hoursUntil(deadline, new Date(NOW.getTime() + 46.5 * HOUR))).toBe(2);
  });

  it('nunca informa horas negativas', () => {
    const deadline = getPaymentDeadline(NOW);
    const wayAfter = new Date(NOW.getTime() + 100 * HOUR);

    expect(hoursUntil(deadline, wayAfter)).toBe(0);
  });
});

describe('pago parcial con créditos', () => {
  it('topa los créditos al 50% del precio del cupo', () => {
    // 2000 CLP → tope 1000 CLP → 200 créditos a 5 CLP cada uno.
    expect(maxCreditsForPrice(2000, 10_000)).toBe(200);
  });

  it('no permite usar más créditos que el saldo', () => {
    expect(maxCreditsForPrice(2000, 50)).toBe(50);
  });

  it('no aplica créditos sobre la comisión, solo sobre el precio', () => {
    const breakdown = getBreakdownWithCredits(2000, 999, 10_000);

    // El tope se calcula sobre 2000, no sobre 2300: la comisión de Unities
    // siempre se paga en efectivo.
    expect(breakdown.creditosAplicados).toBe(200);
    expect(breakdown.creditosCLP).toBe(1000);
    expect(breakdown.efectivoCLP).toBe(2300 - 1000);
  });

  it('recorta un intento de aplicar más créditos de los permitidos', () => {
    const breakdown = getBreakdownWithCredits(2000, 5000, 10_000);

    expect(breakdown.creditosAplicados).toBe(200);
    expect(breakdown.totalCLP).toBe(2300);
  });

  it('ignora créditos negativos o fraccionarios', () => {
    expect(getBreakdownWithCredits(2000, -50, 10_000).creditosAplicados).toBe(0);
    expect(getBreakdownWithCredits(2000, 10.9, 10_000).creditosAplicados).toBe(10);
  });

  it('deja el efectivo en cero si los créditos cubrieran todo', () => {
    // Config extrema: 100% del precio pagable con créditos y 1 crédito = 1000
    // CLP. Ni así el efectivo debe quedar negativo.
    const generous: PaymentConfig = {
      ...DEFAULT_PAYMENT_CONFIG,
      commissionCLP: 0,
      creditClpRate: 1000,
      maxCreditDiscountPct: 100,
    };
    const breakdown = getBreakdownWithCredits(2000, 2, 100, generous);

    expect(breakdown.efectivoCLP).toBe(0);
  });

  it('no aplica créditos cuando el saldo es cero', () => {
    const breakdown = getBreakdownWithCredits(2000, 100, 0);

    expect(breakdown.creditosAplicados).toBe(0);
    expect(breakdown.efectivoCLP).toBe(breakdown.totalCLP);
  });

  it('respeta una tasa distinta de la de por defecto', () => {
    // La fuente de verdad es platform_config: si el owner cambia la tasa, el
    // cálculo del cliente tiene que seguirla y no el default compilado.
    const config: PaymentConfig = { ...DEFAULT_PAYMENT_CONFIG, creditClpRate: 10 };

    // Tope sigue siendo 1000 CLP, pero ahora son 100 créditos, no 200.
    expect(maxCreditsForPrice(2000, 10_000, config)).toBe(100);
  });

  it('mantiene el total consistente con el desglose simple', () => {
    const simple = getPaymentBreakdown(3500);
    const withCredits = getBreakdownWithCredits(3500, 0, 0);

    expect(withCredits.totalCLP).toBe(simple.totalCLP);
    expect(withCredits.comisionCLP).toBe(simple.comisionCLP);
  });
});

// Reglas de pago de UNITIES: comisión por cupo y plazo para transferir al conductor.

export const UNITIES_COMMISSION_CLP = 300; // comisión fija de Unities por cupo reservado
export const PAYMENT_DEADLINE_HOURS = 48; // plazo del pasajero para pagar

const HOUR_IN_MS = 60 * 60 * 1000;

export type PaymentBreakdown = {
  precioCLP: number;
  comisionCLP: number;
  totalCLP: number;
};

export function getPaymentBreakdown(precioCLP: number): PaymentBreakdown {
  const precio = Math.max(0, Math.round(precioCLP));
  return {
    precioCLP: precio,
    comisionCLP: UNITIES_COMMISSION_CLP,
    totalCLP: precio + UNITIES_COMMISSION_CLP,
  };
}

export function getPaymentDeadline(from: Date): string {
  return new Date(from.getTime() + PAYMENT_DEADLINE_HOURS * HOUR_IN_MS).toISOString();
}

export function isPaymentOverdue(deadlineIso: string, now: Date): boolean {
  return new Date(deadlineIso).getTime() < now.getTime();
}

export function hoursUntil(deadlineIso: string, now: Date): number {
  return Math.max(0, Math.ceil((new Date(deadlineIso).getTime() - now.getTime()) / HOUR_IN_MS));
}

export function formatCLP(value: number): string {
  return `$${Math.round(value).toLocaleString('es-CL')}`;
}

// --- Sesión 8: pago parcial con créditos Unities (tasa configurable por owner) ---
// La fuente de verdad es platform_config en el servidor; estos defaults reflejan
// los valores de la migración y se usan como respaldo mientras carga la config.

export type PaymentConfig = {
  commissionCLP: number;
  creditClpRate: number; // CLP que cubre 1 crédito
  maxCreditDiscountPct: number; // % del precio del cupo pagable con créditos
  // Sesión 9: exige verificación reforzada (cédula + licencia) para publicar viajes.
  requireReinforcedDriverVerification: boolean;
};

export const DEFAULT_PAYMENT_CONFIG: PaymentConfig = {
  commissionCLP: UNITIES_COMMISSION_CLP,
  creditClpRate: 5,
  maxCreditDiscountPct: 50,
  requireReinforcedDriverVerification: false,
};

/** Máximo de créditos aplicables al precio de un cupo, según el tope y el saldo. */
export function maxCreditsForPrice(
  priceCLP: number,
  balance: number,
  config: PaymentConfig = DEFAULT_PAYMENT_CONFIG
): number {
  const capClp = Math.floor((Math.max(0, priceCLP) * config.maxCreditDiscountPct) / 100);
  const capByPrice = Math.floor(capClp / config.creditClpRate);
  return Math.max(0, Math.min(balance, capByPrice));
}

export type CreditPaymentBreakdown = PaymentBreakdown & {
  creditosAplicados: number;
  creditosCLP: number;
  efectivoCLP: number; // lo que se paga por la pasarela (total - créditos)
};

/** Desglose del pago aplicando `credits` créditos (recorta al máximo permitido). */
export function getBreakdownWithCredits(
  priceCLP: number,
  credits: number,
  balance: number,
  config: PaymentConfig = DEFAULT_PAYMENT_CONFIG
): CreditPaymentBreakdown {
  const precio = Math.max(0, Math.round(priceCLP));
  const total = precio + config.commissionCLP;
  const creditosAplicados = Math.max(0, Math.min(Math.floor(credits), maxCreditsForPrice(precio, balance, config)));
  const creditosCLP = creditosAplicados * config.creditClpRate;
  return {
    precioCLP: precio,
    comisionCLP: config.commissionCLP,
    totalCLP: total,
    creditosAplicados,
    creditosCLP,
    efectivoCLP: Math.max(0, total - creditosCLP),
  };
}

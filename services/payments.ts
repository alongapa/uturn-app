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

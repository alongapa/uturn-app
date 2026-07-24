// Servicio de pagos avanzados (Sesión 8) sobre Supabase.
// Toda la lógica crítica vive en el servidor: intención de pago (Edge Function
// create-payment-intent + Fintoc), verificación por webhook, disputas,
// liquidaciones y configuración financiera del owner. El cliente solo invoca.

import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/services/supabase';
import type { PaymentConfig } from '@/services/payments';
import type { DisputeRow, DisputeStatus, Json, PayoutRow } from '@/types/database';

// ---------------------------------------------------------------------------
// Configuración financiera (platform_config)
// ---------------------------------------------------------------------------

export async function getPlatformConfig(): Promise<PaymentConfig> {
  const { data, error } = await supabase
    .from('platform_config')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();
  if (error) throw error;
  return {
    commissionCLP: data?.commission_clp ?? 300,
    creditClpRate: data?.credit_clp_rate ?? 5,
    maxCreditDiscountPct: data?.max_credit_discount_pct ?? 50,
    requireReinforcedDriverVerification: data?.require_reinforced_driver_verification ?? false,
  };
}

export async function updatePlatformConfig(patch: Partial<PaymentConfig>): Promise<PaymentConfig> {
  const { data, error } = await supabase.rpc('update_platform_config', {
    p_commission_clp: patch.commissionCLP ?? null,
    p_credit_clp_rate: patch.creditClpRate ?? null,
    p_max_credit_discount_pct: patch.maxCreditDiscountPct ?? null,
    p_require_reinforced_driver_verification: patch.requireReinforcedDriverVerification ?? null,
  });
  if (error) throw error;
  return {
    commissionCLP: data.commission_clp,
    creditClpRate: data.credit_clp_rate,
    maxCreditDiscountPct: data.max_credit_discount_pct,
    requireReinforcedDriverVerification: data.require_reinforced_driver_verification,
  };
}

// ---------------------------------------------------------------------------
// Intención de pago (Edge Function → Fintoc). El webhook marca 'confirmed'.
// ---------------------------------------------------------------------------

export type PaymentIntentResult = {
  status: 'pending' | 'confirmed';
  paymentId: string;
  intentId?: string;
  cashClp: number;
  creditsClp: number;
  creditsApplied: number;
  checkoutUrl?: string | null;
  widgetToken?: string | null;
  simulated?: boolean;
};

export async function createPaymentIntent(
  bookingId: string,
  credits = 0
): Promise<PaymentIntentResult> {
  const { data, error } = await supabase.functions.invoke('create-payment-intent', {
    body: { bookingId, credits },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as PaymentIntentResult;
}

// ---------------------------------------------------------------------------
// Disputas ("yo sí pagué")
// ---------------------------------------------------------------------------

export type Dispute = {
  id: string;
  bookingId: string;
  paymentId?: string;
  openedBy: string;
  reason: string;
  evidencePath?: string;
  status: DisputeStatus;
  conversationId?: string;
  resolutionNote?: string;
  createdAt: string;
};

function mapDispute(row: DisputeRow): Dispute {
  return {
    id: row.id,
    bookingId: row.booking_id,
    paymentId: row.payment_id ?? undefined,
    openedBy: row.opened_by,
    reason: row.reason,
    evidencePath: row.evidence_path ?? undefined,
    status: row.status,
    conversationId: row.conversation_id ?? undefined,
    resolutionNote: row.resolution_note ?? undefined,
    createdAt: row.created_at,
  };
}

export async function openDispute(
  bookingId: string,
  reason: string,
  evidencePath?: string
): Promise<Dispute> {
  const { data, error } = await supabase.rpc('open_dispute', {
    p_booking_id: bookingId,
    p_reason: reason,
    p_evidence_path: evidencePath ?? null,
  });
  if (error) throw error;
  return mapDispute(data);
}

/** Disputas del propio usuario (RLS filtra por opened_by). */
export async function listMyDisputes(): Promise<Dispute[]> {
  const { data, error } = await supabase
    .from('disputes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapDispute);
}

// --- Bandeja admin/owner (detalle vía RPC list_disputes) ---

export type DisputeInboxItem = {
  id: string;
  bookingId: string;
  status: DisputeStatus;
  reason: string;
  evidencePath?: string;
  conversationId?: string;
  createdAt: string;
  resolutionNote?: string;
  passenger: string;
  route: string;
  totalClp: number;
  paymentStatus: string;
  dueAt: string;
};

export async function listDisputes(onlyOpen = true): Promise<DisputeInboxItem[]> {
  const { data, error } = await supabase.rpc('list_disputes', { p_only_open: onlyOpen });
  if (error) throw error;
  const rows = (data ?? []) as Array<Record<string, Json>>;
  return rows.map((r) => ({
    id: String(r.id),
    bookingId: String(r.booking_id),
    status: r.status as DisputeStatus,
    reason: String(r.reason ?? ''),
    evidencePath: r.evidence_path ? String(r.evidence_path) : undefined,
    conversationId: r.conversation_id ? String(r.conversation_id) : undefined,
    createdAt: String(r.created_at),
    resolutionNote: r.resolution_note ? String(r.resolution_note) : undefined,
    passenger: String(r.passenger ?? 'Estudiante'),
    route: String(r.route ?? ''),
    totalClp: Number(r.total_clp ?? 0),
    paymentStatus: String(r.payment_status ?? ''),
    dueAt: String(r.due_at ?? ''),
  }));
}

export async function resolveDispute(
  disputeId: string,
  approve: boolean,
  note?: string
): Promise<Dispute> {
  const { data, error } = await supabase.rpc('resolve_dispute', {
    p_dispute_id: disputeId,
    p_approve: approve,
    p_note: note ?? null,
  });
  if (error) throw error;
  return mapDispute(data);
}

/** Bandeja en vivo: nuevas disputas y resoluciones. */
export function subscribeDisputes(onChange: () => void): RealtimeChannel {
  return supabase
    .channel('public:disputes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'disputes' }, onChange)
    .subscribe();
}

// ---------------------------------------------------------------------------
// Liquidaciones / "Mis ganancias" del conductor
// ---------------------------------------------------------------------------

export type EarningItem = {
  bookingId: string;
  route: string;
  grossClp: number;
  commissionClp: number;
  netClp: number;
  confirmedAt?: string;
  settled: boolean;
};

export type DriverEarnings = {
  grossClp: number;
  commissionClp: number;
  netClp: number;
  paymentCount: number;
  pendingGrossClp: number;
  pendingCommissionClp: number;
  pendingNetClp: number;
  items: EarningItem[];
};

export async function getDriverEarnings(): Promise<DriverEarnings> {
  const { data, error } = await supabase.rpc('driver_earnings');
  if (error) throw error;
  const j = (data ?? {}) as Record<string, Json>;
  const items = Array.isArray(j.items) ? (j.items as Array<Record<string, Json>>) : [];
  return {
    grossClp: Number(j.gross_clp ?? 0),
    commissionClp: Number(j.commission_clp ?? 0),
    netClp: Number(j.net_clp ?? 0),
    paymentCount: Number(j.payment_count ?? 0),
    pendingGrossClp: Number(j.pending_gross_clp ?? 0),
    pendingCommissionClp: Number(j.pending_commission_clp ?? 0),
    pendingNetClp: Number(j.pending_net_clp ?? 0),
    items: items.map((it) => ({
      bookingId: String(it.booking_id),
      route: String(it.route ?? ''),
      grossClp: Number(it.gross_clp ?? 0),
      commissionClp: Number(it.commission_clp ?? 0),
      netClp: Number(it.net_clp ?? 0),
      confirmedAt: it.confirmed_at ? String(it.confirmed_at) : undefined,
      settled: Boolean(it.settled),
    })),
  };
}

export type Payout = {
  id: string;
  driverId: string;
  periodStart: string;
  periodEnd: string;
  grossClp: number;
  commissionClp: number;
  netClp: number;
  paymentCount: number;
  status: PayoutRow['status'];
  note?: string;
  createdAt: string;
  paidAt?: string;
};

function mapPayout(row: PayoutRow): Payout {
  return {
    id: row.id,
    driverId: row.driver_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    grossClp: row.gross_clp,
    commissionClp: row.commission_clp,
    netClp: row.net_clp,
    paymentCount: row.payment_count,
    status: row.status,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    paidAt: row.paid_at ?? undefined,
  };
}

/** Historial de liquidaciones (RLS: el conductor ve las suyas; el owner todas). */
export async function listPayouts(driverId?: string): Promise<Payout[]> {
  let query = supabase.from('payouts').select('*').order('created_at', { ascending: false });
  if (driverId) query = query.eq('driver_id', driverId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapPayout);
}

export async function createPayout(
  driverId: string,
  periodStart: string,
  periodEnd: string
): Promise<Payout> {
  const { data, error } = await supabase.rpc('create_payout', {
    p_driver_id: driverId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });
  if (error) throw error;
  return mapPayout(data);
}

export async function markPayoutPaid(payoutId: string): Promise<Payout> {
  const { data, error } = await supabase.rpc('mark_payout_paid', { p_payout_id: payoutId });
  if (error) throw error;
  return mapPayout(data);
}

// ---------------------------------------------------------------------------
// Panel financiero del owner
// ---------------------------------------------------------------------------

export type CampusVolume = {
  campus: string;
  volumeClp: number;
  commissionClp: number;
  count: number;
};

export type OwnerFinance = {
  totalCommissionClp: number;
  totalVolumeClp: number;
  confirmedCount: number;
  byCampus: CampusVolume[];
  morosidad: {
    overdueCount: number;
    overdueClp: number;
    disputedCount: number;
    openDisputes: number;
    activeStrikes: number;
    activeBans: number;
  };
  payoutsPendingNetClp: number;
};

export async function getOwnerFinance(): Promise<OwnerFinance> {
  const { data, error } = await supabase.rpc('owner_finance_summary');
  if (error) throw error;
  const j = (data ?? {}) as Record<string, Json>;
  const byCampus = Array.isArray(j.by_campus) ? (j.by_campus as Array<Record<string, Json>>) : [];
  const m = (j.morosidad ?? {}) as Record<string, Json>;
  return {
    totalCommissionClp: Number(j.total_commission_clp ?? 0),
    totalVolumeClp: Number(j.total_volume_clp ?? 0),
    confirmedCount: Number(j.confirmed_count ?? 0),
    byCampus: byCampus.map((c) => ({
      campus: String(c.campus ?? 'Sin campus'),
      volumeClp: Number(c.volume_clp ?? 0),
      commissionClp: Number(c.commission_clp ?? 0),
      count: Number(c.count ?? 0),
    })),
    morosidad: {
      overdueCount: Number(m.overdue_count ?? 0),
      overdueClp: Number(m.overdue_clp ?? 0),
      disputedCount: Number(m.disputed_count ?? 0),
      openDisputes: Number(m.open_disputes ?? 0),
      activeStrikes: Number(m.active_strikes ?? 0),
      activeBans: Number(m.active_bans ?? 0),
    },
    payoutsPendingNetClp: Number(j.payouts_pending_net_clp ?? 0),
  };
}

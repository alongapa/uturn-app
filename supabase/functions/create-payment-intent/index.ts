// Edge Function: crea la intención de pago de una reserva contra el proveedor
// (Fintoc) y la deja lista para verificación automática por webhook.
//
// Flujo (Sesión 8):
//   1. Autentica al pasajero por su JWT (verify_jwt = true).
//   2. prepare_payment_intent (service role) valida la reserva y calcula el pago
//      parcial con créditos; devuelve el monto en efectivo a cobrar (cash_clp).
//      Si los créditos cubren todo, el pago queda 'confirmed' y no se llama a Fintoc.
//   3. Crea la intención en Fintoc (sandbox) y guarda su id con attach_provider_intent.
//      El webhook (fintoc-webhook) marcará 'confirmed' cuando la transferencia
//      se acredite: el conductor no tiene que confirmar nada.
//
// Secretos (variables de entorno, NUNCA en el repo ni en el cliente):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (los inyecta Supabase)
//   FINTOC_SECRET_KEY   — clave secreta del proyecto Fintoc (sandbox al probar)
//   FINTOC_API_URL      — opcional; por defecto https://api.fintoc.com/v1
//
// Sin FINTOC_SECRET_KEY la función degrada a una intención SIMULADA (id sim_*)
// para poder probar el ciclo en sandbox sin credenciales; el webhook simulado o
// el test SQL la verifican igual. Deploy:
//   supabase functions deploy create-payment-intent
//
// Corre en Deno (Supabase Edge Runtime); excluido de tsc/eslint del proyecto.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FINTOC_API_URL = Deno.env.get('FINTOC_API_URL') ?? 'https://api.fintoc.com/v1';

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type PaymentRow = {
  id: string;
  booking_id: string;
  status: string;
  total_clp: number;
  cash_clp: number | null;
  credits_clp: number;
  credits_applied: number;
  provider_intent_id: string | null;
};

// Crea la intención en Fintoc. Devuelve el id y, si aplica, datos del widget/checkout.
// Ante cualquier fallo o falta de credenciales, cae a una intención simulada.
async function createFintocIntent(
  payment: PaymentRow
): Promise<{ intentId: string; checkoutUrl: string | null; widgetToken: string | null; simulated: boolean }> {
  const secret = Deno.env.get('FINTOC_SECRET_KEY');
  if (!secret) {
    return {
      intentId: `sim_${crypto.randomUUID()}`,
      checkoutUrl: null,
      widgetToken: null,
      simulated: true,
    };
  }
  try {
    const res = await fetch(`${FINTOC_API_URL}/payment_intents`, {
      method: 'POST',
      headers: { Authorization: secret, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: payment.cash_clp, // CLP no usa decimales
        currency: 'clp',
        // Referencia para casar el webhook con nuestra reserva.
        reference_id: payment.booking_id,
        metadata: { booking_id: payment.booking_id, payment_id: payment.id },
      }),
    });
    if (!res.ok) {
      console.error('Fintoc payment_intents falló', res.status, await res.text());
      return { intentId: `sim_${crypto.randomUUID()}`, checkoutUrl: null, widgetToken: null, simulated: true };
    }
    const data = await res.json();
    return {
      intentId: data.id ?? `sim_${crypto.randomUUID()}`,
      checkoutUrl: data.checkout_url ?? data.next_url ?? null,
      widgetToken: data.widget_token ?? null,
      simulated: false,
    };
  } catch (err) {
    console.error('Fintoc payment_intents error', err);
    return { intentId: `sim_${crypto.randomUUID()}`, checkoutUrl: null, widgetToken: null, simulated: true };
  }
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY' }, 500);
    }

    // 1. Identidad del pasajero desde su JWT.
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'No autenticado' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json({ error: 'Sesión inválida' }, 401);
    const uid = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const bookingId = String(body.bookingId ?? '');
    const credits = Math.max(0, Math.floor(Number(body.credits ?? 0)) || 0);
    if (!bookingId) return json({ error: 'Falta bookingId' }, 400);

    // 2. Prepara el pago (valida reserva + créditos, calcula cash_clp).
    const { data: prepared, error: prepError } = await admin.rpc('prepare_payment_intent', {
      p_user: uid,
      p_booking_id: bookingId,
      p_credits: credits,
    });
    if (prepError) return json({ error: prepError.message }, 400);
    const payment = prepared as PaymentRow;

    // Cubierto por completo con créditos: ya quedó 'confirmed'.
    if (payment.status === 'confirmed') {
      return json({
        status: 'confirmed',
        paymentId: payment.id,
        cashClp: 0,
        creditsClp: payment.credits_clp,
        creditsApplied: payment.credits_applied,
      });
    }

    // 3. Crea la intención en Fintoc y guarda su id.
    const intent = await createFintocIntent(payment);
    const { error: attachError } = await admin.rpc('attach_provider_intent', {
      p_payment_id: payment.id,
      p_intent_id: intent.intentId,
      p_status: intent.simulated ? 'sandbox_pending' : 'intent_pending',
    });
    if (attachError) return json({ error: attachError.message }, 500);

    return json({
      status: 'pending',
      paymentId: payment.id,
      intentId: intent.intentId,
      cashClp: payment.cash_clp,
      creditsClp: payment.credits_clp,
      creditsApplied: payment.credits_applied,
      checkoutUrl: intent.checkoutUrl,
      widgetToken: intent.widgetToken,
      simulated: intent.simulated,
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

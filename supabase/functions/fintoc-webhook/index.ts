// Edge Function: webhook de Fintoc. Verifica la firma, deduplica el evento y, al
// acreditarse la transferencia, marca el pago como 'confirmed' (verificación
// automática — el conductor no confirma nada; el trigger dispara push y créditos).
//
// Seguridad (Sesión 8):
//   - verify_jwt = false: el webhook llega sin sesión, pero se valida la FIRMA.
//   - La firma se comprueba con HMAC-SHA256 sobre `${timestamp}.${rawBody}` usando
//     FINTOC_WEBHOOK_SECRET (esquema `t=...,v1=...`, compatible con Fintoc/Stripe).
//   - Idempotencia: cada evento se registra en payment_events (unique provider,
//     provider_event_id); un reintento no re-procesa.
//
// Secretos (variables de entorno, NUNCA en el repo ni en el cliente):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (los inyecta Supabase)
//   FINTOC_WEBHOOK_SECRET — secreto de firma del webhook (del dashboard de Fintoc)
//
// Deploy:
//   supabase functions deploy fintoc-webhook --no-verify-jwt
//
// Corre en Deno (Supabase Edge Runtime); excluido de tsc/eslint del proyecto.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60; // rechaza timestamps > 5 min (replay)

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Header `Fintoc-Signature: t=<unix>,v1=<hmac>`.
async function verifySignature(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const [k, v] = kv.split('=');
      return [k?.trim(), v?.trim()];
    })
  );
  const t = parts['t'];
  const v1 = parts['v1'];
  if (!t || !v1) return false;

  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  return timingSafeEqual(expected, v1);
}

const SUCCESS_EVENTS = new Set([
  'payment_intent.succeeded',
  'payment.succeeded',
  'charge.succeeded',
  'transfer.succeeded',
]);

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const webhookSecret = Deno.env.get('FINTOC_WEBHOOK_SECRET');
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY' }, 500);
    }
    if (!webhookSecret) {
      // Sin secreto no se puede validar la firma: se rechaza (no se procesa a ciegas).
      return json({ error: 'Falta FINTOC_WEBHOOK_SECRET' }, 500);
    }

    const rawBody = await req.text();
    const signature = req.headers.get('Fintoc-Signature') ?? req.headers.get('fintoc-signature');
    const valid = await verifySignature(rawBody, signature, webhookSecret);
    if (!valid) return json({ error: 'Firma inválida' }, 401);

    const event = JSON.parse(rawBody);
    const eventId: string = event.id ?? event.event_id ?? crypto.randomUUID();
    const eventType: string = event.type ?? event.event ?? '';
    // La intención puede venir en distintos campos según el objeto del evento.
    const obj = event.data?.object ?? event.data ?? event.object ?? {};
    const intentId: string | null =
      obj.payment_intent_id ?? obj.payment_intent ?? obj.id ?? event.payment_intent_id ?? null;

    const admin = createClient(supabaseUrl, serviceKey);

    // Idempotencia: registra el evento; si ya existía, no reprocesar.
    const { error: insertError } = await admin.from('payment_events').insert({
      provider: 'fintoc',
      provider_event_id: eventId,
      event_type: eventType,
      payload: event,
    });
    if (insertError) {
      // 23505 = unique_violation → evento repetido; se responde OK sin reprocesar.
      if ((insertError as { code?: string }).code === '23505') {
        return json({ ok: true, deduped: true });
      }
      return json({ error: insertError.message }, 500);
    }

    if (!SUCCESS_EVENTS.has(eventType) || !intentId) {
      return json({ ok: true, ignored: true, eventType });
    }

    const { data: paymentId, error: verifyError } = await admin.rpc('apply_payment_verification', {
      p_intent_id: intentId,
      p_provider: 'fintoc',
      p_verified_at: new Date().toISOString(),
    });
    if (verifyError) return json({ error: verifyError.message }, 500);

    return json({ ok: true, verified: Boolean(paymentId), paymentId: paymentId ?? null });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

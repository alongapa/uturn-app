// Edge Function: expira pagos vencidos a las 48 h y emite strikes (3 → baneo 2 días).
// Ejecuta la función SQL `public.expire_overdue_payments()` con la service role key,
// de modo que se cumple aunque nadie abra la app y no depende de pg_cron.
//
// Programación (elige una):
//   - pg_cron (ver migración 20260701000004_cron_seed.sql), o
//   - un scheduler que invoque esta función, o
//   - `supabase functions deploy expire-payments` + un cron externo / dashboard.
//
// Deploy:
//   supabase functions deploy expire-payments --no-verify-jwt
// Secretos requeridos (los inyecta Supabase automáticamente en Edge Functions):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Este archivo corre en Deno (Supabase Edge Runtime), no en el bundle de Expo;
// queda excluido de tsc/eslint del proyecto.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (_req: Request) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: 'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data, error } = await admin.rpc('expire_overdue_payments');

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ expired: data ?? 0, ranAt: new Date().toISOString() }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

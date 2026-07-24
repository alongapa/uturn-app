// Edge Function: elimina definitivamente la cuenta del usuario autenticado.
//
// Flujo (Sesión 9):
//   1. Autentica al usuario por su JWT (verify_jwt = true).
//   2. Anonimiza sus datos personales vía la RPC admin_delete_account
//      (server-only, service_role) — red de seguridad si el borrado de
//      auth.users fallara más abajo.
//   3. Borra el usuario de auth.users con la Admin API (service role); el
//      profile se borra en cascada (on delete cascade en profiles.id), y con
//      él todo lo que referencia profiles del mismo modo.
//
// Deploy: supabase functions deploy delete-account
// Secretos requeridos (los inyecta Supabase automáticamente):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Corre en Deno (Supabase Edge Runtime); excluido de tsc/eslint del proyecto.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY' }, 500);
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'No autenticado' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json({ error: 'Sesión inválida' }, 401);
    const uid = userData.user.id;

    const { error: anonError } = await admin.rpc('admin_delete_account', { p_user_id: uid });
    if (anonError) {
      return json({ error: anonError.message }, 500);
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(uid);
    if (deleteError) return json({ error: deleteError.message }, 500);

    return json({ deleted: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

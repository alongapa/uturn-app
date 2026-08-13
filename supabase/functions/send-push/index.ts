// Edge Function: envía las notificaciones pendientes vía Expo Push API.
//
// Flujo (Sesión 7):
//   1. Reclama filas 'pending' de public.notifications con claim_pending_push
//      (atómico: corridas concurrentes no duplican envíos).
//   2. Junta los ExponentPushToken de cada destinatario (push_tokens).
//   3. POST por lotes de 100 a https://exp.host/--/api/v2/push/send.
//   4. Marca sent/skipped/failed y borra tokens muertos (DeviceNotRegistered).
//
// Las preferencias por categoría ya se respetaron al ENCOLAR
// (enqueue_notification): aquí solo se envía lo que quedó en la cola.
//
// Programación: pg_cron la invoca cada minuto vía pg_net (invoke_send_push,
// migración 20260707120001). También puedes llamarla a mano para probar.
//
// Deploy:
//   supabase functions deploy send-push --no-verify-jwt
// (sin verify_jwt, como expire-payments: solo procesa la cola interna y
// responde contadores; no recibe parámetros ni expone datos.)
//
// Este archivo corre en Deno (Supabase Edge Runtime), no en el bundle de Expo;
// queda excluido de tsc/eslint del proyecto.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100; // máximo de mensajes por request según Expo
const CLAIM_LIMIT = 200;

type PendingNotification = {
  id: string;
  user_id: string;
  category: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  data: Record<string, unknown> | null;
};

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: 'default';
  priority: 'high';
  channelId: 'default';
};

type ExpoPushTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (_req: Request) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Reclama la cola.
    const { data: pending, error: claimError } = await admin.rpc('claim_pending_push', {
      p_limit: CLAIM_LIMIT,
    });
    if (claimError) return json({ error: claimError.message }, 500);
    const notifications = (pending ?? []) as PendingNotification[];
    if (notifications.length === 0) {
      return json({ claimed: 0, sent: 0, skipped: 0, failed: 0 });
    }

    // 2. Tokens por usuario.
    const userIds = [...new Set(notifications.map((n) => n.user_id))];
    const { data: tokenRows, error: tokensError } = await admin
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', userIds);
    if (tokensError) return json({ error: tokensError.message }, 500);

    const tokensByUser = new Map<string, string[]>();
    for (const row of tokenRows ?? []) {
      const list = tokensByUser.get(row.user_id) ?? [];
      list.push(row.token);
      tokensByUser.set(row.user_id, list);
    }

    // 3. Mensajes Expo (una notificación puede ir a varios dispositivos).
    const messages: ExpoPushMessage[] = [];
    // Índice paralelo a `messages`: a qué notificación y token corresponde cada uno.
    const messageMeta: { notificationId: string; token: string }[] = [];
    const skippedIds: string[] = [];
    const okByNotification = new Map<string, boolean>();

    for (const n of notifications) {
      const tokens = tokensByUser.get(n.user_id) ?? [];
      if (tokens.length === 0) {
        skippedIds.push(n.id); // sin dispositivo registrado: queda solo en el historial
        continue;
      }
      okByNotification.set(n.id, false);
      for (const token of tokens) {
        messages.push({
          to: token,
          title: n.title,
          body: n.body,
          // `url` es la ruta expo-router que abre el deep link al tocarla.
          data: { ...(n.data ?? {}), url: n.url, notificationId: n.id, category: n.category },
          sound: 'default',
          priority: 'high',
          channelId: 'default',
        });
        messageMeta.push({ notificationId: n.id, token });
      }
    }

    // 4. Envío por lotes y procesamiento de tickets.
    const deadTokens = new Set<string>();
    for (let offset = 0; offset < messages.length; offset += BATCH_SIZE) {
      const batch = messages.slice(offset, offset + BATCH_SIZE);
      const meta = messageMeta.slice(offset, offset + BATCH_SIZE);

      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });

      if (!res.ok) {
        // Lote completo rechazado (p. ej. 429): las filas quedan 'processing'
        // y claim_pending_push las reintenta en la próxima corrida.
        console.error('Expo Push API respondió', res.status, await res.text());
        continue;
      }

      const { data: tickets } = (await res.json()) as { data?: ExpoPushTicket[] };
      (tickets ?? []).forEach((ticket, i) => {
        // Expo devuelve un ticket por mensaje enviado, así que meta[i] debería
        // existir siempre; si el lote viniera descuadrado, ignoramos el ticket
        // en vez de reventar el batch entero al desestructurar undefined.
        const entry = meta[i];
        if (!entry) return;
        const { notificationId, token } = entry;
        if (ticket.status === 'ok') {
          okByNotification.set(notificationId, true);
        } else if (ticket.details?.error === 'DeviceNotRegistered') {
          deadTokens.add(token); // app desinstalada o permisos revocados
        }
      });
    }

    const sentIds: string[] = [];
    const failedIds: string[] = [];
    for (const [id, ok] of okByNotification) {
      (ok ? sentIds : failedIds).push(id);
    }

    // 5. Persistir resultados.
    const now = new Date().toISOString();
    if (sentIds.length > 0) {
      await admin
        .from('notifications')
        .update({ push_status: 'sent', push_sent_at: now })
        .in('id', sentIds);
    }
    if (skippedIds.length > 0) {
      await admin.from('notifications').update({ push_status: 'skipped' }).in('id', skippedIds);
    }
    if (failedIds.length > 0) {
      await admin.from('notifications').update({ push_status: 'failed' }).in('id', failedIds);
    }
    if (deadTokens.size > 0) {
      await admin.from('push_tokens').delete().in('token', [...deadTokens]);
    }

    return json({
      claimed: notifications.length,
      sent: sentIds.length,
      skipped: skippedIds.length,
      failed: failedIds.length,
      deadTokens: deadTokens.size,
      ranAt: now,
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

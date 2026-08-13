// Edge Function: genera y publica la respuesta automática de un bot de IA
// (federación/centro de alumnos o tutor por asignatura) en un DM.
//
// Flujo (Sesión Bots de IA):
//   1. El trigger notify_ai_bot_on_message (Postgres, pg_net) la invoca cada
//      vez que alguien le escribe a un bot habilitado en un DM.
//   2. Junta contexto propio del bot: su persona_name/system_prompt (editado
//      por quien lo administra), más contenido reciente de la entidad que
//      representa (posts del publisher, o guías del tutor en esa asignatura)
//      y el historial reciente de la conversación.
//   3. Llama a la API de Claude (Anthropic) y publica la respuesta como un
//      mensaje más — reutiliza 100% de la mensajería de la Sesión 6
//      (touch_conversation_on_message, notify_on_message, realtime).
//
// Secretos (variables de entorno, NUNCA en el repo ni en el cliente):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (los inyecta Supabase)
//   ANTHROPIC_API_KEY — clave de la API de Claude. Sin ella, la función no
//   revienta: registra el problema y no publica respuesta (el alumno solo ve
//   que el bot no contestó, no un error).
//
// Deploy:
//   supabase functions deploy ai-bot-reply --no-verify-jwt
// (sin verify_jwt: solo la invoca el trigger interno vía pg_net, como
// send-push/expire-payments; no recibe sesión de usuario ni expone datos.)
//
// Corre en Deno (Supabase Edge Runtime); excluido de tsc/eslint del proyecto.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.113.0';

const MODEL = 'claude-opus-4-8';
const MAX_REPLY_TOKENS = 600;
const MAX_BODY_CHARS = 2000; // check de public.messages.body
const HISTORY_LIMIT = 20;
const CONTEXT_ITEMS_LIMIT = 5;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Bot = {
  id: string;
  profile_id: string;
  owner_kind: 'publisher' | 'tutor_topic';
  publisher_id: string | null;
  tutor_id: string | null;
  topic_id: string | null;
  persona_name: string;
  system_prompt: string;
  enabled: boolean;
};

type MessageRow = {
  sender_id: string;
  body: string;
  image_path: string | null;
  created_at: string;
};

// deno-lint-ignore no-explicit-any
async function buildSystemPrompt(admin: any, bot: Bot): Promise<string> {
  const lines: string[] = [];

  if (bot.owner_kind === 'publisher') {
    const { data: publisher } = await admin
      .from('publishers')
      .select('name, kind, description')
      .eq('id', bot.publisher_id)
      .maybeSingle();
    const entity = publisher?.name ?? 'esta organización';
    lines.push(
      `Eres "${bot.persona_name}", el asistente de IA de ${entity} dentro de Unities, la app universitaria de carpooling, feed y tutorías.`
    );
    if (publisher?.description) lines.push(`Sobre ${entity}: ${publisher.description}`);

    const { data: posts } = await admin
      .from('posts')
      .select('post_type, body, created_at')
      .eq('publisher_id', bot.publisher_id)
      .order('created_at', { ascending: false })
      .limit(CONTEXT_ITEMS_LIMIT);
    if (posts && posts.length > 0) {
      lines.push('Publicaciones recientes de la organización (úsalas como contexto, no las repitas literal):');
      for (const p of posts) {
        lines.push(`- (${p.post_type}) ${String(p.body).slice(0, 300)}`);
      }
    }
  } else {
    const { data: topic } = await admin
      .from('topics')
      .select('name')
      .eq('id', bot.topic_id)
      .maybeSingle();
    const { data: tutor } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', bot.tutor_id)
      .maybeSingle();
    const subject = topic?.name ?? 'esta asignatura';
    const tutorName = tutor?.full_name?.trim() || 'el tutor';
    lines.push(
      `Eres "${bot.persona_name}", el asistente de IA de ${tutorName}, tutor de ${subject} en Unities.`
    );

    const { data: guides } = await admin
      .from('guides')
      .select('title, description')
      .eq('topic_id', bot.topic_id)
      .eq('author_id', bot.tutor_id)
      .order('created_at', { ascending: false })
      .limit(CONTEXT_ITEMS_LIMIT);
    if (guides && guides.length > 0) {
      lines.push(`Guías de ${tutorName} sobre ${subject} (referéncialas por nombre si ayudan):`);
      for (const g of guides) {
        lines.push(`- ${g.title}${g.description ? `: ${String(g.description).slice(0, 200)}` : ''}`);
      }
    }
  }

  if (bot.system_prompt.trim()) {
    lines.push('Instrucciones y preguntas frecuentes definidas por quien administra este bot:');
    lines.push(bot.system_prompt.trim());
  }

  lines.push(
    'Reglas: responde en español, en tono cordial y breve (máximo ~120 palabras). ' +
      'Nunca afirmes ser una persona real ni finjas ser un humano si te preguntan. ' +
      'No inventes datos concretos (fechas, precios, horarios, cupos) que no tengas en este contexto — ' +
      'si no lo sabes, dilo y sugiere escribir directo o abrir un ticket de Soporte Unities. ' +
      'No compartas información personal de otros alumnos.'
  );

  return lines.join('\n');
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY' }, 500);
    }
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      console.warn('ANTHROPIC_API_KEY no configurada; el bot no responde.');
      return json({ skipped: true, reason: 'no_api_key' });
    }

    const body = await req.json().catch(() => ({}));
    const conversationId = String(body.conversationId ?? '');
    const botId = String(body.botId ?? '');
    if (!conversationId || !botId) return json({ error: 'Falta conversationId o botId' }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: bot, error: botError } = await admin
      .from('ai_bots')
      .select('*')
      .eq('id', botId)
      .eq('enabled', true)
      .maybeSingle();
    if (botError) return json({ error: botError.message }, 500);
    if (!bot) return json({ skipped: true, reason: 'bot_not_found_or_disabled' });

    const { data: historyRows, error: historyError } = await admin
      .from('messages')
      .select('sender_id, body, image_path, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT);
    if (historyError) return json({ error: historyError.message }, 500);

    const history = ((historyRows ?? []) as MessageRow[]).slice().reverse();
    // La API exige que el primer turno sea 'user': si el recorte de historial
    // empieza con turnos del propio bot, se descartan.
    while (history.length > 0 && history[0]?.sender_id === bot.profile_id) {
      history.shift();
    }
    if (history.length === 0) {
      return json({ skipped: true, reason: 'no_history' });
    }

    const claudeMessages = history.map((m) => ({
      role: m.sender_id === bot.profile_id ? ('assistant' as const) : ('user' as const),
      content: m.body?.trim() || (m.image_path ? '[el alumno adjuntó una imagen]' : '…'),
    }));

    const system = await buildSystemPrompt(admin, bot as Bot);

    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_REPLY_TOKENS,
      thinking: { type: 'adaptive' },
      system,
      messages: claudeMessages,
    });

    let replyText: string;
    if (response.stop_reason === 'refusal') {
      replyText =
        'No puedo responder eso. Si es algo importante, escríbele directo a la organización o abre un ticket de Soporte Unities.';
    } else {
      replyText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();
    }
    if (!replyText) {
      return json({ skipped: true, reason: 'empty_response' });
    }
    if (replyText.length > MAX_BODY_CHARS) {
      replyText = replyText.slice(0, MAX_BODY_CHARS - 1) + '…';
    }

    const { error: insertError } = await admin.from('messages').insert({
      conversation_id: conversationId,
      sender_id: bot.profile_id,
      body: replyText,
    });
    if (insertError) return json({ error: insertError.message }, 500);

    return json({ ok: true, botId, conversationId });
  } catch (err) {
    console.error('ai-bot-reply error', err);
    return json({ error: String(err) }, 500);
  }
});

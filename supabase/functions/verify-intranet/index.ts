// Edge Function: verify-intranet
// Corre en Deno (Supabase Edge Functions), NO en la app RN.
// Flujo:
//  1. Recibe { screenshot_path } de una verification_request 'pending'.
//  2. Descarga el screenshot del bucket privado.
//  3. Usa Claude (visión) para: (a) confirmar que la captura es la página
//     "Información del Alumno" de intranet.uai.cl, y (b) extraer el nombre
//     completo del alumno.
//  4. Compara ese nombre con profiles.name → score 0..1.
//  5. Si la página es correcta y el score supera el umbral → verifica al usuario.
//     Si no, la deja 'pending' para revisión manual del admin.
//
// Deploy:  supabase functions deploy verify-intranet
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const MATCH_THRESHOLD = 0.8;

// Normaliza nombres para comparar (sin acentos, minúsculas, sin dobles espacios).
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Similitud por solapamiento de tokens (Jaccard sobre palabras del nombre).
function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normalize(a).split(' ').filter(Boolean));
  const tb = new Set(normalize(b).split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / new Set([...ta, ...tb]).size;
}

// Convierte bytes a base64 sin reventar el call stack con imágenes grandes.
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

const VISION_PROMPT = `Esta imagen es un screenshot que un alumno subió para verificar que estudia en la Universidad Adolfo Ibáñez (UAI).

Debe ser la página "Información del Alumno" de la intranet de la UAI (intranet.uai.cl/WebPages/InfoAlumno.aspx): muestra el nombre del alumno, datos de carrera/matrícula y branding de la UAI. NO debe ser Webcursos ni otra página.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, con esta forma exacta:
{"is_info_alumno": boolean, "student_name": string}

- is_info_alumno: true solo si la captura corresponde a la página Información del Alumno de la intranet UAI.
- student_name: el nombre completo del alumno tal como aparece en la página; "" si no se ve o la página no corresponde.`;

// Usa Claude (visión) para validar la página y extraer el nombre.
async function extractFromScreenshot(
  imageBytes: Uint8Array,
  mediaType: string,
): Promise<{ isInfoAlumno: boolean; studentName: string | null }> {
  const message = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: toBase64(imageBytes) },
          },
          { type: 'text', text: VISION_PROMPT },
        ],
      },
    ],
  });

  const text = message.content.find((b: { type: string }) => b.type === 'text');
  const raw = text && 'text' in text ? (text as { text: string }).text : '';
  // Extrae el primer objeto JSON aunque venga con texto alrededor.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) return { isInfoAlumno: false, studentName: null };
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return {
      isInfoAlumno: Boolean(parsed.is_info_alumno),
      studentName: parsed.student_name ? String(parsed.student_name) : null,
    };
  } catch {
    return { isInfoAlumno: false, studentName: null };
  }
}

Deno.serve(async (req: Request) => {
  try {
    const { screenshot_path } = await req.json();
    if (!screenshot_path) return json({ error: 'screenshot_path requerido' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // service role: salta RLS
    );

    // Solicitud + perfil del usuario.
    const { data: reqRow, error: reqErr } = await supabase
      .from('verification_requests')
      .select('id, user_id, status')
      .eq('screenshot_path', screenshot_path)
      .single();
    if (reqErr || !reqRow) return json({ error: 'request no encontrada' }, 404);

    const { data: profile } = await supabase
      .from('profiles').select('name').eq('id', reqRow.user_id).single();

    // Descarga el screenshot.
    const dl = await supabase.storage.from('intranet-screenshots').download(screenshot_path);
    if (dl.error || !dl.data) return json({ error: 'no se pudo descargar' }, 500);
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const mediaType = dl.data.type || 'image/jpeg';

    // OCR + extracción de nombre con Claude visión.
    const { isInfoAlumno, studentName } = await extractFromScreenshot(bytes, mediaType);
    const score = studentName && profile ? nameSimilarity(profile.name, studentName) : 0;

    const verified = isInfoAlumno && score >= MATCH_THRESHOLD;
    const status = verified ? 'verified' : 'pending';

    await supabase.from('verification_requests')
      .update({ ocr_name: studentName, name_match_score: score, status })
      .eq('id', reqRow.id);

    if (verified) {
      await supabase.from('profiles').update({ verification_status: 'verified' }).eq('id', reqRow.user_id);
    }

    return json({ ok: true, isInfoAlumno, studentName, score, status });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

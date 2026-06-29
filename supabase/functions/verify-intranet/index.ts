// Edge Function: verify-intranet
// Corre en Deno (Supabase Edge Functions), NO en la app RN.
// Flujo:
//  1. Recibe { screenshot_path } de una verification_request 'pending'.
//  2. Descarga el screenshot del bucket privado.
//  3. Llama a un modelo de visión/OCR para: (a) confirmar que la captura es de
//     la página "Información del Alumno" de intranet.uai.cl, y (b) extraer el
//     nombre completo del alumno.
//  4. Compara ese nombre con profiles.name → score 0..1.
//  5. Si la página es correcta y el score supera el umbral → verifica al usuario.
//     Si no, la deja 'pending' para revisión manual del admin.
//
// Deploy:  supabase functions deploy verify-intranet
// Secrets: supabase secrets set OCR_API_KEY=...   (proveedor de visión/OCR)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

// Llama al proveedor de OCR/visión. Devuelve el nombre detectado y si la página
// corresponde a InfoAlumno. Implementa aquí tu proveedor (OpenAI Vision, Google
// Vision, Anthropic, etc.) usando OCR_API_KEY.
async function extractFromScreenshot(_imageBytes: Uint8Array): Promise<{ isInfoAlumno: boolean; studentName: string | null }> {
  // TODO: reemplazar por la llamada real al modelo de visión.
  // El prompt debe pedir: "¿Es esta la página Información del Alumno de
  // intranet.uai.cl? Devuelve el nombre completo del alumno."
  return { isInfoAlumno: false, studentName: null };
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

    // OCR + extracción de nombre.
    const { isInfoAlumno, studentName } = await extractFromScreenshot(bytes);
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

// Servicio de guías de tutores (Sesión 6): PDF/imágenes en el bucket privado
// `guides` (lectura autenticada por URL firmada; escritura solo tutor+ vía
// RLS de Storage, en su carpeta `<uid>/…`). Consultables desde el Q&A.

import { supabase } from '@/services/supabase';
import type { GuideFileKind, GuideRow } from '@/types/database';

const SIGNED_URL_TTL = 60 * 60; // 1 hora, como services/api/storage.ts

export type Guide = {
  id: string;
  topicId: string;
  authorId: string;
  authorName: string;
  title: string;
  description?: string;
  fileKind: GuideFileKind;
  /** Ruta dentro del bucket (para borrar); la URL firmada es fileUrl. */
  filePath: string;
  /** URL firmada lista para abrir/mostrar. */
  fileUrl?: string;
  createdAt: string;
};

async function requireUid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error('Necesitas iniciar sesión');
  return uid;
}

async function mapGuides(rows: GuideRow[]): Promise<Guide[]> {
  if (rows.length === 0) return [];
  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const names = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data } = await supabase.from('profiles').select('id, full_name').in('id', authorIds);
    (data ?? []).forEach((p) => names.set(p.id, p.full_name?.trim() || 'Tutor'));
  }
  // Las URLs se firman en lote; las rutas que fallen degradan sin URL.
  const urls = new Map<string, string>();
  const { data: signed } = await supabase.storage
    .from('guides')
    .createSignedUrls(rows.map((r) => r.file_path), SIGNED_URL_TTL);
  (signed ?? []).forEach((item) => {
    if (item.signedUrl && item.path) urls.set(item.path, item.signedUrl);
  });
  return rows.map((row) => ({
    id: row.id,
    topicId: row.topic_id,
    authorId: row.author_id,
    authorName: names.get(row.author_id) ?? 'Tutor',
    title: row.title,
    description: row.description ?? undefined,
    fileKind: row.file_kind,
    filePath: row.file_path,
    fileUrl: urls.get(row.file_path),
    createdAt: row.created_at,
  }));
}

export async function listGuides(opts?: { topicId?: string; authorId?: string }): Promise<Guide[]> {
  let query = supabase.from('guides').select('*').order('created_at', { ascending: false });
  if (opts?.topicId) query = query.eq('topic_id', opts.topicId);
  if (opts?.authorId) query = query.eq('author_id', opts.authorId);
  const { data, error } = await query;
  if (error) throw error;
  return mapGuides(data ?? []);
}

const extFromUri = (uri: string, fallback: string) => {
  const clean = uri.split('?')[0] ?? uri;
  const ext = clean.split('.').pop()?.toLowerCase();
  return ext && ext.length <= 5 ? ext : fallback;
};

/**
 * Sube una guía (la RLS de Storage y de la tabla exigen rol tutor+). El
 * archivo va a `guides/<uid>/…`; el registro la asocia al tema.
 */
export async function uploadGuide(input: {
  topicId: string;
  title: string;
  description?: string;
  fileUri: string;
  fileKind: GuideFileKind;
}): Promise<Guide> {
  const uid = await requireUid();
  const ext = extFromUri(input.fileUri, input.fileKind === 'pdf' ? 'pdf' : 'jpg');
  const path = `${uid}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
  const res = await fetch(input.fileUri);
  const body = await res.arrayBuffer();
  const contentType =
    input.fileKind === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg';
  const { error: uploadError } = await supabase.storage
    .from('guides')
    .upload(path, body, { contentType });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('guides')
    .insert({
      topic_id: input.topicId,
      author_id: uid,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      file_path: path,
      file_kind: input.fileKind,
    })
    .select('*')
    .single();
  if (error) throw error;
  const [guide] = await mapGuides([data]);
  return guide;
}

export async function deleteGuide(guide: Pick<Guide, 'id' | 'filePath'>): Promise<void> {
  const { error } = await supabase.from('guides').delete().eq('id', guide.id);
  if (error) throw error;
  await supabase.storage.from('guides').remove([guide.filePath]).then(
    () => undefined,
    () => undefined
  );
}

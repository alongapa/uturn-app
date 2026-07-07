// Servicio de Storage sobre Supabase. Buckets privados avatars/credentials:
// la lectura siempre por URL firmada. Rutas: `<uid>/<archivo>`.

import { supabase } from '@/services/supabase';

const SIGNED_URL_TTL = 60 * 60; // 1 hora

const extFromUri = (uri: string) => {
  const clean = uri.split('?')[0] ?? uri;
  const ext = clean.split('.').pop()?.toLowerCase();
  return ext && ext.length <= 5 ? ext : 'jpg';
};

const contentType = (ext: string) => (ext === 'png' ? 'image/png' : 'image/jpeg');

async function uriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const res = await fetch(uri);
  return res.arrayBuffer();
}

type StorageBucket = 'avatars' | 'credentials' | 'dispute-evidence';

async function uploadToBucket(
  bucket: StorageBucket,
  userId: string,
  uri: string,
  name: string
): Promise<{ path: string; signedUrl: string }> {
  const ext = extFromUri(uri);
  const path = `${userId}/${name}-${Date.now()}.${ext}`;
  const body = await uriToArrayBuffer(uri);

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, body, { contentType: contentType(ext), upsert: true });
  if (error) throw error;

  const { data, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signError) throw signError;

  return { path, signedUrl: data.signedUrl };
}

export function uploadAvatar(userId: string, uri: string) {
  return uploadToBucket('avatars', userId, uri, 'avatar');
}

export function uploadCredential(userId: string, uri: string) {
  return uploadToBucket('credentials', userId, uri, 'credential');
}

/** Comprobante de una disputa "yo sí pagué" (bucket privado dispute-evidence). */
export function uploadDisputeEvidence(userId: string, uri: string) {
  return uploadToBucket('dispute-evidence', userId, uri, 'comprobante');
}

/** Renueva la URL firmada de un objeto ya subido (p. ej. al abrir el perfil). */
export async function getSignedUrl(bucket: StorageBucket, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL);
  if (error) throw error;
  return data.signedUrl;
}

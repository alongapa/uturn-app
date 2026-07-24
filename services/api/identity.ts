// Identidad (Sesión 9): revisión de credenciales en bandeja (antes automática
// por captura, ahora la aprueba tutor+) y verificación reforzada opcional de
// conductor (cédula + licencia). Storage: buckets privados `credentials`
// (Sesión 3) y `driver-documents` (Sesión 9), ruta `<uid>/<archivo>`.

import { supabase } from '@/services/supabase';
import type {
  CredentialReviewItem,
  DriverVerificationListItem,
  DriverVerificationRow,
  ProfileRow,
} from '@/types/database';
import { getSignedUrl, uploadDriverDocument } from './storage';

export async function submitCredentialReview(): Promise<ProfileRow> {
  const { data, error } = await supabase.rpc('submit_credential_review');
  if (error) throw error;
  return data;
}

export async function reviewCredential(userId: string, approve: boolean, note?: string): Promise<ProfileRow> {
  const { data, error } = await supabase.rpc('review_credential', {
    p_user_id: userId,
    p_approve: approve,
    p_note: note ?? null,
  });
  if (error) throw error;
  return data;
}

export async function listCredentialReviews(status: string | null = 'en_revision'): Promise<CredentialReviewItem[]> {
  const { data, error } = await supabase.rpc('list_credential_reviews', { p_status: status });
  if (error) throw error;
  return data ?? [];
}

/** URL firmada de la última captura de intranet subida por ese usuario (bandeja de revisión). */
export async function getCredentialImageUrl(userId: string): Promise<string | null> {
  const { data: files, error } = await supabase.storage.from('credentials').list(userId, {
    sortBy: { column: 'created_at', order: 'desc' },
  });
  if (error || !files || files.length === 0) return null;
  return getSignedUrl('credentials', `${userId}/${files[0].name}`);
}

export async function submitDriverVerification(idUri: string, licenseUri: string, userId: string): Promise<DriverVerificationRow> {
  const [idUpload, licenseUpload] = await Promise.all([
    uploadDriverDocument(userId, idUri, 'cedula'),
    uploadDriverDocument(userId, licenseUri, 'licencia'),
  ]);
  const { data, error } = await supabase.rpc('submit_driver_verification', {
    p_id_path: idUpload.path,
    p_license_path: licenseUpload.path,
  });
  if (error) throw error;
  return data;
}

export async function reviewDriverVerification(
  userId: string,
  approve: boolean,
  note?: string
): Promise<DriverVerificationRow> {
  const { data, error } = await supabase.rpc('review_driver_verification', {
    p_user_id: userId,
    p_approve: approve,
    p_note: note ?? null,
  });
  if (error) throw error;
  return data;
}

export async function listDriverVerifications(status: string | null = 'en_revision'): Promise<DriverVerificationListItem[]> {
  const { data, error } = await supabase.rpc('list_driver_verifications', { p_status: status });
  if (error) throw error;
  return data ?? [];
}

export async function getMyDriverVerification(userId: string): Promise<DriverVerificationRow | null> {
  const { data, error } = await supabase
    .from('driver_verifications')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

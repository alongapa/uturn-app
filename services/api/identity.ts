// Identidad: verificación automática por coincidencia nombre↔correo
// institucional (reemplazó la captura de intranet; ver
// services/identity/name-email-match.ts + RPC verify_credential_by_email_match).
// Un admin/tutor puede revisar manualmente los casos que no coincidieron.
// Verificación reforzada opcional de conductor (cédula + licencia) en el bucket
// privado `driver-documents` (Sesión 9), ruta `<uid>/<archivo>`.

import { supabase } from '@/services/supabase';
import type {
  CredentialReviewItem,
  DriverVerificationListItem,
  DriverVerificationRow,
  ProfileRow,
} from '@/types/database';
import { uploadDriverDocument } from './storage';

export type EmailMatchResult = { verified: boolean; score: number; manual: boolean };

/**
 * Verificación automática por coincidencia nombre↔correo institucional
 * (reemplaza la captura de intranet). El servidor recalcula la coincidencia
 * desde el perfil (fuente de verdad) y fija `credential_verified`. La llama la
 * pantalla de inicio de sesión tras validar el código y el perfil al guardar
 * el nombre. No pisa una verificación manual de un admin.
 */
export async function verifyCredentialByEmailMatch(): Promise<EmailMatchResult> {
  const { data, error } = await supabase.rpc('verify_credential_by_email_match');
  if (error) throw error;
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    verified: Boolean(raw.verified),
    score: Number(raw.score ?? 0),
    manual: Boolean(raw.manual),
  };
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

export async function listCredentialReviews(status: string | null = 'pendiente'): Promise<CredentialReviewItem[]> {
  const { data, error } = await supabase.rpc('list_credential_reviews', { p_status: status });
  if (error) throw error;
  return data ?? [];
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

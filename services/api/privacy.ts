// Privacidad y datos (Sesión 9): visibilidad del perfil público, exportar
// datos propios y eliminar cuenta. El borrado real de auth.users pasa por la
// Edge Function delete-account (necesita la Admin API, service_role).

import { supabase } from '@/services/supabase';
import type { ProfileVisibility } from '@/types/database';
import { updateProfile } from './profiles';

export type PublicProfile = {
  id: string;
  fullName?: string;
  avatarUrl?: string | null;
  ratingAvg?: number;
  universityId?: string | null;
  credentialVerified?: boolean;
  completedTrips?: number;
  memberSince?: string;
  isBlocked?: boolean;
  hidden?: boolean;
};

export async function getPublicProfile(userId: string): Promise<PublicProfile> {
  const { data, error } = await supabase.rpc('get_public_profile', { p_user_id: userId });
  if (error) throw error;
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    id: String(raw.id ?? userId),
    fullName: raw.fullName as string | undefined,
    avatarUrl: raw.avatarUrl as string | null | undefined,
    ratingAvg: raw.ratingAvg as number | undefined,
    universityId: raw.universityId as string | null | undefined,
    credentialVerified: raw.credentialVerified as boolean | undefined,
    completedTrips: raw.completedTrips as number | undefined,
    memberSince: raw.memberSince as string | undefined,
    isBlocked: raw.isBlocked as boolean | undefined,
    hidden: raw.hidden as boolean | undefined,
  };
}

export async function setProfileVisibility(userId: string, visibility: ProfileVisibility): Promise<void> {
  await updateProfile(userId, { profile_visibility: visibility });
}

export async function setEmergencyContact(userId: string, name: string, phone: string): Promise<void> {
  await updateProfile(userId, { emergency_contact_name: name, emergency_contact_phone: phone });
}

/** Descarga (como jsonb) todos los datos propios del usuario autenticado. */
export async function exportMyData(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}

/**
 * Elimina la cuenta definitivamente: llama a la Edge Function delete-account
 * con el JWT vigente (verifica identidad, anonimiza y borra auth.users).
 * Cierra la sesión localmente después de que el servidor confirme el borrado.
 */
export async function deleteMyAccount(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Necesitas iniciar sesión');

  const { data, error } = await supabase.functions.invoke('delete-account', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) throw error;
  if (data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
}

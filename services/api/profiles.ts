// Servicio de perfiles sobre Supabase. Devuelve las formas que ya usan las
// pantallas (UserProfile de store/appState, User de models/types).

import type { AccountRole, BankDetails } from '@/models/types';
import { supabase } from '@/services/supabase';
import type { Json, ProfileRow } from '@/types/database';
import { asBankDetails, mapProfileToUserProfile } from './mappers';
import { getSignedUrl } from './storage';

export type ProfilePatch = Partial<{
  full_name: string;
  avatar_url: string | null;
  date_of_birth: string | null;
  travel_mode: 'driver' | 'rider';
  university_id: string | null;
  home_campus_id: string | null;
  credential_verified: boolean;
  driver_license_number: string | null;
  driver_license_expiration: string | null;
  // Sesión 9: privacidad y seguridad en viaje. credential_review_status,
  // moderation_* y demás columnas server-managed quedan fuera a propósito
  // (protect_profile_columns las blinda igual, pero ni se ofrecen aquí).
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  profile_visibility: 'publico' | 'oculto';
}>;

export async function getProfileRow(id: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getMyProfileRow(): Promise<ProfileRow | null> {
  const { data: session } = await supabase.auth.getUser();
  const uid = session.user?.id;
  if (!uid) return null;
  return getProfileRow(uid);
}

/**
 * avatar_url guarda la RUTA dentro del bucket privado `avatars` (no una URL):
 * aquí se convierte en URL firmada temporal para mostrarla. Las URIs locales
 * (modo offline) y URLs http se devuelven tal cual.
 */
export async function resolveAvatarUrl(avatarUrl: string | null | undefined): Promise<string | undefined> {
  if (!avatarUrl) return undefined;
  if (/^(https?|file|content|data):/.test(avatarUrl)) return avatarUrl;
  try {
    return await getSignedUrl('avatars', avatarUrl);
  } catch {
    return undefined;
  }
}

/** Perfil del usuario autenticado en la forma UserProfile que consumen las pantallas. */
export async function getMyProfile() {
  const row = await getMyProfileRow();
  if (!row) return null;
  const [bankDetails, avatarUrl] = await Promise.all([
    getMyBankDetails().catch(() => undefined),
    resolveAvatarUrl(row.avatar_url),
  ]);
  const profile = mapProfileToUserProfile(row, bankDetails ?? undefined);
  return { ...profile, urlFotoPerfil: avatarUrl };
}

// --- Datos bancarios (tabla bank_details, RLS de solo-dueño) ---

export async function getMyBankDetails(): Promise<BankDetails | undefined> {
  const { data: session } = await supabase.auth.getUser();
  const uid = session.user?.id;
  if (!uid) return undefined;
  const { data, error } = await supabase
    .from('bank_details')
    .select('details')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  return asBankDetails(data?.details);
}

export async function upsertMyBankDetails(userId: string, details: BankDetails | null): Promise<void> {
  if (!details) {
    const { error } = await supabase.from('bank_details').delete().eq('user_id', userId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from('bank_details')
    .upsert({ user_id: userId, details: details as unknown as Json });
  if (error) throw error;
}

/**
 * Datos bancarios de un conductor vía RPC: el servidor solo los entrega al
 * propio conductor o a pasajeros con una reserva no cancelada en sus viajes.
 */
export async function getDriverBankDetails(driverId: string): Promise<BankDetails | undefined> {
  const { data, error } = await supabase.rpc('get_driver_bank_details', { p_driver_id: driverId });
  if (error) throw error;
  return asBankDetails(data);
}

export async function updateProfile(id: string, patch: ProfilePatch): Promise<ProfileRow> {
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function setCredentialVerified(id: string, verified: boolean) {
  return updateProfile(id, { credential_verified: verified });
}

/** Solo admin/owner (lo refuerza RLS + trigger); útil para el panel de la Sesión 5. */
export async function setAccountRole(id: string, role: AccountRole) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ account_role: role })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

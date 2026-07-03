// Servicio de perfiles sobre Supabase. Devuelve las formas que ya usan las
// pantallas (UserProfile de store/appState, User de models/types).

import type { AccountRole, User } from '@/models/types';
import { supabase } from '@/services/supabase';
import type { ProfileRow } from '@/types/database';
import { mapProfileToUserProfile } from './mappers';

export type ProfilePatch = Partial<{
  full_name: string;
  avatar_url: string | null;
  date_of_birth: string | null;
  travel_mode: 'driver' | 'rider';
  university_id: string | null;
  home_campus_id: string | null;
  credential_verified: boolean;
  bank_details: User['bankDetails'] | null;
  driver_license_number: string | null;
  driver_license_expiration: string | null;
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

/** Perfil del usuario autenticado en la forma UserProfile que consumen las pantallas. */
export async function getMyProfile() {
  const row = await getMyProfileRow();
  return row ? mapProfileToUserProfile(row) : null;
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

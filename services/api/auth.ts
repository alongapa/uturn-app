// Autenticación por OTP / magic link al correo institucional (Supabase Auth).
// La validación de dominio se refuerza en el servidor (trigger enforce_university_email);
// aquí se valida también en el cliente para dar feedback inmediato.

import { UNIVERSITIES, type UniversityId } from '@/constants/campuses';
import { supabase } from '@/services/supabase';

export type SignUpMeta = {
  full_name?: string;
  university_id?: UniversityId;
  home_campus_id?: string;
  date_of_birth?: string;
};

/** Largo del código OTP enviado por Supabase (ver supabase/config.toml: otp_length). */
export const OTP_LENGTH = 8;

const ALLOWED_DOMAINS: { domain: string; universityId: UniversityId }[] = UNIVERSITIES.flatMap((u) =>
  u.domains.map((domain) => ({ domain: domain.toLowerCase(), universityId: u.id }))
);

export function universityFromEmail(email: string): UniversityId | null {
  const normalized = email.trim().toLowerCase();
  return ALLOWED_DOMAINS.find(({ domain }) => normalized.endsWith(domain))?.universityId ?? null;
}

export function isUniversityEmail(email: string): boolean {
  return universityFromEmail(email) !== null;
}

/** Envía el código OTP / magic link. Crea el usuario si no existe (dispara el trigger). */
export async function signInWithOtp(email: string, meta?: SignUpMeta): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!isUniversityEmail(normalized)) {
    throw new Error('Usa tu correo institucional (@alumnos.uai.cl, @udd.cl o @miuandes.cl)');
  }
  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: { shouldCreateUser: true, data: meta },
  });
  if (error) throw error;
}

/** Verifica el código OTP (OTP_LENGTH dígitos) recibido por correo. */
export async function verifyOtp(email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email',
  });
  if (error) throw error;
  return data;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

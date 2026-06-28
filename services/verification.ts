import { INSTITUTIONAL_EMAILS } from '@/constants/institutionalEmails';
import { getUniversityIdFromEmail, getIntranetForEmail } from '@/constants/intranets';

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export type VerificationMethod = 'email-registry' | 'intranet-screenshot' | 'none';

export interface VerificationResult {
  status: VerificationStatus;
  method: VerificationMethod;
  message: string;
}

/**
 * Padrón en memoria. Arranca desde la lista oficial (constants) y permite
 * agregar correos en runtime si el backend los entrega más adelante.
 */
const registry: Record<string, true> = {};
for (const list of Object.values(INSTITUTIONAL_EMAILS)) {
  for (const email of list) {
    registry[email.trim().toLowerCase()] = true;
  }
}

/** ¿El correo está en el padrón oficial de la universidad? */
export function isEmailRegistered(email: string): boolean {
  return registry[email.trim().toLowerCase()] === true;
}

/** Carga correos al padrón (ej: cuando la universidad entrega su base de datos). */
export function registerInstitutionalEmails(emails: string[]): number {
  let added = 0;
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (email && !registry[email]) {
      registry[email] = true;
      added += 1;
    }
  }
  return added;
}

/**
 * Verifica al alumno. Lógica:
 * 1. Dominio no institucional → rechazado.
 * 2. Correo en el padrón oficial → verificado automáticamente.
 * 3. Correo institucional pero sin padrón → queda PENDIENTE de revisión del
 *    screenshot de intranet (verificación manual / asistida).
 */
export function verifyStudent(email: string, hasIntranetScreenshot: boolean): VerificationResult {
  const uniId = getUniversityIdFromEmail(email);
  if (!uniId) {
    return {
      status: 'rejected',
      method: 'none',
      message: 'El correo no corresponde a una universidad habilitada.',
    };
  }

  if (isEmailRegistered(email)) {
    return {
      status: 'verified',
      method: 'email-registry',
      message: 'Cuenta verificada automáticamente con el padrón institucional.',
    };
  }

  if (hasIntranetScreenshot) {
    return {
      status: 'pending',
      method: 'intranet-screenshot',
      message: 'Recibimos tu screenshot de intranet. Tu cuenta queda en revisión.',
    };
  }

  return {
    status: 'unverified',
    method: 'none',
    message: 'Sube un screenshot de tu intranet para verificar tu cuenta.',
  };
}

export { getIntranetForEmail, getUniversityIdFromEmail };

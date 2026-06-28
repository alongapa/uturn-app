import type { UniversityId } from './campuses';

/**
 * BASE DE DATOS DE CORREOS INSTITUCIONALES
 * ----------------------------------------
 * Aquí se almacena el padrón de correos válidos que entregue cada universidad.
 * Mientras no tengamos la lista oficial, queda vacío y la verificación cae en
 * "revisión manual" (screenshot de intranet). Cuando la universidad entregue el
 * listado, basta con pegarlo aquí (o cargarlo desde el backend) y los alumnos de
 * esos correos quedan verificados automáticamente al registrarse.
 *
 * Formato: correo en minúsculas, sin espacios.
 */
export const INSTITUTIONAL_EMAILS: Record<UniversityId, string[]> = {
  uai: [
    // 'juan.perez@alumnos.uai.cl',
  ],
  udd: [
    // 'maria.gonzalez@udd.cl',
  ],
  uandes: [
    // 'pedro.soto@miuandes.cl',
  ],
};

/** Total de correos cargados en el padrón (para mostrar en panel admin). */
export function countInstitutionalEmails(): number {
  return Object.values(INSTITUTIONAL_EMAILS).reduce((acc, list) => acc + list.length, 0);
}

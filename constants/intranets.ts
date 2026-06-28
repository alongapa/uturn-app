import type { UniversityId } from './campuses';

/**
 * Configuración de la intranet de cada universidad.
 * Cuando un alumno se registra, mostramos la imagen de referencia de SU intranet
 * para que suba un screenshot equivalente y podamos validar que es alumno real.
 */
export interface IntranetConfig {
  universityId: UniversityId;
  name: string;
  /** Dominios de correo institucional aceptados para esta universidad */
  domains: string[];
  /** Imagen de referencia de cómo se ve la intranet de esta universidad */
  referenceImage: any;
  /** URL pública del portal (solo informativa para el alumno) */
  portalUrl: string;
  /** Pistas visuales que debe contener el screenshot del alumno */
  expectedHints: string[];
}

export const INTRANETS: Record<UniversityId, IntranetConfig> = {
  uai: {
    universityId: 'uai',
    name: 'Webcursos UAI',
    domains: ['@alumnos.uai.cl', '@uai.cl'],
    referenceImage: require('@/assets/images/intranet-uai.png'),
    portalUrl: 'https://webcursos.uai.cl',
    expectedHints: ['Nombre del alumno', 'Logo UAI', 'Listado de cursos inscritos'],
  },
  udd: {
    universityId: 'udd',
    name: 'Intranet UDD',
    domains: ['@udd.cl', '@miudd.cl'],
    referenceImage: require('@/assets/images/intranet-udd.png'),
    portalUrl: 'https://intranet.udd.cl',
    expectedHints: ['Nombre del alumno', 'Logo UDD', 'Malla / ramos del semestre'],
  },
  uandes: {
    universityId: 'uandes',
    name: 'Intranet Uandes',
    domains: ['@miuandes.cl', '@uandes.cl'],
    referenceImage: require('@/assets/images/intranet-uandes.jpeg'),
    portalUrl: 'https://intranet.uandes.cl',
    expectedHints: ['Nombre del alumno', 'Logo Universidad de los Andes', 'Cursos vigentes'],
  },
};

/** Detecta la universidad a partir del dominio del correo. */
export function getUniversityIdFromEmail(email: string): UniversityId | null {
  const normalized = email.trim().toLowerCase();
  for (const config of Object.values(INTRANETS)) {
    if (config.domains.some((domain) => normalized.endsWith(domain))) {
      return config.universityId;
    }
  }
  return null;
}

/** Devuelve la config de intranet correspondiente al correo. */
export function getIntranetForEmail(email: string): IntranetConfig | null {
  const uniId = getUniversityIdFromEmail(email);
  return uniId ? INTRANETS[uniId] : null;
}

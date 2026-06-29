import type { UniversityId } from './campuses';
import { UNIVERSITIES } from './campuses';

/**
 * Universidades activas en la app.
 * Lanzamiento inicial: SOLO UAI. Para expandir a UDD/Uandes en el futuro,
 * agrega sus ids a esta lista (los datos ya están en constants/campuses.ts).
 */
export const ACTIVE_UNIVERSITY_IDS: UniversityId[] = ['uai'];

/** ¿Es una app de una sola universidad? (oculta selectores multi-U) */
export const IS_SINGLE_UNIVERSITY = ACTIVE_UNIVERSITY_IDS.length === 1;

/** Universidad principal cuando es single-tenant. */
export const PRIMARY_UNIVERSITY_ID = ACTIVE_UNIVERSITY_IDS[0];

export function getActiveUniversities() {
  return UNIVERSITIES.filter((u) => ACTIVE_UNIVERSITY_IDS.includes(u.id));
}

export function isUniversityActive(id: UniversityId) {
  return ACTIVE_UNIVERSITY_IDS.includes(id);
}

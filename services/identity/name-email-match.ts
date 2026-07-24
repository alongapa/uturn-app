// Coincidencia nombre ↔ correo institucional (adelanto en el cliente).
//
// Espeja EXACTAMENTE la lógica del servidor
// (`public.name_email_match_score` / `name_matches_email`, migración
// 20260724000000). El servidor es la fuente de verdad que fija
// `credential_verified`; esto solo da feedback inmediato en la pantalla de
// inicio de sesión ("cuenta los patrones entre tu nombre y tu correo").

const PARTICLES = new Set([
  'de', 'del', 'la', 'las', 'los', 'san', 'santa', 'y', 'da', 'do', 'di', 'von', 'van',
]);

/** minúsculas + sin tildes/ñ (igual que `unaccent_lower` en SQL). */
function unaccentLower(value: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas diacriticas combinantes
    .replace(/ñ/gi, 'n')
    .toLowerCase();
}

/** Umbral de verificación (mismo que el servidor). */
export const MATCH_THRESHOLD = 2;

/**
 * Cuenta los patrones compartidos entre el nombre completo y el local-part del
 * correo. Cada token del nombre (≥3 letras, sin partículas) dentro del
 * local-part suma 1, con +1 si es largo (≥5) y +1 si cubre casi todo el
 * local-part (correo "inicial+apellido" o nombre de pila solo).
 */
export function nameEmailMatchScore(name: string, email: string): number {
  const local = unaccentLower((email ?? '').split('@')[0] ?? '').replace(/[^a-z]/g, '');
  if (!local) return 0;

  let score = 0;
  for (const rawTok of unaccentLower(name ?? '').split(/\s+/)) {
    const tok = rawTok.replace(/[^a-z]/g, '');
    if (tok.length >= 3 && !PARTICLES.has(tok) && local.includes(tok)) {
      score += 1;
      if (tok.length >= 5) score += 1;
      if (tok.length >= local.length - 2) score += 1;
    }
  }
  return score;
}

export function nameMatchesEmail(name: string, email: string): boolean {
  return nameEmailMatchScore(name, email) >= MATCH_THRESHOLD;
}

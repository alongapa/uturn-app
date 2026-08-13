// Guard de k-anonimato para métricas agregadas (Sesión 10).
//
// La analítica de producto en sí es su propia sesión; lo que vive acá es la
// regla que esa sesión —y cualquier panel de admin que muestre agregados—
// tiene que atravesar antes de enseñar un número a alguien.
//
// El problema: "3 estudiantes de Ingeniería Comercial UDD cancelaron tarde
// esta semana" no es un dato agregado, es casi una lista de nombres. En un
// campus chico, una cohorte de 1 o 2 personas identifica a la persona aunque
// el número no lleve su nombre. La defensa estándar es k-anonimato: no se
// publica ninguna cohorte con menos de k individuos.
//
// Estas funciones son puras a propósito (sin red, sin Supabase): son la parte
// que conviene tener cubierta por tests, porque el error acá no se ve —
// devuelve un número plausible que no debería existir.

/**
 * Mínimo de individuos por cohorte para que sea publicable.
 *
 * 5 es el valor habitual en estadística oficial (y el que usan los reportes
 * educativos de EE.UU. y la UE para datos de estudiantes). Con la escala de
 * Unities —una federación puede tener 40 personas— bajarlo a 3 haría que casi
 * cualquier cruce de dos filtros sea reidentificable.
 */
export const DEFAULT_K = 5;

/** Una fila de un agregado: la cohorte y cuántos individuos distintos tiene. */
export type CohortRow = {
  /** Etiqueta de la cohorte (campus, carrera, semana...). */
  key: string;
  /**
   * Individuos **distintos**, no eventos. Contar eventos rompe la garantía:
   * 20 reservas pueden ser una sola persona.
   */
  count: number;
};

export type KAnonymityOptions = {
  /** Umbral mínimo; por defecto {@link DEFAULT_K}. */
  k?: number;
  /**
   * Si se pasa, las cohortes suprimidas se suman en una sola fila con esta
   * etiqueta en vez de desaparecer. La fila agrupada también tiene que
   * cumplir k: si no, se descarta igual (ver `applyKAnonymity`).
   */
  groupRemainderAs?: string | null;
};

export type KAnonymityResult = {
  /** Filas publicables, de mayor a menor. */
  rows: CohortRow[];
  /** Cuántas cohortes se ocultaron. */
  suppressedCohorts: number;
  /** Cuántos individuos quedaron fuera de `rows`. */
  suppressedIndividuals: number;
};

/** true si una cohorte de este tamaño se puede mostrar tal cual. */
export function isReportable(count: number, k: number = DEFAULT_K): boolean {
  return Number.isFinite(count) && count >= k;
}

/**
 * Suprime las cohortes bajo el umbral.
 *
 * El detalle que hace de esto algo más que un `filter`: cuando se pide juntar
 * el resto en "Otros", esa fila agrupada **también** tiene que cumplir k. Si
 * dos cohortes de 2 se suman en un "Otros: 4" con k=5, se publicó un grupo de
 * 4 personas — exactamente lo que la regla prohíbe, solo que con otra
 * etiqueta. Cuando el resto no alcanza, se descarta.
 */
export function applyKAnonymity(
  rows: readonly CohortRow[],
  options: KAnonymityOptions = {}
): KAnonymityResult {
  const k = options.k ?? DEFAULT_K;
  const remainderLabel = options.groupRemainderAs ?? null;

  const publishable: CohortRow[] = [];
  const suppressed: CohortRow[] = [];

  for (const row of rows) {
    // Una cohorte vacía no aporta y ensucia el "Otros"; se ignora del todo.
    if (!Number.isFinite(row.count) || row.count <= 0) continue;
    if (isReportable(row.count, k)) publishable.push({ ...row });
    else suppressed.push({ ...row });
  }

  const suppressedIndividuals = suppressed.reduce((sum, row) => sum + row.count, 0);
  const result: KAnonymityResult = {
    rows: publishable.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
    suppressedCohorts: suppressed.length,
    suppressedIndividuals,
  };

  if (remainderLabel && isReportable(suppressedIndividuals, k)) {
    // El agrupado cumple k: se publica y ya no hay nada oculto.
    result.rows = [...result.rows, { key: remainderLabel, count: suppressedIndividuals }];
    return { ...result, suppressedCohorts: 0, suppressedIndividuals: 0 };
  }

  return result;
}

/**
 * Redondea un total a múltiplos de `step`.
 *
 * Publicar dos versiones del mismo reporte con un individuo de diferencia
 * revela a ese individuo (ataque diferencial). Redondear el total corta ese
 * canal para las cifras de portada.
 */
export function roundForPublication(total: number, step = 10): number {
  if (!Number.isFinite(total) || step <= 0) return 0;
  return Math.round(total / step) * step;
}

/**
 * Total publicable de una métrica global: si ni el universo entero llega a k,
 * no hay reporte que dar. Devuelve `null` para que quien llama muestre
 * "sin datos suficientes" en vez de un 0 engañoso.
 */
export function reportableTotal(count: number, k: number = DEFAULT_K): number | null {
  return isReportable(count, k) ? count : null;
}

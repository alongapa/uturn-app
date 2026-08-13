// k-anonimato de las métricas agregadas.
//
// Lo que se prueba acá no es "el número sale bien" sino "el número que no
// debería salir, no sale". Un fallo silencioso en este módulo publica cohortes
// de una persona en un panel de admin.

import {
  DEFAULT_K,
  applyKAnonymity,
  isReportable,
  reportableTotal,
  roundForPublication,
  type CohortRow,
} from '@/services/analytics/k-anonymity';

const cohorts = (entries: [string, number][]): CohortRow[] =>
  entries.map(([key, count]) => ({ key, count }));

describe('umbral de publicación', () => {
  it('usa k=5 por defecto', () => {
    expect(DEFAULT_K).toBe(5);
  });

  it('publica desde k exacto hacia arriba', () => {
    expect(isReportable(5)).toBe(true);
    expect(isReportable(6)).toBe(true);
  });

  it('oculta cualquier cohorte bajo k', () => {
    expect(isReportable(4)).toBe(false);
    expect(isReportable(1)).toBe(false);
    expect(isReportable(0)).toBe(false);
  });

  it('acepta un k distinto', () => {
    expect(isReportable(3, 3)).toBe(true);
    expect(isReportable(2, 3)).toBe(false);
  });

  it('rechaza conteos no finitos en vez de dejarlos pasar', () => {
    expect(isReportable(Number.NaN)).toBe(false);
    expect(isReportable(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('supresión de cohortes chicas', () => {
  it('deja pasar las cohortes que cumplen k', () => {
    const result = applyKAnonymity(cohorts([['UDD', 12], ['UAI', 8]]));

    expect(result.rows).toEqual(cohorts([['UDD', 12], ['UAI', 8]]));
    expect(result.suppressedCohorts).toBe(0);
    expect(result.suppressedIndividuals).toBe(0);
  });

  it('elimina las cohortes bajo k y reporta cuánto ocultó', () => {
    const result = applyKAnonymity(cohorts([['UDD', 12], ['UAndes', 2], ['UAI', 1]]));

    expect(result.rows).toEqual(cohorts([['UDD', 12]]));
    expect(result.suppressedCohorts).toBe(2);
    expect(result.suppressedIndividuals).toBe(3);
  });

  it('ordena de mayor a menor', () => {
    const result = applyKAnonymity(cohorts([['UAI', 8], ['UDD', 20], ['UC', 12]]));

    expect(result.rows.map((row) => row.key)).toEqual(['UDD', 'UC', 'UAI']);
  });

  it('desempata por nombre para que el orden sea estable', () => {
    // Sin desempate determinista, dos cargas del mismo reporte pueden mostrar
    // las filas en distinto orden y parecer que los datos cambiaron.
    const result = applyKAnonymity(cohorts([['UAI', 7], ['UC', 7], ['UDD', 7]]));

    expect(result.rows.map((row) => row.key)).toEqual(['UAI', 'UC', 'UDD']);
  });

  it('descarta cohortes vacías sin contarlas como suprimidas', () => {
    const result = applyKAnonymity(cohorts([['UDD', 10], ['UAI', 0]]));

    expect(result.rows).toEqual(cohorts([['UDD', 10]]));
    expect(result.suppressedCohorts).toBe(0);
  });

  it('no muta las filas de entrada', () => {
    const input = cohorts([['UDD', 12]]);
    const result = applyKAnonymity(input);
    result.rows[0].count = 999;

    expect(input[0].count).toBe(12);
  });

  it('devuelve vacío si ninguna cohorte alcanza k', () => {
    const result = applyKAnonymity(cohorts([['UDD', 2], ['UAI', 1]]));

    expect(result.rows).toEqual([]);
    expect(result.suppressedIndividuals).toBe(3);
  });
});

describe('agrupación en "Otros"', () => {
  it('junta las cohortes chicas cuando la suma alcanza k', () => {
    const result = applyKAnonymity(cohorts([['UDD', 12], ['UAI', 3], ['UC', 3]]), {
      groupRemainderAs: 'Otras',
    });

    expect(result.rows).toEqual(cohorts([['UDD', 12], ['Otras', 6]]));
    // Ya no queda nada oculto: todo está o en su fila o en el agrupado.
    expect(result.suppressedIndividuals).toBe(0);
    expect(result.suppressedCohorts).toBe(0);
  });

  it('descarta el agrupado si él mismo no alcanza k', () => {
    // El punto entero del módulo: "Otras: 4" con k=5 publica un grupo de 4
    // personas. Agrupar no puede ser una puerta trasera al umbral.
    const result = applyKAnonymity(cohorts([['UDD', 12], ['UAI', 2], ['UC', 2]]), {
      groupRemainderAs: 'Otras',
    });

    expect(result.rows).toEqual(cohorts([['UDD', 12]]));
    expect(result.rows.find((row) => row.key === 'Otras')).toBeUndefined();
    expect(result.suppressedIndividuals).toBe(4);
  });

  it('deja el agrupado al final aunque supere a las demás filas', () => {
    // "Otras" es un cajón, no una cohorte: ordenarlo primero sugeriría que es
    // la categoría más grande y se leería como un dato que no es.
    const result = applyKAnonymity(cohorts([['UDD', 6], ['UAI', 4], ['UC', 4], ['UChile', 4]]), {
      groupRemainderAs: 'Otras',
    });

    expect(result.rows.map((row) => row.key)).toEqual(['UDD', 'Otras']);
    expect(result.rows[result.rows.length - 1]).toEqual({ key: 'Otras', count: 12 });
  });

  it('no crea la fila agrupada si no hay nada que agrupar', () => {
    const result = applyKAnonymity(cohorts([['UDD', 12], ['UAI', 8]]), {
      groupRemainderAs: 'Otras',
    });

    expect(result.rows.map((row) => row.key)).toEqual(['UDD', 'UAI']);
  });
});

describe('totales publicables', () => {
  it('devuelve el total cuando alcanza k', () => {
    expect(reportableTotal(40)).toBe(40);
  });

  it('devuelve null en vez de un cero engañoso', () => {
    // null obliga a la pantalla a decir "sin datos suficientes"; un 0 se leería
    // como "nadie lo hizo", que es una afirmación distinta y falsa.
    expect(reportableTotal(3)).toBeNull();
  });

  it('redondea el total publicado para cortar el ataque diferencial', () => {
    expect(roundForPublication(1234)).toBe(1230);
    expect(roundForPublication(1236)).toBe(1240);
  });

  it('acepta otro paso de redondeo', () => {
    expect(roundForPublication(1234, 100)).toBe(1200);
  });

  it('degrada a 0 ante entradas inválidas', () => {
    expect(roundForPublication(Number.NaN)).toBe(0);
    expect(roundForPublication(100, 0)).toBe(0);
  });
});

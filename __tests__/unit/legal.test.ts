// Documentos legales.
//
// Estos tests no juzgan la redacción: verifican que el documento cubra los
// temas que la app efectivamente hace y que las tiendas exigen declarar. Una
// política que no menciona que hay pagos reales de por medio no es un problema
// de estilo, es una ficha rechazada en revisión — o algo peor.

import legal from '@/constants/legal.json';

const privacidad = legal.documents.privacidad;
const terminos = legal.documents.terminos;

/** Todo el texto del documento en un solo string, para buscar temas. */
function fullText(doc: typeof privacidad): string {
  return [
    doc.title,
    doc.intro,
    ...doc.sections.flatMap((section) => [
      section.heading,
      ...(section.paragraphs ?? []),
      ...(section.bullets ?? []),
    ]),
  ]
    .join('\n')
    .toLowerCase();
}

describe('estructura', () => {
  it.each([
    ['privacidad', privacidad],
    ['términos', terminos],
  ])('%s tiene título, introducción y secciones', (_name, doc) => {
    expect(doc.title).toBeTruthy();
    expect(doc.intro.length).toBeGreaterThan(80);
    expect(doc.sections.length).toBeGreaterThan(5);
  });

  it.each([
    ['privacidad', privacidad],
    ['términos', terminos],
  ])('%s no tiene secciones vacías', (_name, doc) => {
    for (const section of doc.sections) {
      expect(section.heading).toBeTruthy();
      const contentCount = (section.paragraphs?.length ?? 0) + (section.bullets?.length ?? 0);
      expect(contentCount).toBeGreaterThan(0);
    }
  });

  it('declara una fecha de actualización válida', () => {
    expect(legal.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(new Date(legal.updatedAt).getTime())).toBe(false);
  });

  it('ofrece un contacto para ejercer derechos', () => {
    expect(legal.contactEmail).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]+$/i);
  });
});

describe('la política de privacidad cubre lo que la app hace', () => {
  const text = fullText(privacidad);

  it('nombra al proveedor de pagos', () => {
    // Fintoc recibe datos del usuario; omitirlo sería declarar de menos.
    expect(text).toContain('fintoc');
  });

  it('explica qué datos salen hacia el proveedor de pagos', () => {
    expect(text).toMatch(/monto/);
    expect(text).toMatch(/no recibe de vuelta tus credenciales bancarias/);
  });

  it('nombra la herramienta de diagnóstico de fallas', () => {
    expect(text).toContain('sentry');
  });

  it('declara que los datos personales se filtran antes de enviarlos', () => {
    // Es la promesa que services/monitoring.ts hace cumplir en código.
    expect(text).toMatch(/filtramos/);
  });

  it('explica el mínimo por grupo de las métricas agregadas', () => {
    // El k-anonimato de services/analytics/k-anonymity.ts, dicho en castellano.
    expect(text).toMatch(/cinco personas/);
  });

  it('cubre los derechos de la ley chilena', () => {
    expect(text).toContain('19.628');
    for (const right of ['acceso', 'rectificación', 'cancelación', 'oposición']) {
      expect(text).toContain(right);
    }
  });

  it('dice qué NO se recolecta, no solo qué sí', () => {
    expect(text).toMatch(/no vendemos tus datos/);
  });

  it('declara los plazos de conservación', () => {
    expect(privacidad.sections.some((s) => s.heading.toLowerCase().includes('tiempo'))).toBe(true);
  });
});

describe('los términos cubren las reglas que penalizan', () => {
  const text = fullText(terminos);

  it('declara el plazo de pago', () => {
    expect(text).toMatch(/48 horas/);
  });

  it('advierte que marcar "ya pagué" no protege', () => {
    // Si esto no está en los términos, la sanción por impago no tiene respaldo.
    expect(text).toMatch(/no te protege/);
  });

  it('dice quién recibe el strike', () => {
    expect(text).toMatch(/lo recibe el pasajero que no pagó/);
  });

  it('declara los umbrales de cancelación tardía', () => {
    expect(text).toMatch(/tercera/);
    expect(text).toMatch(/sexta/);
    expect(text).toMatch(/novena/);
  });

  it('declara las dos ventanas de cancelación gratis', () => {
    expect(text).toMatch(/2 horas antes/);
    expect(text).toMatch(/12 horas/);
  });

  it('aclara que Unities no es una empresa de transporte', () => {
    // Es la distinción que sostiene todo el modelo de responsabilidad.
    expect(text).toMatch(/no es una empresa de transporte/);
  });

  it('no pretende renunciar a los derechos del consumidor', () => {
    expect(text).toContain('19.496');
    expect(text).toMatch(/irrenunciable/);
  });

  it('declara la ley y la jurisdicción', () => {
    expect(text).toMatch(/ley chilena/);
  });
});

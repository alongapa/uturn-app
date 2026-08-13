#!/usr/bin/env node

/**
 * Emite la política de privacidad y los términos como Markdown, desde el mismo
 * JSON que renderiza la app (`constants/legal.json`).
 *
 * Por qué: App Store y Play Store exigen una **URL pública** con la política de
 * privacidad, y esa URL tiene que decir exactamente lo mismo que la pantalla
 * dentro de la app. Manteniéndolos a mano, se separan en la primera corrección
 * de redacción. Acá el JSON es el original y el Markdown es una salida.
 *
 * Los .md de docs/legal/ están pensados para publicarse (GitHub Pages o el
 * sitio de Unities) y NO deberían editarse a mano: este script los sobreescribe.
 *
 * Uso: node scripts/generate-legal-docs.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'constants', 'legal.json');
const OUT_DIR = join(ROOT, 'docs', 'legal');

const legal = JSON.parse(readFileSync(SOURCE, 'utf8'));

function toMarkdown(doc, updatedAt, contactEmail) {
  const lines = [
    `# ${doc.title}`,
    '',
    `_Última actualización: ${updatedAt}_`,
    '',
    '<!-- Generado por scripts/generate-legal-docs.mjs desde constants/legal.json.',
    '     No editar a mano: los cambios se pierden en la próxima generación. -->',
    '',
    doc.intro,
    '',
  ];

  for (const section of doc.sections) {
    lines.push(`## ${section.heading}`, '');
    for (const paragraph of section.paragraphs ?? []) lines.push(paragraph, '');
    for (const bullet of section.bullets ?? []) lines.push(`- ${bullet}`);
    if (section.bullets?.length) lines.push('');
  }

  lines.push('---', '', `Consultas sobre este documento: ${contactEmail}`, '');
  return lines.join('\n');
}

mkdirSync(OUT_DIR, { recursive: true });

const outputs = [
  ['politica-de-privacidad.md', legal.documents.privacidad],
  ['terminos-y-condiciones.md', legal.documents.terminos],
];

for (const [filename, doc] of outputs) {
  const target = join(OUT_DIR, filename);
  writeFileSync(target, toMarkdown(doc, legal.updatedAt, legal.contactEmail));
  console.log('Generado', target.replace(ROOT, '.'));
}

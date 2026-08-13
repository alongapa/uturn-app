#!/usr/bin/env node

/**
 * Verifica que cada Edge Function de supabase/functions/ esté desplegada.
 *
 * Por qué existe: aplicar migraciones NO despliega las funciones, y el cliente
 * las invoca por nombre (services/api/*.ts → functions.invoke('...')). Una
 * función que está en el repo pero no en la nube falla recién en runtime, y
 * `npm test` no la ve nunca porque supabase/functions/** está fuera del
 * tsconfig y el eslint de la app. Ya pasó dos veces: los webhooks de Fintoc
 * (Sesión 8) y delete-account (Sesión 9).
 *
 * Compara las carpetas locales contra `supabase functions list` y falla si
 * falta alguna. Si NO se puede consultar la nube (sin CLI, sin login, sin red),
 * avisa y pasa: no queremos romper `npm test` de alguien que solo está tocando
 * pantallas. Para exigir la verificación (CI), CHECK_FUNCTIONS_STRICT=1.
 */

import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS_DIR = join(ROOT, 'supabase', 'functions');
const STRICT = process.env.CHECK_FUNCTIONS_STRICT === '1';

/** Carpetas de supabase/functions/. Ignora archivos sueltos (tsconfig.json,
 *  deno.d.ts) y las convencionales `_shared` / `_utils`, que no son funciones. */
function localFunctions() {
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .sort();
}

/** `supabase functions list -o json` → slugs desplegados. */
function deployedFunctions() {
  return new Promise((resolve, reject) => {
    // En Windows `supabase` suele ser un .cmd, que execFile no puede lanzar
    // directo; se pasa por cmd /c en vez de shell:true (deprecado por Node al
    // combinarlo con argumentos en arreglo).
    const [cmd, args] =
      process.platform === 'win32'
        ? ['cmd', ['/c', 'supabase', 'functions', 'list', '-o', 'json']]
        : ['supabase', ['functions', 'list', '-o', 'json']];

    execFile(
      cmd,
      args,
      { cwd: ROOT, timeout: 60_000, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr?.trim() || error.message));
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          if (!Array.isArray(parsed)) throw new Error('respuesta inesperada');
          resolve(parsed.map((fn) => fn.slug ?? fn.name).filter(Boolean));
        } catch (err) {
          reject(new Error(`no se pudo interpretar la salida del CLI: ${err.message}`));
        }
      },
    );
  });
}

const local = localFunctions();
if (local.length === 0) {
  console.log('check:functions — no hay Edge Functions en supabase/functions/.');
  process.exit(0);
}

let deployed;
try {
  deployed = await deployedFunctions();
} catch (err) {
  // No se pudo consultar: distinto de "falta desplegar algo".
  const message =
    `check:functions — no se pudo consultar Supabase (${err.message}).\n` +
    '  Revisa que el CLI esté instalado y con sesión (`supabase login`) y que el\n' +
    '  proyecto esté enlazado (`supabase link`).';
  if (STRICT) {
    console.error(`${message}\n  CHECK_FUNCTIONS_STRICT=1 → se trata como error.`);
    process.exit(1);
  }
  console.warn(`${message}\n  Se omite la verificación (CHECK_FUNCTIONS_STRICT=1 para exigirla).`);
  process.exit(0);
}

const missing = local.filter((name) => !deployed.includes(name));
const orphans = deployed.filter((name) => !local.includes(name));

if (orphans.length > 0) {
  // No es error: puede ser una función vieja que todavía no se limpia.
  console.warn(
    `check:functions — desplegadas pero sin carpeta en el repo: ${orphans.join(', ')}`,
  );
}

if (missing.length > 0) {
  console.error(
    `check:functions — ${missing.length} Edge Function(s) SIN desplegar:\n` +
      missing.map((name) => `  - ${name}`).join('\n') +
      '\n\nEl cliente las invoca por nombre, así que fallarían en runtime.\n' +
      'Despliega con:\n' +
      missing.map((name) => `  supabase functions deploy ${name}`).join('\n'),
  );
  process.exit(1);
}

console.log(`check:functions — ${local.length}/${local.length} desplegadas (${local.join(', ')}).`);

#!/usr/bin/env node

/**
 * Genera los íconos y el splash de Unities (Sesión 10).
 *
 * Por qué un script y no PNGs sueltos en el repo: los assets de tienda son
 * ocho archivos con reglas distintas (iOS no acepta transparencia, Android
 * enmascara y recorta, el monocromo tiene que ser una silueta plana). Mantener
 * eso a mano garantiza que se desincronicen. Acá la marca se define una vez, en
 * geometría, y cada archivo se deriva con las reglas de su plataforma.
 *
 * La marca: monograma "U" de Unities sobre el azul de la app. El ícono anterior
 * dibujaba "UT" — las iniciales de Uturn, el nombre viejo del producto.
 *
 * Uso: node scripts/generate-icons.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Jimp from 'jimp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGES = join(ROOT, 'assets', 'images');
const ICONS = join(ROOT, 'assets', 'icons');

// Paleta: los mismos valores que constants/theme.ts. Si la marca cambia de
// color, cambia acá y se regenera todo.
const ACCENT = { r: 0x24, g: 0x6b, b: 0xfd }; // #246BFD
const NAVY = { r: 0x0a, g: 0x15, b: 0x25 }; // #0A1525
const WHITE = { r: 0xff, g: 0xff, b: 0xff };

/** Muestras por eje para el antialiasing. 3x3 alcanza y no encarece tanto. */
const SUBSAMPLES = 3;

const lerp = (a, b, t) => a + (b - a) * t;

/** Gradiente diagonal del azul de marca al navy. */
function background(nx, ny) {
  // (nx + ny) / 2 da una diagonal de esquina superior izquierda a inferior
  // derecha, que es donde el gradiente se lee mejor en un ícono chico.
  const t = Math.min(1, Math.max(0, (nx + ny) / 2));
  return {
    r: lerp(ACCENT.r, NAVY.r, t),
    g: lerp(ACCENT.g, NAVY.g, t),
    b: lerp(ACCENT.b, NAVY.b, t),
  };
}

/**
 * ¿Está el punto normalizado (nx, ny) dentro del monograma "U"?
 *
 * La U se arma con dos barras verticales y un semianillo abajo, todas del
 * mismo grosor, para que se lea como un solo trazo continuo. Coordenadas
 * normalizadas 0..1 sobre el área de la marca.
 */
function insideMark(nx, ny) {
  const strokeHalf = 0.085; // mitad del grosor del trazo
  const radius = 0.28; // radio del eje del semianillo
  const cx = 0.5;
  const cyArc = 0.58; // centro del arco, algo bajo el medio óptico
  const yTop = 0.22; // donde arrancan las barras

  const dx = nx - cx;
  const dy = ny - cyArc;

  // Semianillo inferior.
  if (ny >= cyArc) {
    const dist = Math.hypot(dx, dy);
    return Math.abs(dist - radius) <= strokeHalf;
  }

  // Barras verticales, solo por encima del centro del arco.
  if (ny >= yTop) {
    return Math.abs(Math.abs(dx) - radius) <= strokeHalf;
  }

  return false;
}

/** Máscara de cuadrado con esquinas redondeadas (para el favicon web). */
function insideRoundedSquare(nx, ny, radius) {
  const dx = Math.max(radius - nx, 0, nx - (1 - radius));
  const dy = Math.max(radius - ny, 0, ny - (1 - radius));
  return Math.hypot(dx, dy) <= radius;
}

/**
 * Dibuja una imagen evaluando una función por píxel, con supersampling.
 *
 * `shade(nx, ny)` devuelve `{ r, g, b, a }` con a en 0..1, o null para
 * transparente. El promedio de las submuestras es lo que da el borde suave;
 * sin esto la curva de la U sale con escalones visibles a 48 px.
 */
async function renderPng(size, shade, outPath) {
  const image = new Jimp(size, size, 0x00000000);
  const step = 1 / (SUBSAMPLES + 1);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let samples = 0;

      for (let sy = 1; sy <= SUBSAMPLES; sy += 1) {
        for (let sx = 1; sx <= SUBSAMPLES; sx += 1) {
          const nx = (x + sx * step) / size;
          const ny = (y + sy * step) / size;
          const color = shade(nx, ny);
          samples += 1;
          if (!color) continue;
          // Premultiplicado: promediar el color sin pesar por alfa deja un halo
          // oscuro alrededor de los trazos sobre fondo transparente.
          r += color.r * color.a;
          g += color.g * color.a;
          b += color.b * color.a;
          a += color.a;
        }
      }

      if (a <= 0) continue;
      const alpha = a / samples;
      image.setPixelColor(
        Jimp.rgbaToInt(
          Math.round(r / a),
          Math.round(g / a),
          Math.round(b / a),
          Math.round(alpha * 255)
        ),
        x,
        y
      );
    }
  }

  const buffer = await image.getBufferAsync(Jimp.MIME_PNG);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buffer);
  return outPath;
}

/** Coloca la marca dentro de una fracción central del lienzo. */
function markAt(nx, ny, scale, color) {
  const margin = (1 - scale) / 2;
  const mx = (nx - margin) / scale;
  const my = (ny - margin) / scale;
  if (mx < 0 || mx > 1 || my < 0 || my > 1) return null;
  return insideMark(mx, my) ? { ...color, a: 1 } : null;
}

async function main() {
  const written = [];

  // --- iOS y ícono principal -----------------------------------------------
  // Full bleed y SIN transparencia: iOS aplica su propia máscara redondeada, y
  // un PNG con alfa o con esquinas ya redondeadas se ve doblemente recortado.
  written.push(
    await renderPng(
      1024,
      (nx, ny) => {
        const mark = markAt(nx, ny, 0.62, WHITE);
        if (mark) return mark;
        return { ...background(nx, ny), a: 1 };
      },
      join(ICONS, 'unities-icon-1024.png')
    )
  );

  // Versión chica para usar dentro de la app (login). Se genera aparte en vez
  // de escalar la de 1024: a 512 el antialiasing se calcula sobre la geometría
  // y el trazo queda nítido, no reinterpolado.
  written.push(
    await renderPng(
      512,
      (nx, ny) => {
        if (!insideRoundedSquare(nx, ny, 0.22)) return null;
        const mark = markAt(nx, ny, 0.62, WHITE);
        if (mark) return mark;
        return { ...background(nx, ny), a: 1 };
      },
      join(ICONS, 'unities-icon-512.png')
    )
  );

  // --- Android adaptive ----------------------------------------------------
  // Se entrega en dos capas y el sistema las recorta con la máscara del
  // launcher (círculo, squircle...). La marca va al 46% porque solo el 66%
  // central está garantizado: al 62% se le comen los bordes en máscara redonda.
  written.push(
    await renderPng(
      1024,
      (nx, ny) => ({ ...background(nx, ny), a: 1 }),
      join(IMAGES, 'android-icon-background.png')
    )
  );

  written.push(
    await renderPng(
      1024,
      (nx, ny) => markAt(nx, ny, 0.46, WHITE),
      join(IMAGES, 'android-icon-foreground.png')
    )
  );

  // Monocromo (Android 13+, iconos temáticos): silueta plana. El sistema le
  // aplica su propio color, así que lo único que importa es el alfa.
  written.push(
    await renderPng(
      1024,
      (nx, ny) => markAt(nx, ny, 0.46, WHITE),
      join(IMAGES, 'android-icon-monochrome.png')
    )
  );

  // --- Splash --------------------------------------------------------------
  // Sobre transparente: el color de fondo lo pone expo-splash-screen, que ya
  // tiene un valor distinto para claro y oscuro.
  written.push(
    await renderPng(
      512,
      (nx, ny) => markAt(nx, ny, 0.8, WHITE),
      join(IMAGES, 'splash-icon.png')
    )
  );

  // --- Web -----------------------------------------------------------------
  // Acá sí van esquinas redondeadas: ningún navegador enmascara el favicon.
  written.push(
    await renderPng(
      48,
      (nx, ny) => {
        if (!insideRoundedSquare(nx, ny, 0.22)) return null;
        const mark = markAt(nx, ny, 0.62, WHITE);
        if (mark) return mark;
        return { ...background(nx, ny), a: 1 };
      },
      join(IMAGES, 'favicon.png')
    )
  );

  console.log('Íconos generados:');
  for (const file of written) console.log('  ', file.replace(ROOT, '.'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

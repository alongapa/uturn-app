// Utilidades de presentación del feed: etiquetas y colores por tipo de
// publisher/post y formato de fechas relativo/es-CL.

import type { PostType, PublisherKind } from '@/types/database';

export const PUBLISHER_KIND_LABEL: Record<PublisherKind, string> = {
  federacion: 'Federación',
  departamento: 'Departamento',
  centro_alumnos: 'Centro de Alumnos',
  universidad: 'Universidad',
  marca: 'Marca',
};

export const PUBLISHER_KIND_COLORS: Record<PublisherKind, { fg: string; bg: string }> = {
  federacion: { fg: '#1d4ed8', bg: '#dbeafe' },
  departamento: { fg: '#7c3aed', bg: '#ede9fe' },
  centro_alumnos: { fg: '#0f766e', bg: '#ccfbf1' },
  universidad: { fg: '#0A1525', bg: '#e2e8f0' },
  marca: { fg: '#b45309', bg: '#fef3c7' },
};

export const POST_TYPE_LABEL: Record<PostType, string> = {
  noticia: 'Noticia',
  evento: 'Evento',
  activacion: 'Activación',
  descuento: 'Descuento',
};

export const POST_TYPE_COLORS: Record<PostType, { fg: string; bg: string }> = {
  noticia: { fg: '#475569', bg: '#f1f5f9' },
  evento: { fg: '#7c3aed', bg: '#ede9fe' },
  activacion: { fg: '#b45309', bg: '#fef3c7' },
  descuento: { fg: '#15803d', bg: '#dcfce7' },
};

/** Iniciales para el avatar de un publisher sin imagen (máx. 2 letras). */
export function publisherInitials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .split(' ')
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** "hace 5 min", "hace 3 h", "ayer", o fecha corta es-CL para más antiguo. */
export function timeAgo(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short' }).format(date);
}

/** "vie 07 jul, 19:00" para fechas de eventos. */
export function formatEventDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Fecha por confirmar';
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Parsea "YYYY-MM-DD HH:mm" (hora local) del composer a ISO; null si no calza.
 * Se evita `new Date(string)` no-ISO, que Hermes no garantiza.
 */
export function parseLocalDateTime(value: string): string | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, y, m, d, h, min] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

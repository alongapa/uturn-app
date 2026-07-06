// Servicio de mensajería (Sesión 6) sobre Supabase Realtime: DMs 1-a-1 y
// tickets de "Soporte Unities". Crear conversaciones y punteros de lectura
// pasan por RPCs de servidor (start_dm, start_support, mark_conversation_read):
// la privacidad la garantiza la RLS (solo miembros), no el cliente.

import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/services/supabase';
import type {
  ConversationKind,
  ConversationRow,
  MessageRow,
  SupportCategory,
  SupportStatus,
} from '@/types/database';
import { resolveAvatarUrl } from './profiles';

export type { ConversationKind, SupportCategory, SupportStatus } from '@/types/database';

const SIGNED_URL_TTL = 60 * 60; // 1 hora, como services/api/storage.ts

export const SUPPORT_CATEGORIES: { id: SupportCategory; label: string; emoji: string; hint: string }[] = [
  { id: 'pagos', label: 'Pagos', emoji: '💳', hint: 'Problemas con pagos de viajes, comisiones o reembolsos.' },
  { id: 'baneos', label: 'Baneos y bloqueos', emoji: '🚫', hint: 'Bloqueos por cancelaciones o strikes que quieras apelar.' },
  { id: 'verificacion', label: 'Verificación', emoji: '🪪', hint: 'Problemas verificando tu credencial universitaria.' },
  { id: 'otro', label: 'Otro', emoji: '💬', hint: 'Cualquier otra consulta para el equipo Unities.' },
];

export function supportCategoryLabel(category: SupportCategory | null | undefined): string {
  return SUPPORT_CATEGORIES.find((c) => c.id === category)?.label ?? 'Soporte';
}

// ---------------------------------------------------------------------------
// Tipos que consumen las pantallas
// ---------------------------------------------------------------------------

export type ChatPeer = {
  id: string;
  name: string;
  avatarUrl?: string;
};

export type ConversationSummary = {
  id: string;
  kind: ConversationKind;
  /** Nombre a mostrar: la otra persona en un DM, la categoría en soporte. */
  title: string;
  /** La otra persona (solo DMs). */
  peer?: ChatPeer;
  supportCategory?: SupportCategory;
  supportStatus?: SupportStatus;
  lastMessagePreview?: string;
  lastMessageAt?: string;
  lastMessageMine: boolean;
  unreadCount: number;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  imageUrl?: string;
  createdAt: string;
};

export type ConversationDetail = {
  id: string;
  kind: ConversationKind;
  title: string;
  peer?: ChatPeer;
  supportCategory?: SupportCategory;
  supportStatus?: SupportStatus;
  /** Punteros de lectura por miembro (para el indicador "visto"). */
  readPointers: { userId: string; lastReadAt: string }[];
  memberNames: Map<string, string>;
};

async function requireUid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error('Necesitas iniciar sesión');
  return uid;
}

// ---------------------------------------------------------------------------
// Bandeja de conversaciones
// ---------------------------------------------------------------------------

type ProfileLite = { id: string; full_name: string | null; avatar_url: string | null };

async function getProfilesByIds(ids: string[]): Promise<Map<string, ProfileLite>> {
  const result = new Map<string, ProfileLite>();
  if (ids.length === 0) return result;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', [...new Set(ids)]);
  if (error) throw error;
  (data ?? []).forEach((p) => result.set(p.id, p));
  return result;
}

async function peerFromProfile(profile: ProfileLite | undefined): Promise<ChatPeer | undefined> {
  if (!profile) return undefined;
  return {
    id: profile.id,
    name: profile.full_name?.trim() || 'Estudiante',
    avatarUrl: await resolveAvatarUrl(profile.avatar_url),
  };
}

/**
 * Conversaciones visibles para el usuario (la RLS entrega: las propias y,
 * para admin/owner, además todos los tickets de soporte), con la otra persona
 * resuelta en DMs y el contador de no-leídos en una sola RPC.
 */
export async function listConversations(): Promise<ConversationSummary[]> {
  const uid = await requireUid();
  const [convRes, unreadRes] = await Promise.all([
    supabase
      .from('conversations')
      .select('*')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase.rpc('conversation_unread_counts'),
  ]);
  if (convRes.error) throw convRes.error;
  const rows = convRes.data ?? [];
  if (rows.length === 0) return [];

  const unread = new Map<string, number>(
    (unreadRes.data ?? []).map((r) => [r.conversation_id, Number(r.unread_count)])
  );

  // Miembros de los DMs para resolver a la otra persona.
  const dmIds = rows.filter((r) => r.kind === 'dm').map((r) => r.id);
  const peerByConversation = new Map<string, string>();
  if (dmIds.length > 0) {
    const { data: members, error } = await supabase
      .from('conversation_members')
      .select('conversation_id, user_id')
      .in('conversation_id', dmIds)
      .neq('user_id', uid);
    if (error) throw error;
    (members ?? []).forEach((m) => peerByConversation.set(m.conversation_id, m.user_id));
  }
  const profiles = await getProfilesByIds([...peerByConversation.values()]);

  const summaries: ConversationSummary[] = [];
  for (const row of rows) {
    const peerId = peerByConversation.get(row.id);
    const peer = row.kind === 'dm' ? await peerFromProfile(profiles.get(peerId ?? '')) : undefined;
    summaries.push({
      id: row.id,
      kind: row.kind,
      title:
        row.kind === 'soporte'
          ? `Soporte Unities · ${supportCategoryLabel(row.support_category)}`
          : peer?.name ?? 'Estudiante',
      peer,
      supportCategory: row.support_category ?? undefined,
      supportStatus: row.support_status ?? undefined,
      lastMessagePreview: row.last_message_preview ?? undefined,
      lastMessageAt: row.last_message_at ?? undefined,
      lastMessageMine: row.last_message_sender === uid,
      unreadCount: unread.get(row.id) ?? 0,
    });
  }
  return summaries;
}

/** Conversación puntual con miembros y punteros de lectura (para el chat). */
export async function getConversation(conversationId: string): Promise<ConversationDetail | null> {
  const uid = await requireUid();
  const [convRes, membersRes] = await Promise.all([
    supabase.from('conversations').select('*').eq('id', conversationId).maybeSingle(),
    supabase
      .from('conversation_members')
      .select('user_id, last_read_at')
      .eq('conversation_id', conversationId),
  ]);
  if (convRes.error) throw convRes.error;
  const row = convRes.data;
  if (!row) return null;
  if (membersRes.error) throw membersRes.error;
  const members = membersRes.data ?? [];

  const profiles = await getProfilesByIds(members.map((m) => m.user_id));
  const memberNames = new Map<string, string>();
  profiles.forEach((p, id) => memberNames.set(id, p.full_name?.trim() || 'Estudiante'));

  const peerId = row.kind === 'dm' ? members.find((m) => m.user_id !== uid)?.user_id : undefined;
  const peer = peerId ? await peerFromProfile(profiles.get(peerId)) : undefined;

  return {
    id: row.id,
    kind: row.kind,
    title:
      row.kind === 'soporte'
        ? `Soporte Unities · ${supportCategoryLabel(row.support_category)}`
        : peer?.name ?? 'Estudiante',
    peer,
    supportCategory: row.support_category ?? undefined,
    supportStatus: row.support_status ?? undefined,
    readPointers: members.map((m) => ({ userId: m.user_id, lastReadAt: m.last_read_at })),
    memberNames,
  };
}

// ---------------------------------------------------------------------------
// Mensajes
// ---------------------------------------------------------------------------

/** Imagen del chat: ruta en el bucket privado chat-media → URL firmada. */
async function resolveChatImage(imagePath: string | null): Promise<string | undefined> {
  if (!imagePath) return undefined;
  const { data, error } = await supabase.storage
    .from('chat-media')
    .createSignedUrl(imagePath, SIGNED_URL_TTL);
  if (error) return undefined;
  return data.signedUrl;
}

export async function mapMessageRow(row: MessageRow): Promise<ChatMessage> {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    imageUrl: await resolveChatImage(row.image_path),
    createdAt: row.created_at,
  };
}

/** Historial ascendente (el chat pinta de arriba hacia abajo). */
export async function listMessages(conversationId: string, limit = 100): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []).reverse();
  return Promise.all(rows.map(mapMessageRow));
}

const extFromUri = (uri: string) => {
  const clean = uri.split('?')[0] ?? uri;
  const ext = clean.split('.').pop()?.toLowerCase();
  return ext && ext.length <= 5 ? ext : 'jpg';
};

/** Sube una foto del chat a chat-media (`<conversación>/<uid>/…`). */
async function uploadChatImage(conversationId: string, uri: string): Promise<string> {
  const uid = await requireUid();
  const ext = extFromUri(uri);
  const path = `${conversationId}/${uid}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
  const res = await fetch(uri);
  const body = await res.arrayBuffer();
  const { error } = await supabase.storage
    .from('chat-media')
    .upload(path, body, { contentType: ext === 'png' ? 'image/png' : 'image/jpeg' });
  if (error) throw error;
  return path;
}

export async function sendMessage(
  conversationId: string,
  input: { body?: string; imageUri?: string }
): Promise<ChatMessage> {
  const uid = await requireUid();
  const body = input.body?.trim() ?? '';
  if (!body && !input.imageUri) throw new Error('Escribe un mensaje o adjunta una foto');
  const imagePath = input.imageUri ? await uploadChatImage(conversationId, input.imageUri) : null;
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: uid, body, image_path: imagePath })
    .select('*')
    .single();
  if (error) throw error;
  return mapMessageRow(data);
}

// ---------------------------------------------------------------------------
// RPCs de conversaciones
// ---------------------------------------------------------------------------

/** Abre (o recupera) el DM con otra persona; devuelve el id de conversación. */
export async function startDm(otherUserId: string): Promise<ConversationRow> {
  const { data, error } = await supabase.rpc('start_dm', { p_other_user: otherUserId });
  if (error) throw error;
  return data;
}

/** Abre (o recupera) el ticket de soporte abierto en esa categoría. */
export async function startSupport(category: SupportCategory): Promise<ConversationRow> {
  const { data, error } = await supabase.rpc('start_support', { p_category: category });
  if (error) throw error;
  return data;
}

export async function setSupportStatus(
  conversationId: string,
  status: SupportStatus
): Promise<ConversationRow> {
  const { data, error } = await supabase.rpc('set_support_status', {
    p_conversation: conversationId,
    p_status: status,
  });
  if (error) throw error;
  return data;
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_conversation_read', { p_conversation: conversationId });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Realtime: el mensaje entra sin recargar; la RLS filtra lo que cada
// suscriptor recibe (nunca mensajes de conversaciones ajenas).
// ---------------------------------------------------------------------------

/** Suscripción a una conversación: mensajes nuevos y punteros "visto". */
export function subscribeToConversation(
  conversationId: string,
  handlers: { onMessage: (row: MessageRow) => void; onMembersChange?: () => void }
): RealtimeChannel {
  return supabase
    .channel(`conversation:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => handlers.onMessage(payload.new as MessageRow)
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversation_members',
        filter: `conversation_id=eq.${conversationId}`,
      },
      () => handlers.onMembersChange?.()
    )
    .subscribe();
}

/** Suscripción de la bandeja: cualquier movimiento de mis conversaciones. */
export function subscribeToInbox(onChange: () => void): RealtimeChannel {
  return supabase
    .channel('inbox')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, onChange)
    .subscribe();
}

// ---------------------------------------------------------------------------
// Directorio para iniciar un DM (búsqueda por nombre)
// ---------------------------------------------------------------------------

export async function searchStudents(query: string, limit = 20): Promise<ChatPeer[]> {
  const uid = await requireUid();
  const term = query.trim();
  if (!term) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .ilike('full_name', `%${term}%`)
    .neq('id', uid)
    .limit(limit);
  if (error) throw error;
  const peers = await Promise.all((data ?? []).map((p) => peerFromProfile(p)));
  return peers.filter((p): p is ChatPeer => Boolean(p));
}

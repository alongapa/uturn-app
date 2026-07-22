// Servicio del feed (Sesión 4) sobre Supabase: publishers, posts, historias
// e interacciones. Paginación por cursor keyset (created_at, id), realtime
// para posts nuevos y media del bucket privado feed-media resuelta a URL
// firmada (las URLs http(s) del seed pasan tal cual).

import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/services/supabase';
import type { PostRow, PostType, PublisherKind, PublisherRow, StoryRow } from '@/types/database';

const SIGNED_URL_TTL = 60 * 60; // 1 hora, como services/api/storage.ts

// ---------------------------------------------------------------------------
// Tipos que consumen las pantallas
// ---------------------------------------------------------------------------

export type FeedPublisher = {
  id: string;
  slug: string;
  name: string;
  kind: PublisherKind;
  universityId: string | null;
  avatarUrl?: string;
  description?: string;
  /** profile_id del bot de IA del publisher, si tiene uno habilitado (Sesión Bots de IA). */
  botProfileId?: string;
};

export type FeedCursor = { createdAt: string; id: string };

/** Marca asociada (Sesión 5) que co-firma un post vía posts.brand_id. */
export type FeedBrand = {
  id: string;
  name: string;
  logoUrl?: string;
};

export type FeedPost = {
  id: string;
  publisher: FeedPublisher;
  tipo: PostType;
  texto: string;
  /** URLs listas para mostrar (firmadas si venían del bucket). Varias = carrete. */
  media: string[];
  eventoFecha?: string;
  eventoLugar?: string;
  codigo?: string;
  condiciones?: string;
  redeemableId?: string;
  /** Co-firma "junto a <marca>" (Sesión 5). */
  brand?: FeedBrand;
  /** true si widget_config lo marca destacado en el widget de eventos. */
  destacado?: boolean;
  likes: number;
  reposts: number;
  respuestas: number;
  likedByMe: boolean;
  repostedByMe: boolean;
  createdAt: string;
  cursor: FeedCursor;
};

export type FeedStory = {
  id: string;
  mediaUrl: string;
  caption?: string;
  createdAt: string;
  expiresAt: string;
};

export type FeedStoryGroup = {
  publisher: FeedPublisher;
  stories: FeedStory[];
};

export type FeedReply = {
  id: string;
  postId: string;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
};

export type FeedPage = {
  posts: FeedPost[];
  /** null cuando no quedan más páginas. */
  nextCursor: FeedCursor | null;
};

export const FEED_PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Publishers (catálogo chico: caché en memoria por sesión)
// ---------------------------------------------------------------------------

const publisherCache = new Map<string, FeedPublisher>();

function mapPublisher(row: PublisherRow): FeedPublisher {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    universityId: row.university_id,
    avatarUrl: row.avatar_url ?? undefined,
    description: row.description ?? undefined,
  };
}

/** Bots habilitados de un lote de publishers, para ofrecer "chatear con el bot" en el feed. */
async function attachPublisherBots(publishers: FeedPublisher[]): Promise<void> {
  if (publishers.length === 0) return;
  const { data, error } = await supabase
    .from('ai_bots')
    .select('publisher_id, profile_id')
    .eq('enabled', true)
    .in('publisher_id', publishers.map((p) => p.id));
  if (error) return; // degrada en silencio: el feed no depende de esto
  const botByPublisher = new Map((data ?? []).map((b) => [b.publisher_id, b.profile_id]));
  publishers.forEach((p) => {
    const botProfileId = botByPublisher.get(p.id);
    if (botProfileId) p.botProfileId = botProfileId;
  });
}

export async function listPublishers(): Promise<FeedPublisher[]> {
  const { data, error } = await supabase.from('publishers').select('*').order('name');
  if (error) throw error;
  const mapped = (data ?? []).map(mapPublisher);
  await attachPublisherBots(mapped);
  mapped.forEach((p) => publisherCache.set(p.id, p));
  return mapped;
}

async function getPublishersByIds(ids: string[]): Promise<Map<string, FeedPublisher>> {
  const missing = ids.filter((id) => !publisherCache.has(id));
  if (missing.length > 0) {
    const { data, error } = await supabase.from('publishers').select('*').in('id', missing);
    if (error) throw error;
    const fetched = (data ?? []).map(mapPublisher);
    await attachPublisherBots(fetched);
    fetched.forEach((p) => publisherCache.set(p.id, p));
  }
  const result = new Map<string, FeedPublisher>();
  ids.forEach((id) => {
    const pub = publisherCache.get(id);
    if (pub) result.set(id, pub);
  });
  return result;
}

const UNKNOWN_PUBLISHER: FeedPublisher = {
  id: '',
  slug: '',
  name: 'Comunidad',
  kind: 'universidad',
  universityId: null,
};

// ---------------------------------------------------------------------------
// Brands (catálogo chico: misma caché por sesión que publishers)
// ---------------------------------------------------------------------------

const brandCache = new Map<string, FeedBrand>();

async function getBrandsByIds(ids: string[]): Promise<Map<string, FeedBrand>> {
  const missing = ids.filter((id) => !brandCache.has(id));
  if (missing.length > 0) {
    const { data, error } = await supabase.from('brands').select('*').in('id', missing);
    if (error) throw error;
    const rows = data ?? [];
    const urls = await resolveMediaUrls(
      rows.map((r) => r.logo_path).filter((p): p is string => Boolean(p))
    );
    rows.forEach((row) =>
      brandCache.set(row.id, {
        id: row.id,
        name: row.name,
        logoUrl: row.logo_path ? urls.get(row.logo_path) : undefined,
      })
    );
  }
  const result = new Map<string, FeedBrand>();
  ids.forEach((id) => {
    const brand = brandCache.get(id);
    if (brand) result.set(id, brand);
  });
  return result;
}

// ---------------------------------------------------------------------------
// Media: rutas del bucket feed-media → URL firmada; URLs http(s) pasan directo
// ---------------------------------------------------------------------------

function isDirectUrl(value: string): boolean {
  return /^(https?|file|content|data):/.test(value);
}

function mediaPaths(media: PostRow['media']): string[] {
  if (!Array.isArray(media)) return [];
  return media.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

/** Resuelve en lote; las rutas que fallan se omiten (la tarjeta degrada sin romper). */
export async function resolveMediaUrls(paths: string[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const toSign = [...new Set(paths.filter((p) => !isDirectUrl(p)))];
  paths.filter(isDirectUrl).forEach((p) => resolved.set(p, p));
  if (toSign.length === 0) return resolved;
  const { data, error } = await supabase.storage
    .from('feed-media')
    .createSignedUrls(toSign, SIGNED_URL_TTL);
  if (error) return resolved;
  (data ?? []).forEach((item) => {
    if (item.signedUrl && item.path) resolved.set(item.path, item.signedUrl);
  });
  return resolved;
}

// ---------------------------------------------------------------------------
// Feed paginado (cursor keyset sobre created_at, id)
// ---------------------------------------------------------------------------

async function myInteractions(postIds: string[]): Promise<{ liked: Set<string>; reposted: Set<string> }> {
  const liked = new Set<string>();
  const reposted = new Set<string>();
  const { data: session } = await supabase.auth.getUser();
  const uid = session.user?.id;
  if (!uid || postIds.length === 0) return { liked, reposted };
  const [likesRes, repostsRes] = await Promise.all([
    supabase.from('post_likes').select('post_id').eq('user_id', uid).in('post_id', postIds),
    supabase.from('post_reposts').select('post_id').eq('user_id', uid).in('post_id', postIds),
  ]);
  (likesRes.data ?? []).forEach((r) => liked.add(r.post_id));
  (repostsRes.data ?? []).forEach((r) => reposted.add(r.post_id));
  return { liked, reposted };
}

async function mapPosts(rows: PostRow[]): Promise<FeedPost[]> {
  if (rows.length === 0) return [];
  const [publishers, urls, interactions, brands] = await Promise.all([
    getPublishersByIds([...new Set(rows.map((r) => r.publisher_id))]),
    resolveMediaUrls(rows.flatMap((r) => mediaPaths(r.media))),
    myInteractions(rows.map((r) => r.id)),
    getBrandsByIds([...new Set(rows.map((r) => r.brand_id).filter((b): b is string => Boolean(b)))]),
  ]);
  return rows.map((row) => ({
    id: row.id,
    publisher: publishers.get(row.publisher_id) ?? UNKNOWN_PUBLISHER,
    tipo: row.post_type,
    texto: row.body,
    media: mediaPaths(row.media)
      .map((p) => urls.get(p))
      .filter((u): u is string => Boolean(u)),
    eventoFecha: row.event_starts_at ?? undefined,
    eventoLugar: row.event_location ?? undefined,
    codigo: row.discount_code ?? undefined,
    condiciones: row.discount_terms ?? undefined,
    redeemableId: row.redeemable_id ?? undefined,
    brand: row.brand_id ? brands.get(row.brand_id) : undefined,
    likes: row.like_count,
    reposts: row.repost_count,
    respuestas: row.reply_count,
    likedByMe: interactions.liked.has(row.id),
    repostedByMe: interactions.reposted.has(row.id),
    createdAt: row.created_at,
    cursor: { createdAt: row.created_at, id: row.id },
  }));
}

export async function listFeedPage(cursor?: FeedCursor | null, limit = FEED_PAGE_SIZE): Promise<FeedPage> {
  let query = supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (cursor) {
    // Keyset: estrictamente después del cursor en orden (created_at, id) desc.
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  const posts = await mapPosts(data ?? []);
  const last = posts[posts.length - 1];
  return { posts, nextCursor: posts.length === limit && last ? last.cursor : null };
}

/** Refresca un solo post (contadores + mi estado), p. ej. al cerrar respuestas. */
export async function getFeedPost(postId: string): Promise<FeedPost | null> {
  const { data, error } = await supabase.from('posts').select('*').eq('id', postId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [post] = await mapPosts([data]);
  return post ?? null;
}

/** Suscripción a posts nuevos; devuelve el canal para desuscribir. */
export function subscribeFeed(onNewPost: () => void): RealtimeChannel {
  return supabase
    .channel('public:posts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, onNewPost)
    .subscribe();
}

// ---------------------------------------------------------------------------
// Widget "Eventos de la semana": posts tipo evento en los próximos 7 días
// ---------------------------------------------------------------------------

export async function listWeekEvents(): Promise<FeedPost[]> {
  const now = new Date();
  const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [postsRes, configRes] = await Promise.all([
    supabase
      .from('posts')
      .select('*')
      .eq('post_type', 'evento')
      .gte('event_starts_at', now.toISOString())
      .lte('event_starts_at', inSevenDays.toISOString())
      .order('event_starts_at', { ascending: true }),
    // Configuración editorial del panel (Sesión 5). Si falla, el widget
    // degrada al orden cronológico puro.
    supabase.from('widget_config').select('*').eq('widget', 'eventos_semana'),
  ]);
  if (postsRes.error) throw postsRes.error;
  const config = new Map((configRes.data ?? []).map((c) => [c.post_id, c]));
  const posts = (await mapPosts(postsRes.data ?? [])).map((post) => {
    const c = config.get(post.id);
    return c?.featured ? { ...post, destacado: true } : post;
  });
  // Orden editorial: fijados primero, luego los configurados por sort_order,
  // el resto por fecha del evento (ya vienen así del query).
  const rank = (post: FeedPost) => {
    const c = config.get(post.id);
    return { pinned: c?.pinned ? 0 : 1, configured: c ? 0 : 1, order: c?.sort_order ?? 0 };
  };
  return posts.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra.pinned !== rb.pinned) return ra.pinned - rb.pinned;
    if (ra.configured !== rb.configured) return ra.configured - rb.configured;
    if (ra.configured === 0 && ra.order !== rb.order) return ra.order - rb.order;
    return (a.eventoFecha ?? '').localeCompare(b.eventoFecha ?? '');
  });
}

// ---------------------------------------------------------------------------
// Carpetas integradas al feed (Sesión 5): carpetas de contenido con
// linked_widget = 'galeria' se muestran como carrusel de colecciones.
// ---------------------------------------------------------------------------

export type GalleryFolder = {
  id: string;
  name: string;
  description?: string;
  publisher: FeedPublisher;
  /** Imágenes de la carpeta ya resueltas a URL, en su sort_order. */
  items: { id: string; mediaUrl: string; caption?: string }[];
};

export async function listGalleryFolders(): Promise<GalleryFolder[]> {
  const { data: folders, error } = await supabase
    .from('content_folders')
    .select('*')
    .eq('linked_widget', 'galeria')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  const folderRows = folders ?? [];
  if (folderRows.length === 0) return [];
  const [{ data: items, error: itemsError }, publishers] = await Promise.all([
    supabase
      .from('content_items')
      .select('*')
      .in('folder_id', folderRows.map((f) => f.id))
      .order('sort_order', { ascending: true }),
    getPublishersByIds([...new Set(folderRows.map((f) => f.publisher_id))]),
  ]);
  if (itemsError) throw itemsError;
  const itemRows = items ?? [];
  const urls = await resolveMediaUrls(itemRows.map((i) => i.media_path));
  const result: GalleryFolder[] = [];
  for (const folder of folderRows) {
    const publisher = publishers.get(folder.publisher_id);
    if (!publisher) continue;
    const folderItems = itemRows
      .filter((i) => i.folder_id === folder.id)
      .map((i) => ({
        id: i.id,
        mediaUrl: urls.get(i.media_path) ?? '',
        caption: i.caption ?? undefined,
      }))
      .filter((i) => i.mediaUrl.length > 0);
    if (folderItems.length === 0) continue;
    result.push({
      id: folder.id,
      name: folder.name,
      description: folder.description ?? undefined,
      publisher,
      items: folderItems,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Historias (la RLS ya filtra las expiradas; el server las purga con pg_cron)
// ---------------------------------------------------------------------------

export async function listStories(): Promise<FeedStoryGroup[]> {
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  const publishers = await getPublishersByIds([...new Set(rows.map((r) => r.publisher_id))]);
  const urls = await resolveMediaUrls(rows.map((r) => r.media_path));

  const groups = new Map<string, FeedStoryGroup>();
  rows.forEach((row: StoryRow) => {
    const mediaUrl = urls.get(row.media_path);
    const publisher = publishers.get(row.publisher_id);
    if (!mediaUrl || !publisher) return;
    const group = groups.get(row.publisher_id) ?? { publisher, stories: [] };
    group.stories.push({
      id: row.id,
      mediaUrl,
      caption: row.caption ?? undefined,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    });
    groups.set(row.publisher_id, group);
  });
  // Grupos con historia más reciente primero.
  return [...groups.values()].sort((a, b) => {
    const lastA = a.stories[a.stories.length - 1]?.createdAt ?? '';
    const lastB = b.stories[b.stories.length - 1]?.createdAt ?? '';
    return lastB.localeCompare(lastA);
  });
}

// ---------------------------------------------------------------------------
// Interacciones (una por usuario; el constraint de unicidad es el enforcement)
// ---------------------------------------------------------------------------

const UNIQUE_VIOLATION = '23505';

async function requireUid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error('Necesitas iniciar sesión');
  return uid;
}

export async function setLiked(postId: string, liked: boolean): Promise<void> {
  const uid = await requireUid();
  if (liked) {
    const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: uid });
    if (error && error.code !== UNIQUE_VIOLATION) throw error; // ya tenía like: idempotente
  } else {
    const { error } = await supabase.from('post_likes').delete().match({ post_id: postId, user_id: uid });
    if (error) throw error;
  }
}

export async function setReposted(postId: string, reposted: boolean): Promise<void> {
  const uid = await requireUid();
  if (reposted) {
    const { error } = await supabase.from('post_reposts').insert({ post_id: postId, user_id: uid });
    if (error && error.code !== UNIQUE_VIOLATION) throw error;
  } else {
    const { error } = await supabase.from('post_reposts').delete().match({ post_id: postId, user_id: uid });
    if (error) throw error;
  }
}

export async function listReplies(postId: string): Promise<FeedReply[]> {
  const { data, error } = await supabase
    .from('post_replies')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const names = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
    (profiles ?? []).forEach((p) => names.set(p.id, p.full_name ?? 'Estudiante'));
  }
  return rows.map((row) => ({
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    userName: names.get(row.user_id) ?? 'Estudiante',
    body: row.body,
    createdAt: row.created_at,
  }));
}

/** Lanza error con mensaje amigable si el usuario ya respondió (unicidad). */
export async function addReply(postId: string, body: string): Promise<FeedReply> {
  const uid = await requireUid();
  const { data, error } = await supabase
    .from('post_replies')
    .insert({ post_id: postId, user_id: uid, body: body.trim() })
    .select('*')
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new Error('Ya respondiste esta publicación');
    }
    throw error;
  }
  const { data: me } = await supabase.from('profiles').select('full_name').eq('id', uid).maybeSingle();
  return {
    id: data.id,
    postId: data.post_id,
    userId: data.user_id,
    userName: me?.full_name ?? 'Tú',
    body: data.body,
    createdAt: data.created_at,
  };
}

// ---------------------------------------------------------------------------
// Publicar (la RLS exige rol tutor/admin/owner; el cliente solo refleja eso)
// ---------------------------------------------------------------------------

const extFromUri = (uri: string) => {
  const clean = uri.split('?')[0] ?? uri;
  const ext = clean.split('.').pop()?.toLowerCase();
  return ext && ext.length <= 5 ? ext : 'jpg';
};

/** Sube una imagen local al bucket feed-media (`<uid>/…`) y devuelve la ruta. */
export async function uploadFeedMedia(uri: string): Promise<string> {
  const uid = await requireUid();
  const ext = extFromUri(uri);
  const path = `${uid}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
  const res = await fetch(uri);
  const body = await res.arrayBuffer();
  const { error } = await supabase.storage
    .from('feed-media')
    .upload(path, body, { contentType: ext === 'png' ? 'image/png' : 'image/jpeg' });
  if (error) throw error;
  return path;
}

export type NewPostInput = {
  publisherId: string;
  tipo: PostType;
  texto: string;
  /** URIs locales (image picker); se suben a feed-media antes de insertar. */
  mediaUris?: string[];
  eventoFecha?: string | null;
  eventoLugar?: string | null;
  codigo?: string | null;
  condiciones?: string | null;
  /** Marca asociada que co-firma (Sesión 5). */
  brandId?: string | null;
};

export async function createPost(input: NewPostInput): Promise<FeedPost> {
  const uid = await requireUid();
  const mediaPathsUploaded: string[] = [];
  for (const mediaUri of input.mediaUris ?? []) {
    mediaPathsUploaded.push(await uploadFeedMedia(mediaUri));
  }
  const { data, error } = await supabase
    .from('posts')
    .insert({
      publisher_id: input.publisherId,
      author_id: uid,
      post_type: input.tipo,
      body: input.texto.trim(),
      media: mediaPathsUploaded,
      event_starts_at: input.eventoFecha ?? null,
      event_location: input.eventoLugar ?? null,
      discount_code: input.codigo ?? null,
      discount_terms: input.condiciones ?? null,
      brand_id: input.brandId ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  const [post] = await mapPosts([data]);
  return post;
}

export async function createStory(publisherId: string, mediaUri: string, caption?: string): Promise<void> {
  const uid = await requireUid();
  const path = await uploadFeedMedia(mediaUri);
  const { error } = await supabase.from('stories').insert({
    publisher_id: publisherId,
    author_id: uid,
    media_path: path,
    caption: caption?.trim() || null,
  });
  if (error) throw error;
}

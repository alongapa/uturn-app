// Servicio del panel de administración (Sesión 5). Todo el enforcement real
// vive en RLS/funciones de servidor: cada admin solo opera sobre los
// publishers donde publisher_members lo lista (el owner tiene alcance
// global), y aprobar/rechazar canjeables pasa por review_redeemable
// (verificación de rol owner en el servidor).

import { supabase } from '@/services/supabase';
import type {
  AccountRole,
  ContentFolderRow,
  LinkedWidget,
  RedeemableCategory,
  RedeemableRow,
  RedeemableStatus,
  WidgetConfigRow,
} from '@/types/database';
import type { FeedPublisher } from './feed';
import { listPublishers, resolveMediaUrls, uploadFeedMedia } from './feed';

async function requireUid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error('Necesitas iniciar sesión');
  return uid;
}

export async function getMyRole(): Promise<AccountRole> {
  const uid = await requireUid();
  const { data, error } = await supabase
    .from('profiles')
    .select('account_role')
    .eq('id', uid)
    .maybeSingle();
  if (error) throw error;
  return data?.account_role ?? 'user';
}

// ---------------------------------------------------------------------------
// Mis publishers: el owner los ve todos; un admin/tutor solo aquellos donde
// es miembro (publisher_members).
// ---------------------------------------------------------------------------

export async function listMyPublishers(): Promise<FeedPublisher[]> {
  const uid = await requireUid();
  const role = await getMyRole();
  const all = await listPublishers();
  if (role === 'owner') return all;
  const { data, error } = await supabase
    .from('publisher_members')
    .select('publisher_id')
    .eq('user_id', uid);
  if (error) throw error;
  const mine = new Set((data ?? []).map((m) => m.publisher_id));
  return all.filter((p) => mine.has(p.id));
}

// ---------------------------------------------------------------------------
// Miembros por publisher (asignarlos/quitarlos es del owner, por RLS)
// ---------------------------------------------------------------------------

export type PublisherMember = {
  publisherId: string;
  userId: string;
  fullName: string;
  email: string;
};

export async function listPublisherMembers(publisherId: string): Promise<PublisherMember[]> {
  const { data, error } = await supabase
    .from('publisher_members')
    .select('publisher_id, user_id')
    .eq('publisher_id', publisherId);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', rows.map((r) => r.user_id));
  if (profilesError) throw profilesError;
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return rows.map((row) => ({
    publisherId: row.publisher_id,
    userId: row.user_id,
    fullName: byId.get(row.user_id)?.full_name ?? 'Estudiante',
    email: byId.get(row.user_id)?.email ?? '',
  }));
}

/** Asigna un miembro por email institucional; la RLS exige rol owner. */
export async function addPublisherMember(publisherId: string, email: string): Promise<void> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();
  if (error) throw error;
  if (!profile) throw new Error('No hay ninguna cuenta con ese correo');
  const { error: insertError } = await supabase
    .from('publisher_members')
    .insert({ publisher_id: publisherId, user_id: profile.id });
  if (insertError) {
    if (insertError.code === '23505') throw new Error('Ese usuario ya es miembro');
    throw insertError;
  }
}

export async function removePublisherMember(publisherId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('publisher_members')
    .delete()
    .match({ publisher_id: publisherId, user_id: userId });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Publishers (crear entidades es del owner, por RLS)
// ---------------------------------------------------------------------------

export type NewPublisherInput = {
  name: string;
  kind: FeedPublisher['kind'];
  universityId?: string | null;
  description?: string | null;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export async function createPublisher(input: NewPublisherInput): Promise<void> {
  const base = slugify(input.name) || 'publisher';
  // Sufijo corto para evitar chocar con slugs existentes.
  const slug = `${base}-${Date.now().toString(36).slice(-4)}`;
  const { error } = await supabase.from('publishers').insert({
    slug,
    name: input.name.trim(),
    kind: input.kind,
    university_id: input.universityId ?? null,
    description: input.description?.trim() || null,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Marcas asociadas (co-firman posts vía posts.brand_id)
// ---------------------------------------------------------------------------

export type AdminBrand = {
  id: string;
  publisherId: string;
  name: string;
  logoUrl?: string;
};

export async function listBrands(publisherIds?: string[]): Promise<AdminBrand[]> {
  let query = supabase.from('brands').select('*').order('name');
  if (publisherIds && publisherIds.length > 0) {
    query = query.in('publisher_id', publisherIds);
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const urls = await resolveMediaUrls(
    rows.map((r) => r.logo_path).filter((p): p is string => Boolean(p))
  );
  return rows.map((row) => ({
    id: row.id,
    publisherId: row.publisher_id,
    name: row.name,
    logoUrl: row.logo_path ? urls.get(row.logo_path) : undefined,
  }));
}

export async function createBrand(
  publisherId: string,
  name: string,
  logoUri?: string | null
): Promise<void> {
  const logoPath = logoUri ? await uploadFeedMedia(logoUri) : null;
  const { error } = await supabase
    .from('brands')
    .insert({ publisher_id: publisherId, name: name.trim(), logo_path: logoPath });
  if (error) throw error;
}

export async function deleteBrand(brandId: string): Promise<void> {
  const { error } = await supabase.from('brands').delete().eq('id', brandId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Widget "Eventos de la semana": configuración editorial (widget_config)
// ---------------------------------------------------------------------------

export type EventWidgetConfig = {
  postId: string;
  sortOrder: number;
  pinned: boolean;
  featured: boolean;
};

function mapWidgetConfig(row: WidgetConfigRow): EventWidgetConfig {
  return {
    postId: row.post_id,
    sortOrder: row.sort_order,
    pinned: row.pinned,
    featured: row.featured,
  };
}

export async function listEventWidgetConfig(): Promise<Map<string, EventWidgetConfig>> {
  const { data, error } = await supabase
    .from('widget_config')
    .select('*')
    .eq('widget', 'eventos_semana');
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.post_id, mapWidgetConfig(row)]));
}

/** Crea o actualiza la fila del post en el widget (upsert por widget+post). */
export async function saveEventWidgetConfig(config: EventWidgetConfig): Promise<void> {
  const uid = await requireUid();
  const { error } = await supabase.from('widget_config').upsert(
    {
      widget: 'eventos_semana',
      post_id: config.postId,
      sort_order: config.sortOrder,
      pinned: config.pinned,
      featured: config.featured,
      updated_by: uid,
    },
    { onConflict: 'widget,post_id' }
  );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Carpetas de contenido
// ---------------------------------------------------------------------------

export type AdminFolder = {
  id: string;
  publisherId: string;
  name: string;
  description?: string;
  linkedWidget: LinkedWidget | null;
  sortOrder: number;
};

function mapFolder(row: ContentFolderRow): AdminFolder {
  return {
    id: row.id,
    publisherId: row.publisher_id,
    name: row.name,
    description: row.description ?? undefined,
    linkedWidget: row.linked_widget,
    sortOrder: row.sort_order,
  };
}

export async function listFolders(publisherIds: string[]): Promise<AdminFolder[]> {
  if (publisherIds.length === 0) return [];
  const { data, error } = await supabase
    .from('content_folders')
    .select('*')
    .in('publisher_id', publisherIds)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapFolder);
}

export async function getFolder(folderId: string): Promise<AdminFolder | null> {
  const { data, error } = await supabase
    .from('content_folders')
    .select('*')
    .eq('id', folderId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapFolder(data) : null;
}

export async function createFolder(
  publisherId: string,
  name: string,
  description?: string | null
): Promise<void> {
  const uid = await requireUid();
  const { error } = await supabase.from('content_folders').insert({
    publisher_id: publisherId,
    name: name.trim(),
    description: description?.trim() || null,
    created_by: uid,
  });
  if (error) throw error;
}

/** Integra (o desconecta) la carpeta al widget de galería del feed. */
export async function setFolderWidget(folderId: string, linked: boolean): Promise<void> {
  const { error } = await supabase
    .from('content_folders')
    .update({ linked_widget: linked ? 'galeria' : null })
    .eq('id', folderId);
  if (error) throw error;
}

export async function deleteFolder(folderId: string): Promise<void> {
  const { error } = await supabase.from('content_folders').delete().eq('id', folderId);
  if (error) throw error;
}

export type AdminFolderItem = {
  id: string;
  folderId: string;
  mediaUrl: string;
  caption?: string;
  sortOrder: number;
};

export async function listFolderItems(folderId: string): Promise<AdminFolderItem[]> {
  const { data, error } = await supabase
    .from('content_items')
    .select('*')
    .eq('folder_id', folderId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  const urls = await resolveMediaUrls(rows.map((r) => r.media_path));
  return rows.map((row) => ({
    id: row.id,
    folderId: row.folder_id,
    mediaUrl: urls.get(row.media_path) ?? '',
    caption: row.caption ?? undefined,
    sortOrder: row.sort_order,
  }));
}

/** Sube imágenes locales a feed-media y las agrega al final de la carpeta. */
export async function addFolderItems(folderId: string, uris: string[]): Promise<void> {
  if (uris.length === 0) return;
  const uid = await requireUid();
  const existing = await listFolderItems(folderId);
  let nextOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder + 1), 0);
  for (const uri of uris) {
    const path = await uploadFeedMedia(uri);
    const { error } = await supabase.from('content_items').insert({
      folder_id: folderId,
      media_path: path,
      sort_order: nextOrder,
      created_by: uid,
    });
    if (error) throw error;
    nextOrder += 1;
  }
}

export async function deleteFolderItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('content_items').delete().eq('id', itemId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Canjeables: postulación (admin) y aprobación (owner, en el servidor)
// ---------------------------------------------------------------------------

export type RedeemableProposal = {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: RedeemableCategory;
  costoCreditos: number;
  stock?: number;
  vigenciaDias: number;
  patrocinador?: string;
  publisherId?: string;
  status: RedeemableStatus;
  reviewNote?: string;
  createdAt: string;
};

function mapProposal(row: RedeemableRow): RedeemableProposal {
  return {
    id: row.id,
    titulo: row.title,
    descripcion: row.description,
    categoria: row.category,
    costoCreditos: row.cost_credits,
    stock: row.stock ?? undefined,
    vigenciaDias: row.validity_days,
    patrocinador: row.sponsor ?? undefined,
    publisherId: row.publisher_id ?? undefined,
    status: row.status,
    reviewNote: row.review_note ?? undefined,
    createdAt: row.created_at,
  };
}

export type NewProposalInput = {
  titulo: string;
  descripcion: string;
  categoria: RedeemableCategory;
  costoCreditos: number;
  stock?: number | null;
  vigenciaDias?: number;
  patrocinador?: string | null;
  publisherId?: string | null;
};

/** Inserta la propuesta en estado 'pendiente'; la RLS exige admin + membresía. */
export async function proposeRedeemable(input: NewProposalInput): Promise<RedeemableProposal> {
  const uid = await requireUid();
  const id = `rd-${slugify(input.titulo) || 'canje'}-${Date.now().toString(36)}`;
  const { data, error } = await supabase
    .from('redeemables')
    .insert({
      id,
      title: input.titulo.trim(),
      description: input.descripcion.trim(),
      category: input.categoria,
      cost_credits: input.costoCreditos,
      stock: input.stock ?? null,
      validity_days: input.vigenciaDias ?? 7,
      sponsor: input.patrocinador?.trim() || null,
      status: 'pendiente',
      proposed_by: uid,
      publisher_id: input.publisherId ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapProposal(data);
}

export async function listMyProposals(): Promise<RedeemableProposal[]> {
  const uid = await requireUid();
  const { data, error } = await supabase
    .from('redeemables')
    .select('*')
    .eq('proposed_by', uid)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapProposal);
}

/** Bandeja del owner: todas las propuestas pendientes. */
export async function listPendingProposals(): Promise<RedeemableProposal[]> {
  const { data, error } = await supabase
    .from('redeemables')
    .select('*')
    .eq('status', 'pendiente')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapProposal);
}

/** Aprueba/rechaza en el servidor (review_redeemable verifica rol owner). */
export async function reviewProposal(
  itemId: string,
  approve: boolean,
  note?: string
): Promise<void> {
  const { error } = await supabase.rpc('review_redeemable', {
    p_item_id: itemId,
    p_approve: approve,
    p_note: note ?? null,
  });
  if (error) throw error;
}

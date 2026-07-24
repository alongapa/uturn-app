// Reportes, bloqueos y moderación de contenido (Sesión 9). El enforcement real
// (quién puede triar/sancionar/borrar) vive en las RPC y RLS del servidor;
// este archivo solo envuelve las llamadas.

import { supabase } from '@/services/supabase';
import type {
  BlockedWordRow,
  ModerationActionKind,
  ProfileRow,
  ReportListItem,
  ReportReason,
  ReportRow,
  ReportTargetType,
  UserBlockRow,
} from '@/types/database';

// --- Reportes ---

export async function reportTarget(params: {
  targetType: ReportTargetType;
  reason: ReportReason;
  targetUserId?: string | null;
  targetId?: string | null;
  description?: string | null;
  evidencePath?: string | null;
}): Promise<ReportRow> {
  const { data, error } = await supabase.rpc('report_target', {
    p_target_type: params.targetType,
    p_reason: params.reason,
    p_target_user_id: params.targetUserId ?? null,
    p_target_id: params.targetId ?? null,
    p_description: params.description ?? null,
    p_evidence_path: params.evidencePath ?? null,
  });
  if (error) throw error;
  return data;
}

export async function listReports(status?: string | null, targetType?: string | null): Promise<ReportListItem[]> {
  const { data, error } = await supabase.rpc('list_reports', {
    p_status: status ?? null,
    p_target_type: targetType ?? null,
  });
  if (error) throw error;
  return data ?? [];
}

export async function triageReport(reportId: string, status: 'en_revision' | 'descartado'): Promise<ReportRow> {
  const { data, error } = await supabase.rpc('triage_report', { p_report_id: reportId, p_status: status });
  if (error) throw error;
  return data;
}

export async function applyModerationAction(params: {
  targetUserId: string;
  action: ModerationActionKind;
  reason: string;
  suspendDays?: number;
  reportId?: string | null;
}): Promise<ProfileRow> {
  const { data, error } = await supabase.rpc('apply_moderation_action', {
    p_target_user_id: params.targetUserId,
    p_action: params.action,
    p_reason: params.reason,
    p_suspend_days: params.suspendDays ?? null,
    p_report_id: params.reportId ?? null,
  });
  if (error) throw error;
  return data;
}

export async function moderateContent(reportId: string, deleteContent: boolean, note?: string): Promise<ReportRow> {
  const { data, error } = await supabase.rpc('moderate_content', {
    p_report_id: reportId,
    p_delete: deleteContent,
    p_note: note ?? null,
  });
  if (error) throw error;
  return data;
}

// --- Bloqueos: tabla simple, sin RPC (RLS: blocker_id = auth.uid()) ---

export async function blockUser(userId: string): Promise<void> {
  const { data: session } = await supabase.auth.getUser();
  const uid = session.user?.id;
  if (!uid) throw new Error('Necesitas iniciar sesión');
  const { error } = await supabase.from('user_blocks').insert({ blocker_id: uid, blocked_id: userId });
  if (error) throw error;
}

export async function unblockUser(userId: string): Promise<void> {
  const { data: session } = await supabase.auth.getUser();
  const uid = session.user?.id;
  if (!uid) throw new Error('Necesitas iniciar sesión');
  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', uid)
    .eq('blocked_id', userId);
  if (error) throw error;
}

export type BlockedUser = { blockedId: string; fullName: string | null; createdAt: string };

export async function listMyBlocks(): Promise<BlockedUser[]> {
  const { data: blocks, error } = await supabase
    .from('user_blocks')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (blocks ?? []) as UserBlockRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.blocked_id);
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', ids);
  if (profilesError) throw profilesError;
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return rows.map((r) => ({
    blockedId: r.blocked_id,
    fullName: nameById.get(r.blocked_id) ?? null,
    createdAt: r.created_at,
  }));
}

// --- Filtro de palabras (admin) ---

export async function listBlockedWords(): Promise<BlockedWordRow[]> {
  const { data, error } = await supabase.from('blocked_words').select('*').order('word');
  if (error) throw error;
  return data ?? [];
}

export async function addBlockedWord(word: string): Promise<void> {
  const { data: session } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('blocked_words')
    .insert({ word: word.trim().toLowerCase(), created_by: session.user?.id ?? null });
  if (error) throw error;
}

export async function removeBlockedWord(id: string): Promise<void> {
  const { error } = await supabase.from('blocked_words').delete().eq('id', id);
  if (error) throw error;
}

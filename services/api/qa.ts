// Servicio de Q&A por temas (Sesión 6): preguntas públicas, respuestas
// oficiales de los asignados al tema (tutores o federaciones, RLS) y
// comentarios de la comunidad. También el mini-perfil de tutor.

import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/services/supabase';
import type { QuestionRow, TopicRow } from '@/types/database';
import { resolveAvatarUrl } from './profiles';

// ---------------------------------------------------------------------------
// Tipos que consumen las pantallas
// ---------------------------------------------------------------------------

export type QaTopic = {
  id: string;
  name: string;
  emoji?: string;
  description?: string;
};

export type QaQuestion = {
  id: string;
  topicId: string;
  topicName: string;
  topicEmoji?: string;
  authorId: string;
  authorName: string;
  title: string;
  body: string;
  replyCount: number;
  /** true cuando ya tiene respuesta oficial (answered_at del servidor). */
  answered: boolean;
  createdAt: string;
};

export type QaReply = {
  id: string;
  questionId: string;
  authorId: string;
  authorName: string;
  /** Nombre del publisher cuando la respuesta oficial va a nombre de una federación. */
  publisherName?: string;
  body: string;
  isOfficial: boolean;
  createdAt: string;
};

/** Quién responde oficialmente un tema: tutores y/o federaciones. */
export type TopicAssignees = {
  tutors: { id: string; name: string; avatarUrl?: string }[];
  publishers: { id: string; name: string }[];
};

/** Cómo puede responder oficialmente el usuario actual una pregunta. */
export type OfficialAbility = {
  canAnswer: boolean;
  /** Si responde a nombre de una federación, con cuál. */
  publisherId?: string;
  publisherName?: string;
};

async function requireUid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error('Necesitas iniciar sesión');
  return uid;
}

function mapTopic(row: TopicRow): QaTopic {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji ?? undefined,
    description: row.description ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Temas
// ---------------------------------------------------------------------------

const topicCache = new Map<string, QaTopic>();

export async function listTopics(): Promise<QaTopic[]> {
  const { data, error } = await supabase.from('topics').select('*').order('sort_order');
  if (error) throw error;
  const mapped = (data ?? []).map(mapTopic);
  mapped.forEach((t) => topicCache.set(t.id, t));
  return mapped;
}

async function getTopicsByIds(ids: string[]): Promise<Map<string, QaTopic>> {
  const missing = [...new Set(ids)].filter((id) => !topicCache.has(id));
  if (missing.length > 0) {
    const { data, error } = await supabase.from('topics').select('*').in('id', missing);
    if (error) throw error;
    (data ?? []).forEach((row) => topicCache.set(row.id, mapTopic(row)));
  }
  const result = new Map<string, QaTopic>();
  ids.forEach((id) => {
    const topic = topicCache.get(id);
    if (topic) result.set(id, topic);
  });
  return result;
}

// ---------------------------------------------------------------------------
// Preguntas
// ---------------------------------------------------------------------------

async function getNamesByIds(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return names;
  const { data, error } = await supabase.from('profiles').select('id, full_name').in('id', unique);
  if (error) throw error;
  (data ?? []).forEach((p) => names.set(p.id, p.full_name?.trim() || 'Estudiante'));
  return names;
}

async function mapQuestions(rows: QuestionRow[]): Promise<QaQuestion[]> {
  if (rows.length === 0) return [];
  const [topics, names] = await Promise.all([
    getTopicsByIds(rows.map((r) => r.topic_id)),
    getNamesByIds(rows.map((r) => r.author_id)),
  ]);
  return rows.map((row) => ({
    id: row.id,
    topicId: row.topic_id,
    topicName: topics.get(row.topic_id)?.name ?? row.topic_id,
    topicEmoji: topics.get(row.topic_id)?.emoji,
    authorId: row.author_id,
    authorName: names.get(row.author_id) ?? 'Estudiante',
    title: row.title,
    body: row.body,
    replyCount: row.reply_count,
    answered: row.answered_at !== null,
    createdAt: row.created_at,
  }));
}

export async function listQuestions(opts?: {
  topicId?: string;
  search?: string;
  limit?: number;
}): Promise<QaQuestion[]> {
  let query = supabase
    .from('questions')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(opts?.limit ?? 50);
  if (opts?.topicId) query = query.eq('topic_id', opts.topicId);
  const term = opts?.search?.trim();
  if (term) {
    const like = `%${term.replaceAll('%', '').replaceAll(',', ' ')}%`;
    query = query.or(`title.ilike.${like},body.ilike.${like}`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return mapQuestions(data ?? []);
}

export async function getQuestion(questionId: string): Promise<QaQuestion | null> {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('id', questionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [question] = await mapQuestions([data]);
  return question ?? null;
}

export async function askQuestion(topicId: string, title: string, body: string): Promise<QaQuestion> {
  const uid = await requireUid();
  const { data, error } = await supabase
    .from('questions')
    .insert({ topic_id: topicId, author_id: uid, title: title.trim(), body: body.trim() })
    .select('*')
    .single();
  if (error) throw error;
  const [question] = await mapQuestions([data]);
  return question;
}

// ---------------------------------------------------------------------------
// Respuestas: oficiales destacadas (RLS: solo asignados) + comentarios
// ---------------------------------------------------------------------------

export async function listQuestionReplies(questionId: string): Promise<QaReply[]> {
  const { data, error } = await supabase
    .from('question_replies')
    .select('*')
    .eq('question_id', questionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  const names = await getNamesByIds(rows.map((r) => r.author_id));
  const publisherIds = [...new Set(rows.map((r) => r.publisher_id).filter((p): p is string => Boolean(p)))];
  const publisherNames = new Map<string, string>();
  if (publisherIds.length > 0) {
    const { data: pubs } = await supabase.from('publishers').select('id, name').in('id', publisherIds);
    (pubs ?? []).forEach((p) => publisherNames.set(p.id, p.name));
  }
  return rows.map((row) => ({
    id: row.id,
    questionId: row.question_id,
    authorId: row.author_id,
    authorName: names.get(row.author_id) ?? 'Estudiante',
    publisherName: row.publisher_id ? publisherNames.get(row.publisher_id) : undefined,
    body: row.body,
    isOfficial: row.is_official,
    createdAt: row.created_at,
  }));
}

/**
 * Publica una respuesta. `official` exige estar asignado al tema (la política
 * RLS lo rechaza si no); `publisherId` firma a nombre de la federación.
 */
export async function addQuestionReply(
  questionId: string,
  body: string,
  opts?: { official?: boolean; publisherId?: string }
): Promise<void> {
  const uid = await requireUid();
  const { error } = await supabase.from('question_replies').insert({
    question_id: questionId,
    author_id: uid,
    body: body.trim(),
    is_official: opts?.official ?? false,
    publisher_id: opts?.official ? opts?.publisherId ?? null : null,
  });
  if (error) {
    if (error.code === '42501') {
      throw new Error('Solo los responsables del tema pueden responder oficialmente');
    }
    throw error;
  }
}

/** Refresca la pregunta abierta cuando entran respuestas (realtime). */
export function subscribeToQuestion(questionId: string, onChange: () => void): RealtimeChannel {
  return supabase
    .channel(`question:${questionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'question_replies',
        filter: `question_id=eq.${questionId}`,
      },
      onChange
    )
    .subscribe();
}

// ---------------------------------------------------------------------------
// Asignados por tema y habilitación de respuesta oficial
// ---------------------------------------------------------------------------

export async function listTopicAssignees(topicId: string): Promise<TopicAssignees> {
  const { data, error } = await supabase
    .from('topic_assignees')
    .select('*')
    .eq('topic_id', topicId);
  if (error) throw error;
  const rows = data ?? [];
  const tutorIds = rows.map((r) => r.user_id).filter((u): u is string => Boolean(u));
  const publisherIds = rows.map((r) => r.publisher_id).filter((p): p is string => Boolean(p));

  const tutors: TopicAssignees['tutors'] = [];
  if (tutorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', tutorIds);
    for (const p of profiles ?? []) {
      tutors.push({
        id: p.id,
        name: p.full_name?.trim() || 'Tutor',
        avatarUrl: await resolveAvatarUrl(p.avatar_url),
      });
    }
  }

  const publishers: TopicAssignees['publishers'] = [];
  if (publisherIds.length > 0) {
    const { data: pubs } = await supabase.from('publishers').select('id, name').in('id', publisherIds);
    (pubs ?? []).forEach((p) => publishers.push({ id: p.id, name: p.name }));
  }

  return { tutors, publishers };
}

/**
 * ¿Puede el usuario actual responder oficialmente este tema? Directo como
 * tutor asignado, o a nombre de un publisher asignado del que es miembro
 * (publisher_members, Sesión 5). El servidor re-verifica vía RLS.
 */
export async function getOfficialAbility(topicId: string): Promise<OfficialAbility> {
  const { data: session } = await supabase.auth.getUser();
  const uid = session.user?.id;
  if (!uid) return { canAnswer: false };

  const { data: assignees, error } = await supabase
    .from('topic_assignees')
    .select('*')
    .eq('topic_id', topicId);
  if (error) throw error;
  const rows = assignees ?? [];

  if (rows.some((r) => r.user_id === uid)) return { canAnswer: true };

  const assignedPublishers = rows
    .map((r) => r.publisher_id)
    .filter((p): p is string => Boolean(p));
  if (assignedPublishers.length === 0) return { canAnswer: false };

  const { data: memberships } = await supabase
    .from('publisher_members')
    .select('publisher_id')
    .eq('user_id', uid)
    .in('publisher_id', assignedPublishers);
  const publisherId = memberships?.[0]?.publisher_id;
  if (!publisherId) return { canAnswer: false };

  const { data: pub } = await supabase
    .from('publishers')
    .select('name')
    .eq('id', publisherId)
    .maybeSingle();
  return { canAnswer: true, publisherId, publisherName: pub?.name };
}

// ---------------------------------------------------------------------------
// Mini-perfil de tutor: sus temas asignados (para enlazar desde el Q&A)
// ---------------------------------------------------------------------------

export type TutorProfile = {
  id: string;
  name: string;
  avatarUrl?: string;
  topics: QaTopic[];
};

export async function getTutorProfile(userId: string): Promise<TutorProfile | null> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!profile) return null;

  const { data: assignments } = await supabase
    .from('topic_assignees')
    .select('topic_id')
    .eq('user_id', userId);
  const topicIds = (assignments ?? []).map((a) => a.topic_id);
  const topics = await getTopicsByIds(topicIds);

  return {
    id: profile.id,
    name: profile.full_name?.trim() || 'Tutor',
    avatarUrl: await resolveAvatarUrl(profile.avatar_url),
    topics: topicIds.map((id) => topics.get(id)).filter((t): t is QaTopic => Boolean(t)),
  };
}

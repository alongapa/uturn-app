// Servicio de bots de IA (Sesión Bots de IA): configuración del bot de un
// publisher o del bot de un tutor por asignatura. El bot en sí es un perfil
// más (profiles.is_bot) con el que se chatea por DM normal — abrirlo pasa
// por services/api/messages.ts#startDm(bot.profileId), sin RPC nueva.
// Crear/editar el bot SÍ pasa por RPC (set_publisher_bot/set_tutor_topic_bot):
// verifican en el servidor quién administra qué (can_manage_publisher, o ser
// el tutor asignado al tema) y son las únicas que pueden crear la cuenta de
// servicio del bot.

import { supabase } from '@/services/supabase';
import type { AiBotOwnerKind, AiBotRow } from '@/types/database';

export type AiBot = {
  id: string;
  profileId: string;
  ownerKind: AiBotOwnerKind;
  publisherId?: string;
  tutorId?: string;
  topicId?: string;
  personaName: string;
  systemPrompt: string;
  enabled: boolean;
};

function mapBot(row: AiBotRow): AiBot {
  return {
    id: row.id,
    profileId: row.profile_id,
    ownerKind: row.owner_kind,
    publisherId: row.publisher_id ?? undefined,
    tutorId: row.tutor_id ?? undefined,
    topicId: row.topic_id ?? undefined,
    personaName: row.persona_name,
    systemPrompt: row.system_prompt,
    enabled: row.enabled,
  };
}

export async function getPublisherBot(publisherId: string): Promise<AiBot | null> {
  const { data, error } = await supabase
    .from('ai_bots')
    .select('*')
    .eq('publisher_id', publisherId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapBot(data) : null;
}

/** Bots de un tutor por cada una de sus asignaturas asignadas (topic_assignees). */
export async function listTutorBots(tutorId: string): Promise<AiBot[]> {
  const { data, error } = await supabase
    .from('ai_bots')
    .select('*')
    .eq('tutor_id', tutorId);
  if (error) throw error;
  return (data ?? []).map(mapBot);
}

export async function getTutorTopicBot(tutorId: string, topicId: string): Promise<AiBot | null> {
  const { data, error } = await supabase
    .from('ai_bots')
    .select('*')
    .eq('tutor_id', tutorId)
    .eq('topic_id', topicId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapBot(data) : null;
}

/** Crea/edita el bot de un publisher. La RLS exige can_manage_publisher (Sesión 5). */
export async function setPublisherBot(
  publisherId: string,
  personaName: string,
  systemPrompt: string,
  enabled = true
): Promise<AiBot> {
  const { data, error } = await supabase.rpc('set_publisher_bot', {
    p_publisher_id: publisherId,
    p_persona_name: personaName.trim(),
    p_system_prompt: systemPrompt.trim(),
    p_enabled: enabled,
  });
  if (error) throw error;
  return mapBot(data);
}

/** Crea/edita el bot de un tutor para una asignatura. Solo el propio tutor asignado. */
export async function setTutorTopicBot(
  topicId: string,
  personaName: string,
  systemPrompt: string,
  enabled = true
): Promise<AiBot> {
  const { data, error } = await supabase.rpc('set_tutor_topic_bot', {
    p_topic_id: topicId,
    p_persona_name: personaName.trim(),
    p_system_prompt: systemPrompt.trim(),
    p_enabled: enabled,
  });
  if (error) throw error;
  return mapBot(data);
}

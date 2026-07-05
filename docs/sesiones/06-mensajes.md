# Sesión 6 — Mensajes, tutores y Q&A (sobre Supabase Realtime)

## Objetivo
Construir el tab **Mensajes** con chat en tiempo real desde el día uno: mensajes directos entre alumnos a modo de comunidad, servicio al cliente, y un sistema de **preguntas por temas** respondidas por federaciones o alumnos **tutores** (quienes además pueden subir guías y contenido).

## Ya integrado en el repo
- **Nada de mensajería existe (0%)**. No hay pantallas, modelos ni servicios de chat, soporte, tutores o Q&A.
- Backend Supabase operativo (Sesión 3): auth, RLS, migraciones, Storage, **Supabase Realtime** ya usado en trips/bookings — mismo patrón para el chat.
- Rol `tutor` en `profiles` y `hooks/use-permissions.ts` (Sesión 0/3); `publishers` (federaciones, Sesión 4) como cuentas que responden oficialmente.
- `expo-image-picker` para adjuntar imágenes/guías.

## Mejoras sobre lo existente
- Ninguna directa (módulo nuevo). El chat nace realtime sobre Supabase — no hay versión local previa que migrar.

## Falta por construir
1. **Tablas y migraciones**: `conversations` (tipo: dm/soporte), `conversation_members`, `messages` (texto, imagen, leído), `topics` (mallas, ramos, becas, deportes, fiestas…), `topic_assignees` (qué tutores/publishers responden cada tema), `questions` + `question_replies` (con marca de respuesta oficial), `guides` (título, tema, archivo en Storage). Documentar en `docs/backend.md`.
2. **RLS de privacidad**: solo los miembros de una conversación leen/escriben sus mensajes (la política es la garantía, no el cliente); preguntas y guías son públicas para autenticados; responder oficialmente solo asignados al tema; subir guías solo `tutor`+.
3. **Tab Mensajes**: nueva entrada en `app/(tabs)/` con lista de conversaciones (DMs, soporte, hilos de Q&A), no-leídos y buscador.
4. **DMs realtime**: chat 1-a-1 con suscripción a `messages` (mensajes entran sin recargar), indicador de leído; iniciar DM desde un perfil o desde un viaje compartido (útil para coordinar carpooling).
5. **Servicio al cliente**: conversación especial con "Soporte Unities" (atendida por cuentas `admin`/`owner`), con categorías (pagos, baneos, verificación) y estados (abierto/resuelto).
6. **Q&A por temas**: el usuario publica una pregunta eligiendo tema; los responsables asignados (federación o tutores del tema) responden oficialmente y su respuesta queda destacada; otros alumnos pueden comentar.
7. **Tutores y contenido**: mini-perfil del tutor con sus temas; subida de guías (PDF/imágenes con título y tema) al bucket `guides`, consultables desde el Q&A y enlazables al feed.

## Entregables / criterios de aceptación
- [ ] Un DM enviado desde un dispositivo aparece en el otro **sin recargar** (realtime).
- [ ] La RLS impide leer conversaciones ajenas (probado con otra cuenta vía API).
- [ ] Conversación de soporte con categorías y estado abierto/resuelto.
- [ ] Una pregunta por tema llega a sus responsables; la respuesta oficial queda destacada; un `user` no puede responder oficialmente.
- [ ] Un `tutor` sube una guía y queda asociada a su tema, servida desde Storage.
- [ ] Migraciones versionadas, `docs/backend.md` actualizado y `npm test` pasa.

## Dependencias
Sesión 3 (Supabase + Realtime). Se enriquece con la Sesión 4 (federaciones como responsables) pero no la bloquea.

## Prompt para iniciar la sesión

```text
Estoy trabajando en Unities (repo uturn-app), app universitaria en Expo + expo-router + TypeScript con tabs en app/(tabs)/ y backend Supabase operativo (Sesión 3: auth real, RLS, migraciones, Storage, Realtime ya usado en trips/bookings; Sesión 4: publishers/federaciones en el feed). Esta es la Sesión 6 del roadmap (ROADMAP.md, docs/sesiones/06-mensajes.md). Trabaja en una rama nueva sesion/06-mensajes creada desde main actualizado.

Contexto: no existe nada de mensajería en el repo. El chat nace realtime sobre Supabase.

Tareas de esta sesión — tab Mensajes completo:
1. Migraciones: conversations (dm/soporte), conversation_members, messages (texto, imagen, leído), topics, topic_assignees, questions/question_replies (con respuesta oficial), guides (archivo en Storage). Documenta en docs/backend.md.
2. RLS: solo miembros leen/escriben su conversación; responder oficialmente solo asignados al tema; subir guías solo tutor+; preguntas/guías públicas para autenticados.
3. Nuevo tab Mensajes con lista de conversaciones (DMs, soporte, Q&A), contadores de no-leídos y buscador.
4. DMs 1-a-1 en tiempo real (suscripción a messages, sin recargar), indicador de leído, e iniciar chat desde un viaje compartido para coordinar el carpooling.
5. Servicio al cliente: "Soporte Unities" atendido por admin/owner, con categorías (pagos, baneos, verificación) y estados abierto/resuelto.
6. Q&A por temas: preguntar eligiendo tema (mallas, becas, deportes, etc.); responden oficialmente la federación o tutores asignados (respuesta destacada); otros alumnos comentan.
7. Tutores: mini-perfil por temas y subida de guías (imágenes/PDF) al bucket guides, consultables desde el Q&A.

Usa las skills de Supabase instaladas en el repo (.agents/skills/supabase y .agents/skills/supabase-postgres-best-practices) al escribir migraciones, RLS y Realtime. No toques carpooling, feed ni panel admin. Al terminar, verifica el chat en dos dispositivos (mensajes en vivo y privacidad entre cuentas) y que npm test pasa, haz commit y push de la rama, fusiónala a main y pushea también main; si npm test falla o algo queda a medias, no fusiones: pushea solo la rama y repórtame el problema.
```

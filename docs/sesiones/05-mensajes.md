# Sesión 5 — Mensajes, tutores y Q&A

## Objetivo
Construir el tab **Mensajes**: mensajes directos entre alumnos a modo de comunidad, servicio al cliente, y un sistema de **preguntas por temas** respondidas por federaciones o alumnos **tutores** (quienes además pueden subir guías y contenido).

## Ya integrado en el repo
- **Nada de mensajería existe (0%)**. No hay pantallas, modelos ni servicios de chat, soporte, tutores o Q&A.
- Reutilizable: rol `tutor` y `usePermissions` (Sesión 0), entidades `Publisher` (federaciones, Sesión 3) como cuentas que responden, persistencia con AsyncStorage, `expo-image-picker` para adjuntar imágenes/guías.

## Mejoras sobre lo existente
- Ninguna directa (módulo nuevo). Considerar que el backend elegido en la Sesión 0 (Supabase realtime) es el camino para chat en tiempo real; en esta sesión el chat puede funcionar local/mock con la arquitectura lista para conectarlo.

## Falta por construir
1. **Tab Mensajes**: nueva entrada en `app/(tabs)/` con lista de conversaciones (DMs, soporte, hilos de Q&A) y buscador.
2. **Mensajes directos**: modelo `Conversation`/`Message` (texto, imagen, timestamp, leído), pantalla de chat 1-a-1 entre alumnos, iniciar DM desde un perfil o desde un viaje compartido (útil para coordinar carpooling).
3. **Servicio al cliente**: conversación especial con "Soporte Uturn" (atendida por cuentas `admin`/`owner`), con categorías (pagos, baneos, verificación) y estados (abierto/resuelto).
4. **Q&A por temas**: el usuario publica una pregunta eligiendo un tema (p. ej. mallas, ramos, becas, deportes, fiestas); cada tema tiene asignados responsables — la federación correspondiente o los alumnos tutores del tema — que son quienes pueden responder oficialmente. Otros alumnos pueden comentar; la respuesta del responsable queda destacada.
5. **Tutores y contenido**: los inscritos en el curso de tutores (rol `tutor`) tienen mini-perfil con sus temas, pueden **subir guías/contenido** (PDF/imágenes con título y tema) consultables desde el Q&A y enlazables al feed.
6. **Jerarquía de cuentas**: usuarios normales solo preguntan/chatean; `tutor` responde en sus temas y sube guías; `admin` (federaciones) responde y modera; `owner` administra todo. Reusar `usePermissions`.

## Entregables / criterios de aceptación
- [ ] Tab Mensajes con lista de conversaciones y chat 1-a-1 funcional y persistente.
- [ ] Conversación de soporte con categorías y estado abierto/resuelto.
- [ ] Publicar una pregunta por tema la enruta a los responsables del tema; su respuesta queda destacada.
- [ ] Un `tutor` puede subir una guía y aparece asociada a su tema.
- [ ] Un `user` no puede responder oficialmente ni subir guías (permisos respetados).
- [ ] `npm test` pasa.

## Dependencias
Sesión 0 (roles, persistencia). Se enriquece con las Sesiones 3-4 (federaciones como responsables) pero no las bloquea.

## Prompt para iniciar la sesión

```text
Estoy trabajando en Uturn (repo uturn-app), app universitaria en Expo + expo-router + TypeScript con tabs en app/(tabs)/. Esta es la Sesión 5 del roadmap (ROADMAP.md, docs/sesiones/05-mensajes.md). Ya están hechas las Sesiones 0-4 (roles user/tutor/admin/owner con usePermissions, persistencia, feed con Publishers/federaciones).

Contexto: no existe nada de mensajería en el repo.

Tareas de esta sesión — tab Mensajes completo:
1. Nuevo tab Mensajes en app/(tabs)/ con lista de conversaciones (DMs, soporte, Q&A) y buscador.
2. DMs 1-a-1 entre alumnos (modelos Conversation/Message: texto, imagen, timestamp, leído), con opción de iniciar chat desde un viaje compartido para coordinar el carpooling.
3. Servicio al cliente: conversación con "Soporte Uturn" atendida por admin/owner, con categorías (pagos, baneos, verificación) y estados abierto/resuelto.
4. Q&A por temas: el usuario pregunta eligiendo tema (mallas, becas, deportes, etc.); responden oficialmente la federación o los tutores asignados al tema (respuesta destacada); otros alumnos pueden comentar.
5. Tutores: rol tutor con mini-perfil por temas y subida de guías/contenido (imágenes/PDF con título y tema) consultables desde el Q&A.
6. Permisos con usePermissions: user solo pregunta/chatea; tutor responde en sus temas y sube guías; admin modera; owner administra.

El chat puede ser local/persistido con AsyncStorage, con la arquitectura lista para conectar el realtime del backend después. No toques carpooling, feed ni panel admin. Al terminar, commit y push.
```

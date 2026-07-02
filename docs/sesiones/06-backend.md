# Sesión 6 — Backend real (Supabase): auth, datos y storage

## Objetivo
Reemplazar el estado mock/AsyncStorage por un backend real: autenticación verdadera con email institucional, base de datos Postgres para todos los modelos (viajes, pagos, créditos, feed, mensajes) y storage para imágenes. A partir de aquí la app funciona entre usuarios reales, no solo en un dispositivo.

## Ya integrado en el repo
- Toda la app funcional de las Sesiones 0–5, con estado en `store/appState.tsx` + `contexts/UserContext.tsx` persistido en AsyncStorage.
- `docs/backend.md` (Sesión 0) con la decisión de backend y el esquema tentativo de tablas.
- Modelos TypeScript ya tipados en `models/types.ts` (User, Trip, Booking, pagos, créditos, Publisher, Post, Story, Conversation, Message) que sirven de base para el esquema SQL.
- Login con validación de dominios institucionales (`screens/LoginScreen.tsx`) y verificación de credencial (`screens/CredentialVerificationScreen.tsx`), hoy solo cosméticos.

## Mejoras sobre lo existente
- La auth actual acepta cualquier email con dominio válido sin contraseña ni verificación: pasar a auth real (magic link u OTP al correo institucional confirma automáticamente que el alumno controla ese email).
- Las capturas de credencial y fotos de perfil hoy viven como URIs locales: subirlas a storage con URLs firmadas.
- El `appState` monolítico se divide en servicios de datos por dominio (`services/api/trips.ts`, `payments.ts`, `feed.ts`, `messages.ts`, `credits.ts`).

## Falta por construir
1. **Proyecto Supabase + esquema**: tablas según `docs/backend.md` (users, trips, bookings, payments, strikes, credits, redemptions, publishers, posts, stories, conversations, messages, questions, guides), con migraciones versionadas en `supabase/migrations/`.
2. **Auth real**: registro/login con OTP o magic link al email institucional; sesión persistente con refresh; `UserContext` pasa a envolver la sesión de Supabase. Roles (`user/tutor/admin/owner`) como claim en la tabla de perfiles.
3. **Row Level Security**: políticas por tabla — un usuario solo ve/edita lo suyo; admins escriben en sus publishers; solo el owner aprueba canjeos; los strikes/baneos solo los escribe lógica de servidor.
4. **Capa de datos en la app**: cliente Supabase (`services/supabase.ts`), reemplazo de los CRUD de `appState` por consultas reales manteniendo las mismas firmas para no reescribir pantallas; caché offline básica (AsyncStorage pasa a ser caché, no fuente de verdad).
5. **Storage**: buckets para fotos de perfil, credenciales, media del feed y guías de tutores, con compresión de imagen al subir.
6. **Lógica de servidor**: Edge Functions/cron para lo que no puede ser cliente — expirar pagos a las 48 h y emitir strikes, expirar historias a las 24 h, expirar canjeables, calcular rachas.

## Entregables / criterios de aceptación
- [ ] Dos dispositivos distintos ven los mismos viajes/posts/mensajes.
- [ ] Login por OTP/magic link con email institucional; reabrir la app conserva la sesión.
- [ ] RLS verificada: un `user` no puede escribir posts de un publisher ni aprobar canjeos.
- [ ] Un pago no realizado genera strike a las 48 h sin intervención del cliente.
- [ ] Fotos/credenciales/guías se sirven desde storage.
- [ ] `npm test` pasa y las migraciones están versionadas en el repo.

## Dependencias
Sesiones 0–5 (todos los modelos y flujos existen localmente; esta sesión los conecta).

## Prompt para iniciar la sesión

```text
Estoy trabajando en Uturn (repo uturn-app), app universitaria en Expo + expo-router + TypeScript. Esta es la Sesión 6 del roadmap (ROADMAP.md, docs/sesiones/06-backend.md). Las Sesiones 0-5 ya están hechas: toda la app (carpooling con pagos 48h/strikes, perfil con créditos/canjeos, feed con historias, panel admin, mensajes) funciona con estado local en store/appState.tsx + AsyncStorage, y docs/backend.md documenta el esquema tentativo. Trabaja en una rama nueva sesion/06-backend creada desde main actualizado.

Tareas de esta sesión — migrar a Supabase:
1. Esquema Postgres según docs/backend.md con migraciones versionadas en supabase/migrations/ (users, trips, bookings, payments, strikes, credits, redemptions, publishers, posts, stories, conversations, messages, questions, guides).
2. Auth real: OTP/magic link al email institucional, sesión persistente, roles user/tutor/admin/owner en la tabla de perfiles; UserContext envuelve la sesión de Supabase.
3. Row Level Security por tabla (usuarios solo lo suyo, admins solo su publisher, owner aprueba canjeos, strikes solo desde servidor).
4. Capa de datos: services/supabase.ts + servicios por dominio reemplazando los CRUD de appState manteniendo las mismas firmas; AsyncStorage queda como caché.
5. Storage para fotos de perfil, credenciales, media del feed y guías.
6. Edge Functions/cron: expirar pagos a 48h y emitir strikes, expirar historias a 24h, calcular rachas.

Usa variables de entorno para las credenciales (no las commitees). Al terminar, verifica con dos usuarios distintos y que npm test pasa, haz commit y push de la rama y abre un Pull Request hacia main (no lo fusiones: lo reviso y fusiono yo antes de la siguiente sesión).
```

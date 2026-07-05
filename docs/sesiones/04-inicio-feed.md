# Sesión 4 — Inicio / Feed: publicaciones, historias y widgets (sobre Supabase)

## Objetivo
Construir el nuevo tab **Inicio** como red social universitaria estilo Twitter/Threads con historias: publicaciones de federaciones, departamentos, centros de alumnos y de la propia universidad; **historias** arriba del feed; **widgets de eventos de la semana**; carretes, activaciones y descuentos. Todo respaldado por tablas, RLS y Storage en Supabase desde el primer día.

## Ya integrado en el repo
- **Nada del feed existe (0%)**. El tab "Inicio" actual (`app/(tabs)/index.tsx` → `screens/HomeScreen.tsx`) es un selector "Entrar como Conductor / Entrar como Pasajero" con una grilla estática de beneficios.
- Backend Supabase operativo (Sesión 3): auth real, `services/supabase.ts`, migraciones versionadas en `supabase/migrations/`, RLS, Storage y patrón de servicios por dominio (`services/api/*`).
- Reutilizable: navegación por tabs (`app/(tabs)/_layout.tsx`), tema (`constants/theme.ts`), primitivas UI en `components/`, `expo-image` para media, roles con `hooks/use-permissions.ts`.

## Mejoras sobre lo existente
- **Reubicar el selector conductor/pasajero**: el contenido actual de `HomeScreen` se muda al tab "Mis viajes" (o a un tab "Viajes" propio), liberando Inicio para el feed.

## Falta por construir
1. **Tablas y migraciones**: `publishers` (federación, departamento, centro de alumnos, universidad, marca; nombre, avatar, tipo, universidad), `posts` (autor publisher o tutor, texto, media, tipo `noticia|evento|activacion|descuento`, fecha de evento), `stories` (expiran a 24 h — la función programada ya existe del patrón de la Sesión 3), `post_likes`, `post_reposts`, `post_replies`. Seed con entidades reales (FEUAI, centros de alumnos por carrera). Documentar en `docs/backend.md`.
2. **RLS como enforcement real**: lectura para autenticados; **insertar posts/historias solo `admin`/`owner` (y `tutor` en sus temas) vía política sobre el rol del perfil** — el cliente solo refleja el permiso; likes/reposts/replies para cualquier autenticado, uno por usuario (constraint).
3. **Storage**: bucket `feed-media` para imágenes/carretes con compresión al subir.
4. **Feed**: pantalla cronológica leyendo de Postgres con paginación (cursor por fecha), tarjetas diferenciadas por tipo (galería para carretes, badge y fecha para activaciones, código/condición para descuentos, enlace a canjeables de la Sesión 2 cuando aplique), y suscripción realtime para posts nuevos.
5. **Historias**: fila horizontal arriba del feed (círculos con avatar del publisher), visor a pantalla completa con avance por toque; la expiración a 24 h la aplica el servidor.
6. **Widget de eventos de la semana**: carrusel/tarjeta fija en el feed con los eventos de los próximos 7 días ("Qué te espera esta semana en la UAI"), consultando los posts tipo `evento`. Este widget es el que administran los admins en la Sesión 5.
7. **Interacciones**: like, repost, responder (hilo simple), con actualización optimista y conteos desde Postgres.

## Entregables / criterios de aceptación
- [x] El tab Inicio muestra historias + widget de eventos + feed paginado leído de Supabase; un post publicado en un dispositivo aparece en otro (suscripción realtime a `posts`; tablas agregadas a la publicación `supabase_realtime`).
- [x] La RLS impide publicar a un `user` normal aun llamando la API directo (verificado por SQL impersonando dos cuentas: `user` rechazado con 42501, `admin` publica; suplantar `author_id` también se rechaza).
- [x] El visor de historias funciona (pantalla completa, avance por toque) y las historias desaparecen a las 24 h por servidor (política `expires_at > now()` + purga pg_cron `purge-expired-stories`).
- [x] Cada tipo de post (noticia/evento/activación/descuento/carrete) tiene su tarjeta diferenciada; la media del contenido nuevo se sube al bucket `feed-media` (el seed usa URLs de demo).
- [x] Like/repost/respuesta funcionan con constraint de unicidad (23505 en duplicados; contadores denormalizados por trigger).
- [x] El selector conductor/pasajero sigue accesible desde el tab de viajes (arriba de "Mis viajes").
- [x] Migraciones versionadas (`…120000` a `…120002`, también en `apply_all.sql`), `docs/backend.md` actualizado y `npm test` pasa.

## Dependencias
Sesión 3 (Supabase operativo). No depende de las Sesiones 1–2 más allá del enlace a canjeables.

## Prompt para iniciar la sesión

```text
Estoy trabajando en Unities (repo uturn-app), app universitaria en Expo + expo-router + TypeScript con tabs en app/(tabs)/ y backend Supabase ya operativo (Sesión 3: auth OTP institucional, services/supabase.ts, migraciones en supabase/migrations/, RLS, Storage, servicios por dominio en services/api/*). Esta es la Sesión 4 del roadmap (ROADMAP.md, docs/sesiones/04-inicio-feed.md). Trabaja en una rama nueva sesion/04-feed creada desde main actualizado.

Contexto: no existe nada de feed. El tab Inicio actual (app/(tabs)/index.tsx → screens/HomeScreen.tsx) es solo un selector conductor/pasajero que hay que mudar al tab de viajes.

Tareas de esta sesión — construir el nuevo Inicio estilo Twitter/Threads sobre Supabase:
1. Migraciones: tablas publishers (federación/departamento/centro de alumnos/universidad/marca), posts (texto, media, tipo noticia|evento|activacion|descuento), stories (expiración 24h server-side), post_likes/post_reposts/post_replies con constraints de unicidad. Seed realista (FEUAI, centros por carrera). Documenta las tablas en docs/backend.md.
2. RLS: leer autenticados; publicar solo admin/owner (y tutor) según el rol en profiles — el enforcement es la política, no el cliente; interacciones una por usuario.
3. Bucket feed-media en Storage para imágenes/carretes.
4. Feed cronológico paginado (cursor) con tarjetas diferenciadas por tipo (galería para carretes, badge para activaciones, código para descuentos) y realtime para posts nuevos.
5. Fila de historias con visor a pantalla completa (avance por toque).
6. Widget "Eventos de la semana": carrusel fijo con los posts tipo evento de los próximos 7 días.
7. Interacciones like/repost/responder con actualización optimista; mover el selector conductor/pasajero de HomeScreen al tab de viajes.

Usa las skills de Supabase instaladas en el repo (.agents/skills/supabase y .agents/skills/supabase-postgres-best-practices) al escribir migraciones y RLS. Usa el tema de constants/theme.ts y las primitivas de components/. No toques pagos, mensajes ni panel admin. Al terminar, verifica con dos cuentas (una admin publica, una user ve y no puede publicar) y que npm test pasa, haz commit y push de la rama, fusiónala a main y pushea también main; si npm test falla o algo queda a medias, no fusiones: pushea solo la rama y repórtame el problema.
```

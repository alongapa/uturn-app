# Sesión Analítica — Tendencias de engagement (agregado y anonimizado)

## Objetivo
Registrar cómo interactúan los alumnos con el contenido (clicks en widgets, vistas de posts/historias, categorías) y convertir eso en **reportes de tendencias por universidad/campus/federación** que Unities pueda vender a las universidades como BI institucional. **Modelo de datos decidido: agregado y anonimizado** — nunca se vende ni se expone el comportamiento de un alumno identificado; toda métrica que se entregue respeta un **umbral mínimo de cohorte (k-anonimato)** para que nadie sea reidentificable.

## Ya integrado en el repo
- **No existe analítica (0%)**. No hay tabla de eventos ni tracking.
- Puntos naturales de instrumentación (clicks/vistas): `components/feed/events-week-widget.tsx` y `components/feed/folders-widget.tsx` (widgets con `TouchableOpacity onPress`), tarjetas de post e historias del feed (`services/api/feed.ts`, `FeedScreen`), catálogo de canjes, aperturas de tab.
- Contexto de segmentación ya disponible: `profiles.university_id` y `profiles.home_campus_id` (Sesión 3), `publishers`/`posts`/`widget_config` con `type`/categoría (Sesiones 4–5).
- Roles reales en `profiles.account_role`: `user` / `tutor` / `admin` (admin de federación) / `owner`. Patrón de servicios `services/api/*`, RLS y pg_cron ya establecido.

## Privacidad por diseño (no negociable en este modelo)
- **k-anonimato**: cualquier celda agregada con menos de `K` alumnos distintos (por defecto **K = 20**) se suprime en los reportes vendibles. Configurable por el owner, nunca por debajo de un mínimo.
- **Sin PII en la salida**: los reportes exponen conteos y porcentajes por segmento (universidad × campus × categoría × tipo × semana), nunca `actor_id`, nombre ni correo.
- **Consentimiento**: aviso de tratamiento de datos en Términos + **toggle de opt-out en Ajustes** ("Compartir mi actividad para estadísticas anónimas", por defecto según lo que definas legalmente). Los eventos de usuarios opt-out no se recolectan.
- **Retención**: los eventos crudos se conservan N días (ej. 90) y luego solo quedan las agregaciones; documentar la política.
- **Menores**: el modelo agregado es apto; no se genera ni vende ningún perfil individual.

## Falta por construir
1. **Tabla de eventos** (migración): `analytics_events` (`id`, `actor_id` FK→profiles, `university_id`, `campus_id`, `event_type` — `widget_click`/`post_view`/`post_open`/`story_view`/`redeemable_view`/`tab_open`, `entity_type`, `entity_id`, `publisher_id` nullable, `category` nullable, `metadata` jsonb, `created_at`). Índices por `(university_id, created_at)` y `(event_type, created_at)`. `actor_id` existe solo para permitir el derecho a borrado y el `COUNT(DISTINCT)`; **nunca** sale en reportes.
2. **RLS**: `insert` solo del propio `actor_id` autenticado; **sin `select`** para usuarios normales (ni siquiera propios, o solo propios). Lectura de crudos únicamente por `owner`/service role. Nada de exponer la tabla cruda a compradores.
3. **Servicio de tracking en el cliente**: `services/api/analytics.ts` con `track(event)` en cola/batch (para no golpear la red en cada tap), respetando el opt-out; instrumentar los `onPress` de los widgets, vistas de post/historia (al entrar en viewport), catálogo de canjes y aperturas de tab.
4. **Agregación automatizada**: rollup por `pg_cron` (nightly) a tablas/materialized views `analytics_rollup_daily` y `analytics_rollup_weekly` (dimensiones: universidad × campus × categoría × tipo de contenido × publisher × ventana temporal; medidas: eventos, `COUNT(DISTINCT actor_id)`, growth week-over-week). Aplicar la supresión k-anónima en la capa que se expone, no en la cruda.
5. **RPC de reportes** `university_trends(p_university_id, p_from, p_to)` **security definer**, que devuelve solo cohortes ≥ K, llamable por `owner` (y opcionalmente un rol `university_analyst` de solo lectura por universidad). Métricas: categorías top, engagement por federación, horas peak, contenido en tendencia (velocidad de clicks), deltas semana a semana.
6. **Dashboards**:
   - **Owner**: `app/admin/analytics.tsx` — tendencias globales y por universidad, contenido top, engagement, y **exportación del reporte vendible** (CSV/PDF) por universidad, ya con k-anonimato aplicado.
   - **Admin de federación**: engagement solo de sus propios publishers/posts, agregado ≥ K.
7. **Automatización de la venta**: generación programada del reporte por universidad (pg_cron + Edge Function opcional) y export descargable; opcional: entrega periódica.
8. **Legal/consentimiento**: actualizar Términos/aviso de privacidad, toggle de opt-out en `SettingsScreen`, política de retención documentada en `docs/backend.md`.

## Entregables / criterios de aceptación
- [ ] Un click en un widget o una vista de post inserta un evento (verificado) y respeta el opt-out.
- [ ] La RLS impide que un `user` lea la tabla cruda de eventos ajenos (probado por SQL impersonando cuentas).
- [ ] El RPC `university_trends` **nunca** devuelve un segmento con menos de K alumnos (probar con un campus pequeño → celda suprimida).
- [ ] El rollup por pg_cron corre y las materialized views reflejan la actividad.
- [ ] El owner ve el dashboard y exporta un reporte por universidad sin ningún dato individual.
- [ ] Ningún export ni respuesta contiene `actor_id`/nombre/correo.
- [ ] Migraciones versionadas, `docs/backend.md` actualizado y `npm test` pasa.

## Dependencias
Sesiones 3 (Supabase, profiles con universidad/campus), 4 (feed/posts/categorías), 5 (publishers/widgets). Idealmente después de la Sesión Navegación (para instrumentar los tabs finales).

## Prompt para iniciar la sesión

```text
Trabajo en Unities (Uturn), app RN/Expo + Supabase. Modelo de datos y roles en docs/backend.md; roles reales en profiles.account_role: owner/admin/tutor/user. Esta sesión es Analítica de tendencias (docs/sesiones/analitica-tendencias.md). Trabaja en una rama nueva sesion/analitica creada desde main actualizado.

Modelo DECIDIDO: agregado y anonimizado. Nunca se vende ni expone comportamiento de un alumno identificado. Toda métrica vendible respeta k-anonimato (K=20 por defecto, configurable por owner, con mínimo).

Tareas:
1. Migración analytics_events (actor_id FK profiles, university_id, campus_id, event_type, entity_type, entity_id, publisher_id, category, metadata jsonb, created_at) + índices. actor_id solo para COUNT(DISTINCT) y derecho a borrado; nunca sale en reportes.
2. RLS: insert solo del propio actor autenticado; sin select para users; crudos solo owner/service.
3. services/api/analytics.ts: track(event) en batch respetando opt-out; instrumentar onPress de components/feed/*-widget.tsx, vistas de post/historia, catálogo de canjes y aperturas de tab.
4. Agregación pg_cron nightly a materialized views daily/weekly (universidad × campus × categoría × tipo × publisher × ventana; eventos, COUNT(DISTINCT actor_id), growth WoW). Supresión k-anónima en la capa expuesta.
5. RPC university_trends(university_id, from, to) security definer que devuelve solo cohortes >= K; llamable por owner (y opcional rol university_analyst read-only por universidad).
6. Dashboards: app/admin/analytics.tsx (owner: tendencias + export CSV/PDF por universidad con k-anonimato) y vista de engagement por federación para admin (solo sus publishers, agregado).
7. Consentimiento: toggle opt-out en SettingsScreen + política de retención (crudos N días, luego solo agregados) documentada en docs/backend.md; aviso en Términos.

Usa las skills de Supabase (.agents/skills/*) al escribir migraciones y RLS. Verifica: click inserta evento; RLS bloquea lectura cruda ajena; university_trends suprime cohortes < K (prueba con un campus pequeño); ningún export trae PII. Corre npm test antes de mergear. Al terminar, haz commit y push de la rama; fusiónala a main y pushea también main; si npm test falla o algo queda a medias, no fusiones: pushea solo la rama y repórtame el problema.
```

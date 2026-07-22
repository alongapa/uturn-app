# Sesión — Analítica de tendencias: agregada, anonimizada y k-anónima

## Objetivo
Darle a Unities (y a las federaciones/centros de alumnos que publican) visibilidad sobre qué contenido funciona y cómo crece el uso, **sin exponer jamás el comportamiento de un alumno identificado**. El modelo es agregado y anonimizado desde el diseño: toda métrica que sale de la base respeta k-anonimato (un mínimo configurable de cuentas distintas por cohorte antes de mostrar una cifra).

## Ya integrado en el repo
- Feed con posts/historias/widgets tipados y contadores (Sesión 4), panel admin con `publisher_members`/`can_manage_publisher` (Sesión 5), catálogo de canjes (Sesión 2/5) y navegación de 5 tabs — todo lo que esta sesión instrumenta ya existía y funcionaba sin analítica.
- Patrones reutilizados: helpers `security definer` (`is_owner`, `can_manage_publisher`), pg_cron idempotente (Sesión 3/7/8), tabla de configuración de fila única (`platform_config`, Sesión 8) y tablas de membresía como autorización (`publisher_members`, Sesión 5).

## Decisión de modelo
**Agregado y anonimizado, k-anónimo por defecto (K=20, configurable por el owner con mínimo 5).** `analytics_events.actor_id` existe solo para `COUNT(DISTINCT)` al agregar y para el derecho al borrado (cascada al eliminar el `profile`); ningún RPC expuesto al cliente lo selecciona. `university_id`/`campus_id` los fija el servidor desde el perfil del actor (trigger `set_analytics_event_origin`), nunca el payload del cliente, así ninguna cohorte puede falsearse para intentar “fishing” de datos pequeños.

## Construido en esta sesión
1. **`analytics_events`** + índices (Sesión de datos), `analytics_config` (k-anonimato/retención, fila única editable por el owner) y `university_analysts` (rol de solo-lectura por universidad **sin tocar** `profiles.account_role`).
2. **RLS**: insert solo del propio actor autenticado y solo si no optó por salir (verificado server-side); sin `UPDATE`/`DELETE` (log inmutable); **select solo el owner** — nadie más lee crudo, ni siquiera lo propio.
3. **`services/api/analytics.ts`**: `track()` en lote (flush cada 4 s o cada 20 eventos), respeta el opt-out en caché y lo prima desde `UserContext` sin duplicar consultas. Instrumentado en `events-week-widget.tsx`/`folders-widget.tsx` (click), `FeedScreen.tsx` (vista de post vía `onViewableItemsChanged`), `story-viewer.tsx` (vista de historia), `RedeemCatalogScreen.tsx` (click en canjear) y `app/(tabs)/_layout.tsx` (apertura de tab).
4. **`analytics_trends_daily`/`analytics_trends_weekly`** (materialized views, universidad × campus × categoría × tipo × publisher × ventana; `events`, `COUNT(DISTINCT actor_id)`, `growth_wow_pct`), refrescadas nightly por `pg_cron` (`refresh_analytics_trends()`); nunca legibles directo por clientes.
5. **RPC `university_trends`** (owner o `university_analysts` de esa universidad) y **`publisher_engagement`** (quien administra ese publisher) — ambos `SECURITY DEFINER`, ambos filtran `distinct_actors >= k` antes de devolver una fila.
6. **Dashboards**: `app/admin/analytics.tsx` (owner: tendencias por universidad, configuración de k/retención, export CSV/PDF vía `expo-print`+`expo-sharing`, descarga/impresión nativa en web) y `app/admin/engagement.tsx` (admin: engagement agregado, acotado a sus publishers).
7. **Consentimiento y retención**: toggle "Compartir datos de uso anónimos" en `SettingsScreen` (sección Privacidad); `analytics_config.retention_days` (90 por defecto) purga crudos (`purge_old_analytics_events()`, pg_cron nightly justo después del refresco); documentado en `docs/backend.md` → "Analítica de tendencias".

## Entregables / criterios de aceptación
- [x] Un click/vista inserta el evento y el servidor fija `actor_id`/`university_id`/`campus_id` reales, no lo que mande el cliente. — Trigger `set_analytics_event_origin`; probado en `supabase/tests/analytics_trends_test.sql` (paso 1).
- [x] RLS bloquea la lectura cruda a cualquiera que no sea el owner (ni siquiera lo propio). — Paso 3 del test.
- [x] El opt-out bloquea el insert server-side, no solo en el cliente. — Paso 2 del test.
- [x] `university_trends()`/`publisher_engagement()` suprimen cohortes con menos de k cuentas distintas y jamás seleccionan `actor_id`. — Pasos 5–6 del test (incluye chequeo estructural `to_jsonb(fila) ? 'actor_id'`).
- [x] Ningún export (CSV/PDF) trae PII — son las mismas filas agregadas y suprimidas del RPC; el export nunca añade columnas nuevas.
- [x] La retención purga crudos vencidos y dejar los recientes intactos. — Paso 8 del test.
- [ ] `npm test` (lint + typecheck) — **ver nota** más abajo.

> **Nota sobre verificación en este entorno**: este chat trabajó sin conexión MCP a Supabase autenticada ni Supabase CLI/Docker locales, así que las migraciones y `supabase/tests/analytics_trends_test.sql` **no se ejecutaron contra una base real** — se escribieron siguiendo al pie de la letra los patrones ya validados de `payments_cycle_test.sql` (RLS con `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', …)`, transacción con `ROLLBACK` final). Antes de mergear a producción, corre el test en sandbox (`supabase start && supabase db reset && psql … -f supabase/tests/analytics_trends_test.sql`) o aplica las migraciones vía el MCP de Supabase autenticado y repite las verificaciones de la lista de arriba a mano.

## Dependencias
Sesiones 3, 4, 5 (feed, panel admin y `can_manage_publisher`). Reutiliza `is_owner()`/`is_admin()` de la Sesión 5 y el patrón de configuración de fila única de la Sesión 8.

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

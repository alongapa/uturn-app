# Sesión 5 — Perfil Administrador (sobre Supabase)

## Objetivo
Dar a federaciones, centros de alumnos y marcas asociadas (rol `admin`) su panel de gestión: manejar widgets, subir contenido a carpetas integradas en los widgets, promocionar eventos, publicar historias y posts al feed, y **postular canjeos de créditos que requieren autorización del owner** — con la aprobación ejecutada en el servidor, no en el cliente.

## Ya integrado en el repo
- **Nada del panel admin existe (0%)**.
- Backend Supabase operativo (Sesión 3) con roles `user/tutor/admin/owner` en `profiles`, RLS, migraciones y Storage; tablas de créditos/canjes (`credit_transactions`, `redeemables`, `redemptions`) ya migradas.
- Feed sobre Supabase (Sesión 4): tablas `publishers`, `posts`, `stories`, widget de eventos y bucket `feed-media` — el panel escribe sobre estas mismas tablas.
- `hooks/use-permissions.ts` y `expo-image-picker` para subir media.

## Mejoras sobre lo existente
- En la Sesión 4 la publicación quedó restringida por RLS pero sin pantallas: aquí se construyen los flujos de creación reales (composer, gestión de widget).

## Falta por construir
1. **Acceso al panel**: entrada "Panel de administración" visible solo para `admin`/`owner`. Tabla `publisher_members` (qué usuarios administran qué publisher) con RLS: cada admin solo escribe en nombre de sus publishers.
2. **Composer de publicaciones**: crear posts al feed (noticia/evento/activación/descuento, con imágenes/carrete a `feed-media`) e **historias**. Ejemplos objetivo: "Qué te espera esta semana en la UAI", "Promociones de fin de semana", "¡Evento Alraz!", "Evento Red Bull".
3. **Gestión de widgets**: tabla `widget_config` (orden, destacado, fijado de eventos) administrada desde el panel, con vista previa de cómo lo verá el alumno; el widget de la Sesión 4 pasa a leer esta configuración.
4. **Carpetas de contenido**: tablas `content_folders`/`content_items` (media en Storage) por publisher; una carpeta puede integrarse/enlazarse a un widget del feed.
5. **Marcas asociadas**: tabla `brands` vinculada a publishers (logo en Storage, nombre) para co-firmar promociones y activaciones.
6. **Postulación de canjeos**: el admin propone un canjeable (descuento/producto, costo en créditos, stock, vigencia) que se inserta con estado `pendiente`; **una función de servidor con verificación de rol `owner` lo aprueba/rechaza** (RLS impide aprobarlo desde cuentas no-owner). Solo lo aprobado aparece en el catálogo de canjes de la Sesión 2.
7. **Vista owner**: bandeja de solicitudes pendientes + gestión de publishers y admins (crear federación/centro, asignar miembros).

## Entregables / criterios de aceptación
- [ ] Un `admin` ve el panel y solo puede operar sobre sus publishers; un `user` no ve nada (RLS probada).
- [ ] El admin publica un post y una historia y aparecen en el feed en otro dispositivo.
- [ ] El admin ordena/destaca eventos y el widget de la semana lo refleja.
- [ ] Sube contenido a una carpeta y queda integrado a un widget.
- [ ] Postula un canjeo → el owner lo aprueba (función de servidor) → aparece en el catálogo; si lo rechaza, no. Un admin no puede aprobarse a sí mismo.
- [ ] Migraciones versionadas, `docs/backend.md` actualizado y `npm test` pasa.

## Dependencias
Sesión 3 (Supabase, créditos/canjes migrados) y Sesión 4 (feed, historias, widget de eventos).

## Prompt para iniciar la sesión

```text
Estoy trabajando en Unities (repo uturn-app), app universitaria en Expo + expo-router + TypeScript con backend Supabase operativo. Esta es la Sesión 5 del roadmap (ROADMAP.md, docs/sesiones/05-perfil-administrador.md). Ya están hechas: Sesión 3 (auth real, RLS, roles user/tutor/admin/owner en profiles, tablas de créditos/canjes migradas) y Sesión 4 (feed sobre Supabase con publishers/posts/stories, widget de eventos y bucket feed-media). Trabaja en una rama nueva sesion/05-admin creada desde main actualizado.

Tareas de esta sesión — panel de administración para federaciones/centros/marcas, con enforcement en el servidor:
1. Entrada "Panel de administración" solo para admin/owner; tabla publisher_members con RLS para que cada admin opere solo en nombre de sus publishers.
2. Composer: crear posts al feed (noticia/evento/activación/descuento con imágenes a feed-media) e historias. Ej: "Qué te espera esta semana en la UAI", "¡Evento Red Bull!".
3. Gestión del widget de eventos: tabla widget_config (ordenar, destacar, fijar) con vista previa; el widget de la Sesión 4 pasa a leer esta configuración.
4. Carpetas de contenido: tablas content_folders/content_items (media en Storage) por publisher, integrables a widgets del feed.
5. Marcas asociadas: tabla brands vinculada a publishers (logo/nombre) para co-firmar promociones.
6. Postulación de canjeos: el admin inserta un canjeable en estado 'pendiente' (costo en créditos, stock, vigencia); una función de servidor que verifica rol owner lo aprueba/rechaza — RLS impide aprobar desde otras cuentas. Solo lo aprobado entra al catálogo de canjes.
7. Vista owner: bandeja de aprobaciones + crear publishers y asignar admins.

Todo con migraciones versionadas en supabase/migrations/ y documentado en docs/backend.md; usa las skills de Supabase instaladas en el repo (.agents/skills/supabase y .agents/skills/supabase-postgres-best-practices) al escribir SQL y políticas. No toques carpooling ni mensajes. Al terminar, verifica el flujo admin publica → owner aprueba → usuario canjea con cuentas distintas y que npm test pasa, haz commit y push de la rama, fusiónala a main y pushea también main; si npm test falla o algo queda a medias, no fusiones: pushea solo la rama y repórtame el problema.
```

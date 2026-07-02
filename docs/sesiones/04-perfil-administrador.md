# Sesión 4 — Perfil Administrador

## Objetivo
Dar a federaciones, centros de alumnos y marcas asociadas (rol `admin`) su panel de gestión: manejar widgets, subir contenido a carpetas integradas en los widgets, promocionar eventos, publicar historias y posts al feed, y **postular canjeos de créditos que requieren autorización del owner**.

## Ya integrado en el repo
- **Nada del panel admin existe (0%)**.
- Reutilizable: roles `admin`/`owner` y `usePermissions` (Sesión 0), modelos `Publisher`/`Post`/`Story` y el widget de eventos (Sesión 3), modelo de canjeables y créditos (Sesión 2), `expo-image-picker` para subir media.

## Mejoras sobre lo existente
- Las restricciones de publicación dejadas como stub en la Sesión 3 (solo `admin`/`owner`/`tutor` publican) se completan aquí con los flujos reales de creación.

## Falta por construir
1. **Acceso al panel**: entrada "Panel de administración" visible solo para `admin`/`owner` (desde el perfil o tab condicional). El admin opera en nombre de su `Publisher` (federación/centro/marca).
2. **Composer de publicaciones**: crear posts al feed (noticia/evento/activación/descuento, con imágenes/carrete) e **historias**. Ejemplos objetivo: "Qué te espera esta semana en la UAI", "Promociones de fin de semana", "¡Evento Alraz!", "Evento Red Bull".
3. **Gestión de widgets**: administrar qué aparece en el widget de eventos de la semana (ordenar, destacar, fijar), con vista previa de cómo lo verá el alumno.
4. **Carpetas de contenido**: carpetas por publisher donde suben media/documentos; el contenido de una carpeta queda integrado/enlazado a un widget del feed.
5. **Marcas asociadas**: vincular marcas a una federación/centro (logo, nombre) para co-firmar promociones y activaciones.
6. **Postulación de canjeos**: el admin propone un canjeable (descuento/producto, costo en créditos, stock, vigencia) que queda `pendiente de aprobación`; el **owner** ve una bandeja de solicitudes y aprueba/rechaza. Solo lo aprobado aparece en el catálogo de canjeos (Sesión 2).
7. **Vista owner**: bandeja de aprobaciones + gestión de publishers y admins (crear federación/centro, asignar admins).

## Entregables / criterios de aceptación
- [ ] Un usuario `admin` ve el panel; un `user` normal no.
- [ ] El admin publica un post y una historia y aparecen en el feed de la Sesión 3.
- [ ] El admin ordena/destaca eventos y el widget de la semana lo refleja.
- [ ] Sube contenido a una carpeta y queda integrado a un widget.
- [ ] Postula un canjeo → el owner lo aprueba → aparece en el catálogo de canjeos del perfil; si lo rechaza, no.
- [ ] `npm test` pasa.

## Dependencias
Sesión 0 (roles), Sesión 2 (créditos/canjeables) y Sesión 3 (feed, historias, widget de eventos).

## Prompt para iniciar la sesión

```text
Estoy trabajando en Uturn (repo uturn-app), app universitaria en Expo + expo-router + TypeScript. Esta es la Sesión 4 del roadmap (ROADMAP.md, docs/sesiones/04-perfil-administrador.md). Ya están hechas: Sesión 0 (roles user/tutor/admin/owner con usePermissions), Sesión 2 (créditos y canjeables) y Sesión 3 (feed con Publisher/Post/Story y widget de eventos de la semana). Trabaja en una rama nueva sesion/04-admin creada desde main actualizado.

Tareas de esta sesión — panel de administración para federaciones/centros de alumnos/marcas:
1. Entrada "Panel de administración" visible solo para admin/owner; el admin opera en nombre de su Publisher.
2. Composer: crear posts al feed (noticia/evento/activación/descuento con imágenes) e historias. Ej: "Qué te espera esta semana en la UAI", "¡Evento Red Bull!".
3. Gestión del widget de eventos de la semana: ordenar, destacar y fijar eventos, con vista previa.
4. Carpetas de contenido por publisher: subir media que queda integrada/enlazada a widgets del feed.
5. Marcas asociadas: vincular marcas (logo/nombre) a una federación para co-firmar promociones.
6. Postulación de canjeos: el admin propone un canjeable (costo en créditos, stock, vigencia) que queda pendiente; el owner tiene una bandeja para aprobar/rechazar. Solo lo aprobado entra al catálogo de canjeos.
7. Vista owner: bandeja de aprobaciones + crear publishers y asignar admins.

No toques carpooling ni mensajes. Al terminar, verifica el flujo admin publica → owner aprueba → usuario canjea y que npm test pasa, haz commit y push de la rama y abre un Pull Request hacia main (no lo fusiones: lo reviso y fusiono yo antes de la siguiente sesión).
```

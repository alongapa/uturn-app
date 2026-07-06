# Sesión 7 — Notificaciones push, centro de notificaciones y deep links

## Objetivo
Que la app avise sola: notificaciones push para plazos de pago, strikes, reservas, mensajes y publicaciones destacadas, con un centro de notificaciones y deep links. Es lo que convierte los plazos de 48 h en algo que el usuario realmente respeta aunque no abra la app.

## Ya integrado en el repo
- Backend Supabase operativo (Sesión 3) con Edge Functions que ya detectan los eventos clave (pago por vencer, strike emitido, reserva creada) — solo falta que además de escribir en la base, envíen push.
- **Realtime ya cubierto en sesiones anteriores**: trips/bookings en vivo (Sesión 3), feed/historias (Sesión 4) y chat instantáneo (Sesión 6). Esta sesión NO reimplementa realtime.
- Pantalla de configuración del perfil (Sesión 2) donde colgar las preferencias de notificación.

## Mejoras sobre lo existente
- Los no-leídos del chat (Sesión 6) pasan a reflejarse también como badge del ícono de la app.
- Los eventos que hoy solo se ven al abrir la app (strike, pago confirmado, reserva nueva) pasan a llegar al teléfono.

## Falta por construir
1. **Infraestructura push**: `expo-notifications` + tabla `push_tokens` (token por dispositivo/usuario) en Supabase; envío desde Edge Functions vía Expo Push API; permisos pedidos en contexto con explicación.
2. **Notificaciones de pagos y turnos**: recordatorio a las 24 h y 4 h antes del vencimiento del pago; aviso de strike y de baneo; confirmación de reserva al conductor; aviso al pasajero cuando el pago queda confirmado; recordatorio del viaje (1 h antes, con punto de encuentro).
3. **Notificaciones sociales y de mensajes**: DM nuevo (si la app no está en primer plano), respuesta a tu pregunta de Q&A, respuesta oficial de tutor/federación, historia o evento destacado de publishers que sigues.
4. **Centro de notificaciones**: tabla `notifications` (historial por usuario) + pantalla con historial y preferencias por categoría (pagos, viajes, social, mensajes) conectada a la configuración de la Sesión 2; las preferencias se respetan en el servidor antes de enviar.
5. **Deep links**: tocar una notificación abre la pantalla correcta (`expo-linking` + expo-router con rutas tipadas); badge de no-leídos en el ícono.

## Entregables / criterios de aceptación
- [x] Un pago por vencer dispara push a las 24 h y 4 h; el strike llega como notificación.
- [x] Un DM con la app cerrada llega como push; abrirla desde la notificación entra al chat correcto.
- [x] Reservas y confirmaciones notifican a la contraparte.
- [x] El centro de notificaciones muestra el historial y las preferencias por categoría silencian lo desactivado (verificado server-side).
- [x] `npm test` pasa.

## Cómo quedó implementado (Sesión 7)

### Backend (Supabase)
- **Migraciones** `supabase/migrations/20260707120000_notifications_schema.sql` y `20260707120001_notifications_functions_rls.sql` (aplicadas al proyecto y añadidas a `apply_all.sql`).
- **Tablas nuevas** (RLS activa, cada quien ve solo lo suyo):
  - `push_tokens` — un ExponentPushToken por dispositivo; `token` único global, se reasigna al usuario activo (login en el mismo teléfono). Alta/baja solo por RPC `register_push_token` / `unregister_push_token`.
  - `notification_prefs` — switch por categoría (`pagos`, `viajes`, `social`, `mensajes`); sin fila = todo activado.
  - `notifications` — historial del centro **y** cola de push (`push_status` pending → processing → sent/skipped/failed). El cliente solo puede tocar `read_at` (trigger `protect_notification_columns`).
- **Encolado central** `enqueue_notification()`: **respeta las preferencias server-side ANTES de insertar** (lo desactivado no llega ni al historial) y deduplica por `dedupe_key`.
- **Triggers de eventos**: mensaje nuevo (→ miembros), respuesta Q&A (→ autor, con respuesta oficial marcada), reserva nueva (→ conductor), pago confirmado (→ pasajero), strike, baneo, historia nueva y evento destacado del widget.
- **Recordatorios con horario** (`enqueue_payment_reminders`, `enqueue_trip_reminders`): pago a 24 h y 4 h del vencimiento, viaje 1 h antes con punto de encuentro — idempotentes por `dedupe_key`.
- **pg_cron**: `notifications-reminders` cada 5 min (encola recordatorios) y `notifications-send-push` cada minuto (invoca la Edge Function vía `pg_net`).
- **Edge Function `send-push`** (desplegada, `--no-verify-jwt`): reclama la cola con `claim_pending_push` (atómico, `FOR UPDATE SKIP LOCKED`), envía por lotes de 100 a la Expo Push API, marca sent/skipped/failed y purga tokens `DeviceNotRegistered`.

### Cliente (Expo)
- `services/push.ts` — capa nativa: permisos, ExponentPushToken (requiere `extra.eas.projectId`), canal Android, handler de primer plano (suprime el banner de `mensajes` porque el chat ya es realtime) y badge del ícono.
- `services/api/notifications.ts` — historial, marcar leído, no-leídos (centro + chat), preferencias y registro de token.
- `contexts/NotificationsContext.tsx` — orquesta registro silencioso, permiso **en contexto** (`maybeAskPushPermission`, se ofrece tras reservar), no-leídos en vivo → badge, preferencias y **deep links** (tap en foreground/background/cold-start → `router.push(url)`).
- `screens/NotificationsScreen.tsx` (`/notifications`) — historial realtime + preferencias por categoría; campanita con badge en el feed y acceso desde Configuración.

### Prueba en dispositivo real (pendiente de tu parte)
Los push remotos **no funcionan en Expo Go (SDK 53+) ni en el simulador de iOS**: requieren un *development build*. El flujo servidor está verificado end-to-end (encolar → dedupe → claim → Edge Function responde 200). Para la prueba en teléfono real:
1. `eas init` (si aún no hay `extra.eas.projectId` en `app.json`) — sin él, `getExpoPushTokenAsync` no obtiene token.
2. `npx expo run:android` / `run:ios` en un dispositivo físico (o build EAS).
3. Inicia sesión, acepta el permiso (banner del centro de notificaciones o tras reservar), reserva un cupo con otra cuenta y confirma que llega el push y que al tocarlo abre la pantalla correcta.

## Dependencias
Sesiones 3–6 (backend, feed, mensajes). Los push de cada categoría requieren su módulo existente.

## Prompt para iniciar la sesión

```text
Estoy trabajando en Unities (repo uturn-app), app universitaria en Expo + expo-router + TypeScript con backend Supabase (Sesiones 3-6 hechas: auth real, RLS, Edge Functions de pagos 48h/strikes, feed y chat realtime). Esta es la Sesión 7 (ROADMAP.md, docs/sesiones/07-notificaciones-realtime.md). Trabaja en una rama nueva sesion/07-notificaciones creada desde main actualizado.

Nota: el realtime en app (chat, feed, reservas en vivo) ya existe de sesiones anteriores — esta sesión es push, centro de notificaciones y deep links.

Tareas de esta sesión:
1. Push con expo-notifications: tabla push_tokens por dispositivo/usuario, envío desde Edge Functions vía Expo Push API, permisos pedidos en contexto.
2. Pagos/turnos: recordatorios a 24h y 4h del vencimiento del pago, aviso de strike/baneo, confirmación de reserva al conductor, pago confirmado al pasajero, recordatorio de viaje 1h antes con punto de encuentro.
3. Social/mensajes: DM nuevo con la app en segundo plano, respuesta en Q&A, respuesta oficial, historias/eventos destacados.
4. Centro de notificaciones: tabla notifications (historial) + pantalla con preferencias por categoría (pagos, viajes, social, mensajes) conectadas a la configuración existente y respetadas en el servidor antes de enviar.
5. Deep links: cada notificación abre su pantalla vía expo-linking/expo-router; badge de no-leídos en el ícono.

Al terminar, prueba el flujo push completo en un dispositivo real (los push no funcionan en simulador iOS), verifica que npm test pasa, haz commit y push de la rama, fusiónala a main y pushea también main; si npm test falla o algo queda a medias, no fusiones: pushea solo la rama y repórtame el problema.
```

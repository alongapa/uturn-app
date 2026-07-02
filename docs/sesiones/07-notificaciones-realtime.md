# Sesión 7 — Notificaciones push y tiempo real

## Objetivo
Que la app avise sola: notificaciones push para plazos de pago, strikes, reservas, mensajes y publicaciones destacadas, y chat/feed en **tiempo real**. Es lo que convierte los plazos de 48 h y la mensajería en algo que el usuario realmente respeta y usa.

## Ya integrado en el repo
- Backend Supabase operativo (Sesión 6) con Edge Functions que ya detectan los eventos clave (pago por vencer, strike emitido, historia nueva).
- Chat funcional pero por polling/recarga (Sesión 5), feed funcional (Sesión 3).
- Flujo de pagos con vencimiento a 48 h y baneos (Sesión 1) — hoy el usuario solo se entera al abrir la app.

## Mejoras sobre lo existente
- El chat pasa de lectura al abrir a suscripción realtime (Supabase Realtime sobre `messages`).
- Contadores de no-leídos en el tab Mensajes y badge en el ícono de la app.
- El widget de eventos y las historias se actualizan en vivo cuando un admin publica.

## Falta por construir
1. **Infraestructura push**: `expo-notifications` + registro de tokens por dispositivo en Supabase; envío desde Edge Functions vía Expo Push API; permisos pedidos en el onboarding con explicación.
2. **Notificaciones de pagos y turnos**: recordatorio a las 24 h y 4 h antes del vencimiento del pago; aviso de strike y de baneo; confirmación de reserva al conductor; aviso al pasajero cuando el conductor confirma el pago recibido; recordatorio del viaje (1 h antes, con punto de encuentro).
3. **Notificaciones sociales y de mensajes**: DM nuevo, respuesta a tu pregunta de Q&A, respuesta oficial de tutor/federación, historia o evento destacado de publishers que sigues.
4. **Realtime**: suscripciones a `messages` (chat instantáneo), `posts`/`stories` (feed vivo) y estado de reservas (el conductor ve entrar pasajeros en `ManagePassengersScreen` sin recargar).
5. **Centro de notificaciones**: pantalla con historial de notificaciones y preferencias por categoría (pagos, viajes, social, mensajes) conectada a la configuración de la Sesión 2.
6. **Deep links**: tocar una notificación abre la pantalla correcta (`expo-linking` + expo-router ya soportan rutas tipadas).

## Entregables / criterios de aceptación
- [ ] Un pago por vencer dispara push a las 24 h y 4 h; el strike llega como notificación.
- [ ] Un DM llega como push y el chat se actualiza en vivo sin recargar.
- [ ] Reservas y confirmaciones notifican a la contraparte al instante.
- [ ] Tocar cualquier notificación abre la pantalla correspondiente.
- [ ] Las preferencias por categoría silencian lo que el usuario desactive.
- [ ] `npm test` pasa.

## Dependencias
Sesión 6 (backend y Edge Functions). Mejora las Sesiones 1, 3 y 5.

## Prompt para iniciar la sesión

```text
Estoy trabajando en Uturn (repo uturn-app), app universitaria en Expo + expo-router + TypeScript con backend Supabase (Sesión 6 hecha: auth real, RLS, Edge Functions que expiran pagos a 48h y emiten strikes). Esta es la Sesión 7 (ROADMAP.md, docs/sesiones/07-notificaciones-realtime.md). Trabaja en una rama nueva sesion/07-notificaciones creada desde main actualizado.

Tareas de esta sesión:
1. Push con expo-notifications: registro de tokens por dispositivo en Supabase, envío desde Edge Functions vía Expo Push API, permisos con explicación.
2. Notificaciones de pagos/turnos: recordatorios a 24h y 4h del vencimiento del pago, aviso de strike/baneo, confirmación de reserva, pago confirmado, recordatorio de viaje 1h antes con punto de encuentro.
3. Notificaciones sociales: DM nuevo, respuesta en Q&A, respuesta oficial de tutor/federación, historias/eventos destacados.
4. Realtime con Supabase Realtime: chat instantáneo (messages), feed/historias en vivo, y ManagePassengersScreen actualizándose cuando entran reservas.
5. Centro de notificaciones: historial + preferencias por categoría (conectar con la pantalla de configuración existente).
6. Deep links: cada notificación abre su pantalla vía expo-linking/expo-router.

Al terminar, prueba el flujo push completo en un dispositivo real (los push no funcionan en simulador iOS), verifica que npm test pasa, haz commit y push de la rama y abre un Pull Request hacia main (no lo fusiones: lo reviso y fusiono yo antes de la siguiente sesión).
```

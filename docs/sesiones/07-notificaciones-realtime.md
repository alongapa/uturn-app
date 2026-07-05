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
- [ ] Un pago por vencer dispara push a las 24 h y 4 h; el strike llega como notificación.
- [ ] Un DM con la app cerrada llega como push; abrirla desde la notificación entra al chat correcto.
- [ ] Reservas y confirmaciones notifican a la contraparte.
- [ ] El centro de notificaciones muestra el historial y las preferencias por categoría silencian lo desactivado (verificado server-side).
- [ ] `npm test` pasa.

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

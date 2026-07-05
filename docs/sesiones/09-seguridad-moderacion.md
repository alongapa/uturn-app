# Sesión 9 — Seguridad, confianza y moderación

## Objetivo
Hacer de Unities un lugar seguro para subirse al auto de un desconocido y para publicar en comunidad: seguridad en viaje (compartir viaje en vivo, SOS), reportes y bloqueos de usuarios, moderación de contenido en feed/chat/Q&A, y endurecer la verificación de identidad.

## Ya integrado en el repo
- Verificación de credencial universitaria por captura de intranet (`screens/CredentialVerificationScreen.tsx`) — manual y burlable, pero es la base.
- Reputación con rachas, calificaciones y strikes (Sesión 1): señales de confianza ya calculadas.
- Ubicación en vivo y mapas (`services/location.ts`, pantallas de mapa) reutilizables para el viaje en vivo.
- Roles de moderación (`admin`/`owner`) y soporte con categorías (Sesión 6).

## Mejoras sobre lo existente
- La verificación de credencial es una captura estática: agregar revisión en bandeja (admin aprueba/rechaza) y re-verificación por semestre.
- La calificación post-viaje (`RateScreen`) se amplía con motivos/etiquetas (conducción, puntualidad, trato) que alimentan mejor el matching.
- El perfil público muestra señales de confianza: credencial verificada, viajes completados, antigüedad, insignias.

## Falta por construir
1. **Seguridad en viaje**: compartir viaje en vivo con un contacto (link con posición y datos del conductor/patente), botón SOS visible durante el viaje (llama/avisa a contacto de emergencia con ubicación), y detalles del auto/conductor siempre visibles antes de subir.
2. **Reportes y bloqueos**: reportar usuario (con motivo y evidencia) desde perfil, viaje, chat o post; bloquear usuario (no ve tus viajes, no puede escribirte); bandeja de reportes para admin/owner con acciones (advertencia, suspensión temporal, baneo definitivo) y registro de auditoría.
3. **Moderación de contenido**: reportar posts/historias/respuestas; cola de moderación; reglas de comunidad publicadas en la app; filtro básico de palabras + rate-limiting de publicaciones para spam.
4. **Endurecer identidad**: revisión de credenciales en bandeja, badge de verificación con vencimiento semestral, y (opcional) verificación reforzada para conductores — cédula + licencia de conducir antes de poder publicar viajes.
5. **Privacidad y datos**: visibilidad del perfil configurable, exportación/eliminación de cuenta y datos (base para cumplimiento de la ley de protección de datos), retención limitada de ubicaciones.
6. **Anti-abuso de créditos/canjeos**: límites de canje por usuario, detección de cuentas duplicadas por dispositivo/email.

## Entregables / criterios de aceptación
- [ ] Un pasajero puede compartir su viaje en vivo y activar SOS durante el viaje.
- [ ] Reportar y bloquear funciona desde perfil, chat, viaje y post; el bloqueado no puede interactuar.
- [ ] La bandeja de moderación permite advertir/suspender/banear con registro de auditoría.
- [ ] Un conductor sin verificación reforzada no puede publicar viajes (si se activa la opción).
- [ ] El usuario puede eliminar su cuenta y sus datos.
- [ ] `npm test` pasa.

## Dependencias
Sesiones 0–6 (roles, viajes, feed, chat, backend). Se potencia con la 7 (push de alertas SOS/moderación).

## Prompt para iniciar la sesión

```text
Estoy trabajando en Unities (repo uturn-app), app universitaria en Expo + expo-router + TypeScript con backend Supabase. Esta es la Sesión 9 (ROADMAP.md, docs/sesiones/09-seguridad-moderacion.md). Ya existen: carpooling completo con reputación/strikes, feed, mensajes con soporte, panel admin/owner, backend con RLS y push. Trabaja en una rama nueva sesion/09-seguridad creada desde main actualizado.

Tareas de esta sesión:
1. Seguridad en viaje: compartir viaje en vivo con un contacto (link con posición, conductor y patente, reusando services/location.ts y las pantallas de mapa), botón SOS durante el viaje con ubicación al contacto de emergencia.
2. Reportes y bloqueos: reportar usuario con motivo/evidencia desde perfil/viaje/chat/post; bloqueo mutuo de interacciones; bandeja para admin/owner con acciones (advertencia, suspensión, baneo) y auditoría.
3. Moderación de contenido: reportes de posts/historias/respuestas, cola de moderación, reglas de comunidad en la app, filtro de palabras y rate-limiting de publicaciones.
4. Identidad: bandeja de revisión de credenciales (hoy la verificación es automática por captura), badge con vencimiento semestral, verificación reforzada opcional para conductores (cédula + licencia).
5. Privacidad: visibilidad de perfil configurable, exportar/eliminar cuenta y datos, retención limitada de ubicaciones.
6. Anti-abuso: límites de canjes, detección básica de cuentas duplicadas.

Al terminar, verifica los flujos de reporte→moderación→sanción y SOS y que npm test pasa, haz commit y push de la rama, fusiónala a main y pushea también main; si npm test falla o algo queda a medias, no fusiones: pushea solo la rama y repórtame el problema.
```

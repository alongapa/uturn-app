# Sesión 2 — Perfil Uturn: créditos, canjeos y gestión de cuenta

## Objetivo
Convertir el perfil en el centro personal de Uturn: acceso a los **créditos Uturn**, **sistema de canjeos**, vista previa de eventos/activaciones/canjeables de la semana, gestión de cuenta completa (foto, configuración) y viajes recientes / por pagar / pagados.

## Ya integrado en el repo
- **Edición de cuenta**: `screens/ProfileScreen.tsx` (tab Perfil) — nombre, email, universidad, campus, fecha de nacimiento, auto principal (modelo/año/patente/capacidad), avatar con iniciales que muestra `urlFotoPerfil` si existe.
- **Verificación de credencial**: `screens/CredentialVerificationScreen.tsx` (`app/verify-profile.tsx`) — sube captura de la intranet con `expo-image-picker` y valida contra la universidad derivada del email. Es la pieza más completa del perfil.
- **Historial de viajes**: `screens/MyTripsScreen.tsx` — próximos/pasados con badges de estado y cancelación.
- **Premios**: `screens/RewardsScreen.tsx` — niveles, puntos e insignias (conectados a datos reales en la Sesión 1).

## Mejoras sobre lo existente
- El avatar muestra foto pero **no hay flujo de subida**: agregar cambio de foto de perfil con `expo-image-picker` (ya instalado, mismo patrón que la verificación de credencial).
- `MyTripsScreen` no distingue estados de pago: agregar filtros/secciones **por pagar / pagados** usando los estados de pago creados en la Sesión 1.
- La píldora "Credencial verificada" está hardcodeada: ligarla al estado real de la verificación.

## Falta por construir
1. **Créditos Uturn**: saldo del usuario en su perfil, historial de movimientos (ganados por rachas/viajes de la Sesión 1, gastados en canjeos), modelo `CreditTransaction`.
2. **Sistema de canjeos**: catálogo de canjeables (descuentos, productos de marcas asociadas, beneficios) con costo en créditos; flujo canjear → código/QR de canje → estado (disponible/canjeado/expirado). Los canjeables los publican los admins (Sesión 5); aquí se define el modelo y la vista de usuario con datos mock.
3. **Vista previa semanal**: sección en el perfil con los eventos, activaciones y canjeables de la semana (widget compacto; la fuente real de datos llega con el feed de la Sesión 4 — usar mock tipado mientras).
4. **Pantalla de configuración**: notificaciones, privacidad, datos bancarios del conductor (usados por la Sesión 1), cerrar sesión, eliminar cuenta.
5. **Viajes recientes / por pagar / pagados**: resumen en el perfil con acceso directo al pago pendiente (cuenta regresiva de las 48 h visible).

## Entregables / criterios de aceptación
- [ ] El perfil muestra saldo de créditos y su historial de movimientos.
- [ ] Se puede canjear un canjeable con créditos y ver su código/estado.
- [ ] Vista previa de la semana visible en el perfil (eventos/activaciones/canjeables).
- [ ] Cambio de foto de perfil funcionando y persistente.
- [ ] Secciones por pagar / pagados en Mis viajes, con acceso al pago pendiente.
- [ ] Pantalla de configuración accesible desde el perfil.
- [ ] `npm test` pasa.

## Dependencias
Sesión 0 (persistencia, roles) y Sesión 1 (estados de pago, puntos por rachas que generan créditos).

## Prompt para iniciar la sesión

```text
Estoy trabajando en Uturn (repo uturn-app), app universitaria en Expo + expo-router + TypeScript. Esta es la Sesión 2 del roadmap (ROADMAP.md, docs/sesiones/02-perfil-uturn.md). Las Sesiones 0 (fundaciones) y 1 (pagos con plazo 48h, strikes, reputación con rachas) ya están hechas. Trabaja en una rama nueva sesion/02-perfil creada desde main actualizado.

Contexto: el perfil actual (screens/ProfileScreen.tsx) edita cuenta y auto; hay verificación de credencial (screens/CredentialVerificationScreen.tsx) y premios (screens/RewardsScreen.tsx). MyTripsScreen muestra viajes pero sin estados de pago. No existen créditos ni canjeos.

Tareas de esta sesión:
1. Créditos Uturn: saldo + historial de movimientos (modelo CreditTransaction); se ganan con las rachas/viajes de la Sesión 1 y se gastan en canjeos.
2. Sistema de canjeos: catálogo de canjeables con costo en créditos, flujo canjear → código/QR → estado (disponible/canjeado/expirado). Datos mock tipados (los publicarán los admins en la Sesión 5).
3. Vista previa semanal en el perfil: eventos/activaciones/canjeables de la semana (mock tipado; la fuente real llega con el feed).
4. Subida de foto de perfil con expo-image-picker (ya instalado) y píldora "Credencial verificada" ligada al estado real.
5. Viajes recientes / por pagar / pagados: secciones en MyTripsScreen y resumen en el perfil con acceso al pago pendiente.
6. Pantalla de configuración: notificaciones, privacidad, datos bancarios del conductor, cerrar sesión.

No toques feed, mensajes ni panel admin. Al terminar, verifica que npm test pasa, haz commit y push de la rama, fusiónala a main y pushea también main; si npm test falla o algo queda a medias, no fusiones: pushea solo la rama y repórtame el problema.
```

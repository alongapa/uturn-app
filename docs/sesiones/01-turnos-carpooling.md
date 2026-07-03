# Sesión 1 — Turnos / Carpooling: pagos, strikes y reputación

## Objetivo
Cerrar el módulo estrella de Uturn: al reservar un cupo se entregan los datos bancarios del conductor con **plazo de 48 horas** para pagar; el impago genera **strikes** (3 strikes → baneo de 2 días de los turnos); las comisiones quedan calculadas; y la reputación (viajes completos, calificación del pasajero, puntualidad, cumplimiento de pagos) funciona **a modo de rachas** con datos reales.

## Ya integrado en el repo
- **Flujo completo de viajes**: crear viaje (`screens/CreateTripScreen.tsx`), buscar (`screens/SearchTripsScreen.tsx`, `screens/PassengerSearchResultsScreen.tsx`), reservar (`screens/BookingScreen.tsx`), detalle (`screens/TripDetailScreen.tsx`), gestionar pasajeros (`screens/ManagePassengersScreen.tsx`), mis viajes (`screens/MyTripsScreen.tsx`).
- **Motor de matching** (lo más sofisticado del repo): `services/matching.ts` puntúa viajes por cercanía de ruta, punto de encuentro, reputación, precio y horario, apoyado en `services/geo.ts` (haversine, distancia a polilínea), `services/location.ts`, `constants/meetingPoints.ts` y `constants/campuses.ts` (coordenadas reales UAI/UDD/UAndes).
- **Mapas**: pantallas de rutas y puntos de encuentro para conductor y pasajero (`screens/*RoutesMapScreen.tsx`, `screens/MeetingPointMapScreen.tsx`, `screens/PassengerTripMapScreen.tsx`) con variantes `.web.tsx`.
- **Calificación post-viaje**: `screens/RateScreen.tsx` (estrellas).
- **Bloqueos por cancelación tardía**: reglas en `services/penalties.ts` (unificadas en la Sesión 0).
- **Sistema de premios visual**: `screens/RewardsScreen.tsx` + `buildRewardSummary`/`addRewardPoints` en `store/appState.tsx` (niveles, puntos, insignias, estadísticas de viajes/puntualidad/cancelaciones) — hoy alimentado por valores mock.

## Mejoras sobre lo existente
- `screens/PaymentScreen.tsx` hoy solo muestra precio y confirma la reserva con un alert ("¡Buen viaje!"): convertirlo en el flujo real de pago por transferencia.
- Conectar `RewardsScreen`/`addRewardPoints` a eventos reales (completar viaje, calificación recibida, pago a tiempo) en vez de los 1850 puntos iniciales mock.
- Extender el modelo `Booking` en `store/appState.tsx` con estado de pago y vencimiento.

## Falta por construir
1. **Flujo de pago con plazo**: al confirmar la reserva se muestran los datos bancarios del conductor (nuevo campo en el perfil del conductor) y se crea un pago `pendiente` con vencimiento a **48 h**. El pasajero marca "pago realizado" (comprobante opcional con `expo-image-picker`) y el conductor confirma la recepción.
2. **Strikes y baneos por impago**: si vence el plazo sin pago → 1 strike; al acumular **3 strikes → baneo de 2 días** de los turnos (no puede reservar). Extender `services/penalties.ts` con este segundo tipo de penalización (impago), independiente de las cancelaciones tardías. Mostrar strikes activos y tiempo de baneo restante en Mis viajes / Perfil.
3. **Comisiones**: constante de comisión Uturn por cupo, desglose visible en `PaymentScreen` (precio + comisión = total) y registro por viaje para reportes futuros.
4. **Reputación con rachas**: métricas reales por usuario — viajes completados, calificación promedio como pasajero, puntualidad, pagos dentro de plazo — y rachas (p. ej. "5 pagos puntuales seguidos", "10 viajes sin cancelar") que otorgan puntos/insignias vía `addRewardPoints`. La reputación alimenta el matching (`services/matching.ts` ya la considera).
5. **Turnos recurrentes** (si el tiempo alcanza): publicar un viaje que se repite por días de la semana (ida mañana / vuelta tarde).

## Entregables / criterios de aceptación
- [ ] Reservar un cupo muestra datos bancarios + cuenta regresiva de 48 h y crea un pago `pendiente`.
- [ ] Un pago vencido genera strike; 3 strikes bloquean reservas por 2 días con mensaje claro al usuario.
- [ ] El desglose precio/comisión/total se ve antes de confirmar.
- [ ] Completar viaje, recibir calificación y pagar a tiempo suman puntos y actualizan rachas visibles en `RewardsScreen`.
- [ ] `npm test` pasa.

## Dependencias
Sesión 0 (penalizaciones unificadas, persistencia, roles).

## Prompt para iniciar la sesión

```text
Estoy trabajando en Uturn (repo uturn-app), app universitaria en Expo + expo-router + TypeScript. Esta es la Sesión 1 del roadmap (ROADMAP.md, docs/sesiones/01-turnos-carpooling.md). La Sesión 0 (limpieza, roles, persistencia, penalizaciones unificadas en services/penalties.ts) ya está hecha. Trabaja en una rama nueva sesion/01-turnos creada desde main actualizado.

Contexto: el carpooling ya funciona (crear/buscar/reservar viajes, matching en services/matching.ts, mapas, calificación en RateScreen, premios visuales en RewardsScreen con addRewardPoints en store/appState.tsx), pero PaymentScreen.tsx es un stub que solo confirma la reserva.

Tareas de esta sesión:
1. Flujo de pago real: al reservar un cupo se muestran los datos bancarios del conductor (nuevo campo en su perfil) y se crea un pago 'pendiente' con plazo de 48 horas (extender el modelo Booking con estado de pago y vencimiento). El pasajero marca pago realizado y el conductor confirma recepción.
2. Strikes por impago: plazo vencido sin pagar = 1 strike; 3 strikes = baneo de 2 días de los turnos (no puede reservar). Extenderlo en services/penalties.ts como penalización independiente de las cancelaciones tardías. Mostrar strikes y baneo restante al usuario.
3. Comisiones: constante de comisión Uturn por cupo, desglose precio + comisión = total en PaymentScreen.
4. Reputación con rachas: conectar RewardsScreen a datos reales (viajes completados, calificación como pasajero, puntualidad, pagos a tiempo) con rachas que dan puntos/insignias vía addRewardPoints.

No toques feed, mensajes ni panel admin. Al terminar, verifica el flujo completo reserva→pago→strike y que npm test pasa, haz commit y push de la rama, fusiónala a main y pushea también main; si npm test falla o algo queda a medias, no fusiones: pushea solo la rama y repórtame el problema.
```

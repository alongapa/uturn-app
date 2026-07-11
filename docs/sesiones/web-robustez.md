# Sesión Web / robustez (opcional)

## Objetivo
Hacer la app usable en el target web y más robusta: reemplazar los `Alert` con botones que no funcionan en RN-web por modales cross-platform, y agregar variantes `.web` (o fallback) de las pantallas de mapas.

## Ya integrado en el repo
- App completa (Sesiones 0–8). Con la verificación automática de la Sesión 8, el conductor ya no confirma el pago, así que ese `Alert` dejó de ser crítico — pero pueden quedar otros (disputas, canjes).
- Las pantallas de mapas usan `react-native-maps`, sin variante `.web` → rompen en web (bug preexistente).

## Falta por construir
1. Reemplazar los `Alert` con botones de acción en flujos web (disputas, canjes, etc.) por modales cross-platform.
2. Variantes `.web` (o un fallback) de las pantallas de mapas para que el target web no rompa.

## Entregables / criterios de aceptación
- [ ] Los flujos con confirmación funcionan en web (modales, no `Alert` con botones).
- [ ] `expo start --web` no rompe en las pantallas de mapas.
- [ ] `npm test` pasa.

## Dependencias
Ninguna crítica. Es pulido; opcional según si quieres versión web.

## Prompt para iniciar la sesión

```text
Trabajo en Unities (Uturn), RN/Expo + Supabase. Esta sesión es Web/robustez (opcional). Rama nueva sesion/web-robustez desde main actualizado.
1. Reemplaza los Alert con botones que no funcionan en RN-web (disputas, canjes, etc.) por modales cross-platform.
2. Agrega variantes .web (o fallback) de las pantallas de mapas para que el target web no rompa.
No cambies backend ni RLS. Corre npm test y prueba en web (expo start --web). Al terminar: commit y push; fusiona a main y pushea; si falla, no fusiones y repórtame. Dame las decisiones tomadas.
```

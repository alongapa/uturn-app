# Sesión Ubicaciones (cierre)

## Objetivo
Cerrar el sistema de ubicaciones inteligentes: verificar/terminar el **autocompletar** y el **"elegir punto en el mapa"** (pasos 2 y 3 del plan de ubicaciones, que quedaron planeados).

## Ya integrado en el repo
- `constants/places.ts` + resolver difuso (apodos, typos, offline).
- `services/geo.ts` (distancias, rutas), `services/location.ts` (GPS), pantallas de mapa (rutas/puntos de encuentro) — Sesiones 1–4.

## Falta por construir
1. **Autocompletar** al escribir origen/destino/punto de encuentro: sugerencias del resolver difuso mientras el usuario tipea.
2. **"Elegir punto en el mapa"**: seleccionar una coordenada sobre el mapa y resolverla a un lugar conocido cuando aplique.
3. Verificar que ambos flujos quedaron efectivamente conectados en las pantallas de crear/buscar viaje.

## Entregables / criterios de aceptación
- [ ] Autocompletar funciona al escribir (sugerencias del resolver).
- [ ] Se puede elegir un punto tocando el mapa y queda resuelto.
- [ ] `npm test` pasa.

## Dependencias
Sesiones 1–4 (matching, geo, mapas). Independiente del resto.

## Prompt para iniciar la sesión

```text
Trabajo en Unities (Uturn), RN/Expo + Supabase. Esta sesión es Ubicaciones (cierre). Rama nueva sesion/ubicaciones desde main actualizado.
Ya existe constants/places.ts + resolver difuso. Verifica/termina los pasos 2 y 3 del plan de ubicaciones:
1. Autocompletar al escribir origen/destino/punto de encuentro (sugerencias del resolver difuso).
2. "Elegir punto en el mapa" (seleccionar coordenada y resolverla a un lugar conocido cuando aplique).
Reutiliza services/geo.ts, services/location.ts y las pantallas de mapa. No toques matching ni pagos. Corre npm test. Al terminar: commit y push; fusiona a main y pushea; si falla, no fusiones y repórtame. Dame las decisiones tomadas.
```

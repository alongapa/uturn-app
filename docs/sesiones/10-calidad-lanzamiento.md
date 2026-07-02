# Sesión 10 — Calidad, onboarding y lanzamiento a tiendas

## Objetivo
Preparar Uturn para usuarios reales: tests automatizados y CI, onboarding de primer uso, pulido de UX (accesibilidad, dark mode, estados vacíos/carga/error), analítica y monitoreo de crashes, y builds firmadas publicadas en App Store y Play Store con EAS.

## Ya integrado en el repo
- Producto completo (Sesiones 0–9). `npm test` = lint + typecheck (no hay tests unitarios ni E2E).
- Tema claro/oscuro parcial en `constants/theme.ts` y primitivas en `components/`.
- `app.json` con configuración Expo base (New Architecture, typed routes).

## Mejoras sobre lo existente
- Estados de carga/vacío/error consistentes en todas las pantallas (hoy varios flujos asumen datos presentes).
- Revisar dark mode pantalla por pantalla (hay fondos/colores hardcodeados).
- Accesibilidad: labels en botones e íconos, tamaños táctiles mínimos, contraste, soporte de fuente del sistema.
- Rendimiento: listas largas del feed/chat a `FlashList` o virtualización correcta, imágenes con placeholder/caché (`expo-image` ya está).

## Falta por construir
1. **Tests**: unitarios con Jest para la lógica crítica (`services/penalties.ts`, `services/matching.ts`, cálculo de comisiones, rachas y créditos); tests de componentes con React Native Testing Library para los flujos clave; E2E con **Maestro** para los caminos felices (login → reservar → pagar; publicar post; enviar DM; canjear).
2. **CI/CD**: GitHub Actions con lint + typecheck + tests en cada PR; **EAS Build** para builds de desarrollo/preview/producción y **EAS Submit** + **EAS Update** (OTA) para publicar; versionado y changelog.
3. **Onboarding**: pantallas de primer uso (qué es Uturn, cómo funcionan turnos/pagos/strikes — importante que el usuario entienda las 48 h antes de su primera reserva), solicitud de permisos en contexto (ubicación al buscar viaje, push al final del onboarding).
4. **Analítica y monitoreo**: crashes con **Sentry**; eventos de producto (reserva creada, pago a tiempo/tarde, post publicado, canje) hacia PostHog/Amplitude; funnel del onboarding.
5. **Preparación de tiendas**: íconos/splash finales, screenshots, descripciones, política de privacidad y términos (URL pública), clasificación de contenido, cuentas de revisión para Apple/Google.
6. **Feature flags** simples (tabla en Supabase) para apagar módulos en producción si algo falla.

## Entregables / criterios de aceptación
- [ ] CI en verde con unit + component + E2E básicos en cada PR.
- [ ] Onboarding explica turnos/pagos/strikes y pide permisos en contexto.
- [ ] Crashes y eventos clave visibles en Sentry/analítica.
- [ ] Dark mode y accesibilidad revisados en todas las pantallas.
- [ ] Build de producción instalable vía TestFlight/Internal Testing y ficha de tienda completa.
- [ ] OTA updates funcionando con EAS Update.

## Dependencias
Sesiones 0–9 (es la sesión de cierre pre-lanzamiento). Los tests unitarios de lógica pueden adelantarse en cualquier momento.

## Prompt para iniciar la sesión

```text
Estoy trabajando en Uturn (repo uturn-app), app universitaria en Expo + expo-router + TypeScript con backend Supabase, funcionalmente completa (Sesiones 0-9 del ROADMAP.md hechas). Esta es la Sesión 10 (docs/sesiones/10-calidad-lanzamiento.md): calidad y lanzamiento.

Tareas de esta sesión:
1. Tests: Jest para services/penalties.ts, services/matching.ts, comisiones, rachas y créditos; React Native Testing Library para flujos clave; E2E con Maestro (login→reservar→pagar, publicar post, DM, canjear).
2. CI/CD: GitHub Actions (lint+typecheck+tests por PR), EAS Build (dev/preview/prod), EAS Submit y EAS Update para OTA.
3. Onboarding de primer uso que explique turnos, pagos con plazo 48h y strikes antes de la primera reserva; permisos (ubicación/push) pedidos en contexto.
4. Sentry para crashes + analítica de eventos de producto (reserva, pago a tiempo/tarde, post, canje).
5. Pulido: estados de carga/vacío/error consistentes, dark mode pantalla por pantalla, accesibilidad (labels, contraste, tamaños táctiles), FlashList en feed/chat.
6. Preparación de tiendas: íconos/splash finales, screenshots, política de privacidad y términos, y feature flags simples en Supabase.

Al terminar, deja el CI en verde y una build de preview instalable, y haz commit y push.
```

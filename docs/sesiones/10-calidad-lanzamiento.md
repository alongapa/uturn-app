# Sesión 10 — Calidad, onboarding y lanzamiento a tiendas

## Objetivo
Preparar Unities para usuarios reales: tests automatizados y CI, onboarding de primer uso, pulido de UX (accesibilidad, dark mode, estados vacíos/carga/error), analítica y monitoreo de crashes, y builds firmadas publicadas en App Store y Play Store con EAS.

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
3. **Onboarding**: pantallas de primer uso (qué es Unities, cómo funcionan turnos/pagos/strikes — importante que el usuario entienda las 48 h antes de su primera reserva), solicitud de permisos en contexto (ubicación al buscar viaje, push al final del onboarding).
4. **Analítica y monitoreo**: crashes con **Sentry**; eventos de producto (reserva creada, pago a tiempo/tarde, post publicado, canje) hacia PostHog/Amplitude; funnel del onboarding.
5. **Preparación de tiendas**: íconos/splash finales, screenshots, descripciones, política de privacidad y términos (URL pública), clasificación de contenido, cuentas de revisión para Apple/Google.
6. **Feature flags** simples (tabla en Supabase) para apagar módulos en producción si algo falla.

## Entregables / criterios de aceptación
- [x] CI en verde con unit + component en cada PR (`.github/workflows/ci.yml`).
      Los E2E de Maestro están escritos pero **no corren en CI**: necesitan un
      emulador con la build instalada y una cuenta de prueba con OTP fijo.
- [x] Onboarding explica turnos/pagos/strikes y pide permisos en contexto.
      Además de las diapositivas hay una aceptación obligatoria antes de la
      primera reserva (`app/reglas-de-pago.tsx`), que sí explica la
      verificación automática de la Sesión 8 y quién recibe el strike.
- [x] Crashes visibles en Sentry, con filtrado de datos personales.
      Los eventos de producto quedan para la sesión de analítica, a propósito.
- [x] Dark mode y accesibilidad revisados pantalla por pantalla.
- [ ] Build de producción instalable vía TestFlight/Internal Testing y ficha de
      tienda completa. **Parcial**: hay build de preview de Android (APK) y
      eas.json con los tres perfiles; iOS quedó bloqueado en las credenciales
      de Apple (login interactivo con 2FA) y faltan screenshots y textos de la
      ficha.
- [x] OTA updates configurado con EAS Update (canal por perfil,
      `runtimeVersion` por `appVersion`). Falta publicar la primera OTA.

## Lo que quedó pendiente
1. Correr los cuatro flujos de Maestro en verde (falta emulador + cuenta de
   prueba sembrada; ver `.maestro/README.md`).
2. Build de iOS: `eas build --profile preview --platform ios` en modo
   interactivo, con la cuenta de Apple Developer y el UDID del dispositivo.
3. FlashList en `ChatScreen` y `MessagesScreen` (el feed ya migró).
4. Screenshots, descripciones y clasificación de contenido de ambas tiendas.
5. Publicar `docs/legal/*.md` en una URL pública y apuntar la ficha ahí.

## Dependencias
Sesiones 0–9 (es la sesión de cierre pre-lanzamiento). Los tests unitarios de lógica pueden adelantarse en cualquier momento.

## Prompt para iniciar la sesión

```text
Estoy trabajando en Unities (repo uturn-app), app universitaria en Expo + expo-router + TypeScript con backend Supabase, funcionalmente completa (Sesiones 0-9 del ROADMAP.md hechas). Esta es la Sesión 10 (docs/sesiones/10-calidad-lanzamiento.md): calidad y lanzamiento. Trabaja en una rama nueva sesion/10-lanzamiento creada desde main actualizado.

Tareas de esta sesión:
1. Tests: Jest para services/penalties.ts, services/matching.ts, comisiones, rachas y créditos; React Native Testing Library para flujos clave; E2E con Maestro (login→reservar→pagar, publicar post, DM, canjear).
2. CI/CD: GitHub Actions (lint+typecheck+tests por PR), EAS Build (dev/preview/prod), EAS Submit y EAS Update para OTA.
3. Onboarding de primer uso que explique turnos, pagos con plazo 48h y strikes antes de la primera reserva; permisos (ubicación/push) pedidos en contexto.
4. Sentry para crashes + analítica de eventos de producto (reserva, pago a tiempo/tarde, post, canje).
5. Pulido: estados de carga/vacío/error consistentes, dark mode pantalla por pantalla, accesibilidad (labels, contraste, tamaños táctiles), FlashList en feed/chat.
6. Preparación de tiendas: íconos/splash finales, screenshots, política de privacidad y términos, y feature flags simples en Supabase.

Al terminar, deja el CI en verde y una build de preview instalable, haz commit y push de la rama, fusiónala a main y pushea también main; si npm test falla o algo queda a medias, no fusiones: pushea solo la rama y repórtame el problema.
```

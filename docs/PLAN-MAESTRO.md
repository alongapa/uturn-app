# Unities (Uturn) — Plan maestro de finalización

> Documento de coordinación. Compártelo (o el bloque relevante) al inicio de cada sesión nueva de Claude Code.

---

## 1. Estado actual — qué ya está construido

El backend en Supabase está casi completo y los 5 módulos existen. Resumen por sesión:

| Sesión | Módulo | Qué quedó hecho | Estado |
|--------|--------|-----------------|--------|
| 0 | Arquitectura base | Roles (`owner`/`admin_federacion`/`tutor`/`user`), persistencia AsyncStorage, `penaltyState` unificado, pagos 48h, fix de tipos en `matching.ts` | ✅ en main |
| — | Ubicaciones inteligentes | `constants/places.ts` + resolver difuso (apodos, typos, offline). Autocompletar y elegir punto en mapa estaban planeados | ⚠️ verificar si 2 y 3 se terminaron |
| 1 | Perfil / penalizaciones | `paymentPenalty` (strikes por impago) + `datosBancarios`, persistencia de ratings/streaks/totalPoints, `canUserBookOrCancel` | ✅ en main |
| 2 | Perfil créditos | Créditos Unities, canjes, configuración, flujo de pago real (pending→marcado→confirmado/vencido, comisión $300), +25 crédito por pago a tiempo, +50 por racha de 3 | ✅ en main |
| 3 | Migración Supabase | 12 tablas + RPCs + triggers + RLS + buckets + pg_cron + seed. Auth por correo institucional (dominio → `university_id`). Verificado end-to-end con 2 usuarios | ✅ en main |
| 4 | Inicio / Feed | `publishers`, `posts`, `stories` (24h), likes/reposts/replies, `FeedScreen`, historias, widget de eventos, composer por rol. Arregló realtime de trips/bookings | ✅ en main |
| 5 | Perfil administrador | `publisher_members`, canjeables con aprobación del owner, `widget_config`, carpetas de contenido, marcas, panel `app/admin/*` | ✅ en main |
| 6 | Mensajes | `conversations` (DM/soporte), `messages`, `topics`, `questions`/`replies`, `guides`, chat realtime, soporte Unities, Q&A y tutores | ✅ en main |
| 7 | Notificaciones | Push (Expo), centro de notificaciones, deep links, Edge Function `send-push`, recordatorios por pg_cron | ✅ en main |
| 8 | Pagos avanzados | Fintoc (Edge Functions `create-payment-intent` + `fintoc-webhook`, HMAC idempotente), verificación **automática** (sin confirmación del conductor), disputas "yo sí pagué" con evidencia + ticket, `app/earnings.tsx`, pago parcial con créditos, panel financiero owner `app/admin/finance.tsx` | ⚠️ en main, **runtime sin verificar** |

**Conclusión:** no te falta construir casi nada nuevo. Te falta **reordenar, decidir políticas y probar en dispositivos reales.**

---

## 2. Decisiones de producto que debes tomar ANTES de programar

Estas bloquean el trabajo técnico. Decídelas primero.

### 2.1 DM y bullying — ✅ DECIDIDO: Opción C (híbrida)

Regla final: **un alumno solo puede abrir DM si (a) comparte un viaje confirmado con la otra persona** (para coordinar el traslado) **o (b) la otra cuenta es `tutor`/`admin_federacion`/`owner`.** Cero DM libre alumno↔alumno. Esto mata el bullying sin perder la coordinación de viajes.

**Impacto técnico (una sesión corta de Claude Code):**
- Modificar el RPC `start_dm` para que valide server-side una de estas dos condiciones antes de crear la conversación:
  1. Existe un `booking` en estado confirmado que une a ambos `profile_id` en el mismo `trip` (cualquier dirección conductor↔pasajero), **o**
  2. Al menos uno de los dos tiene `account_role` en (`tutor`,`admin_federacion`,`owner`).
- Endurecer la RLS de `conversations`/`messages` con la misma condición (que no se pueda crear por fuera del RPC).
- El "Mensaje al conductor" que ya existe desde el detalle del viaje (Sesión 6) encaja perfecto con la condición (1) — reutilízalo.
- UI del composer "nuevo mensaje": al buscar personas, solo listar cuentas oficiales/tutores + compañeros de viajes confirmados. No exponer el resto del alumnado.

### 2.2 Estructura de tabs (homescreen) — ✅ DECIDIDO

Tabs finales: **Inicio · Mensajes · Turnos · Tutorías · Perfil**

| Tab | Contenido | De dónde sale |
|-----|-----------|---------------|
| **Inicio** | Feed (Twitter/Threads), historias, widgets de eventos, respuestas a publicaciones | `FeedScreen` (Sesión 4) — ya existe |
| **Mensajes** | DM híbrido según decisión 2.1 (compañeros de viaje confirmado + tutores/federaciones) | `Mensajes` (Sesión 6), quitándole Soporte y Q&A |
| **Turnos** | Carpooling, viajes, pagos, reputación | `Mis viajes` (Sesión 1-3) — ya existe |
| **Tutorías** | Q&A por tema, respuestas oficiales de tutores/federaciones, guías | Extraer de "Mensajes" (Sesión 6) |
| **Perfil** | Créditos Unities, canjes, novedades atractivas, viajes, gestión de cuenta y **Soporte Unities** | Perfil (Sesión 2) — ya existe |

Decisiones cerradas:
- **Soporte Unities** (tickets de pagos/baneos/verificación) vive **dentro de Perfil** ("Ayuda / Soporte"). No es tab. El backend de soporte (`start_support`, estados abierto/resuelto de la Sesión 6) no cambia; solo se mueve su punto de entrada.
- **Nada de sub-pestaña de DM dentro de Inicio.** Los mensajes son un tab ("Mensajes") y punto.
- El actual tab "Mensajes" (Sesión 6) mezclaba DM + Soporte + Q&A → se **divide en tres destinos**: DM se queda en el tab Mensajes, Q&A pasa al tab Tutorías, Soporte pasa a Perfil.

---

## 3. Lo que falta construir (sesiones de Claude Code)

Cola ordenada. **Cada sesión tiene su doc con el prompt listo para pegar** en `docs/sesiones/`. Abre un chat nuevo por sesión, pega su prompt, y sigue el flujo de git del ROADMAP (rama propia → npm test → fusiona a main).

| # | Sesión | Doc con prompt |
|---|--------|----------------|
| 1 | **Navegación** — 5 tabs (Inicio·Mensajes·Turnos·Tutorías·Perfil); divide el "Mensajes" actual (DM se queda, Q&A→Tutorías, Soporte→Perfil) | [navegacion-5-tabs.md](sesiones/navegacion-5-tabs.md) |
| 2 | **DM híbrido** — `start_dm` + RLS: DM solo si comparten viaje confirmado **o** la contraparte es tutor/admin/owner; composer restringido | [dm-hibrido.md](sesiones/dm-hibrido.md) |
| 3 | **Analítica de tendencias** — tracking + reportes por universidad, **agregado y anonimizado** (k-anonimato K=20, opt-out, aviso legal). Va después de Navegación. ⚠️ El modelo individual identificado caería bajo la Ley 21.719 — este lo evita por diseño | [analitica-tendencias.md](sesiones/analitica-tendencias.md) |
| 4 | **Perfil "novedades jóvenes"** — gamificación (insignias/niveles), referidos con créditos, preview semanal de canjeables | [perfil-novedades.md](sesiones/perfil-novedades.md) |
| 5 | **Ubicaciones (cierre)** — autocompletar + "elegir punto en el mapa" (pasos 2 y 3) | [ubicaciones-cierre.md](sesiones/ubicaciones-cierre.md) |
| 6 | **Web/robustez (opcional)** — `Alert`→modales en web, variantes `.web` de mapas | [web-robustez.md](sesiones/web-robustez.md) |
| 7 | **Moderación/seguridad (Sesión 9)** — reportes, bloqueo, verificación de conductor, SOS. Pre-producción | [09-seguridad-moderacion.md](sesiones/09-seguridad-moderacion.md) |
| 8 | **Calidad y lanzamiento (Sesión 10)** — tests, CI/CD, EAS, onboarding (48h/strikes), Sentry, pulido, ficha de tiendas + T&C (Fintoc + analítica), arte final del logo | [10-calidad-lanzamiento.md](sesiones/10-calidad-lanzamiento.md) |

Antes de 3 (Analítica): define la política de retención y el texto de consentimiento (tuyo/legal). Antes de 8: revisión legal de pagos/carpooling (§6).

---

## 4. Lo que TÚ tienes que aprender/hacer a mano (paso a paso)

Esto Claude Code no puede hacerlo por ti: requiere tu cuenta, tus correos y tus teléfonos.

### 4.1 Arreglar el envío de magic link / OTP (tu bloqueo actual)

Vienes con el error "Error sending magic link email" usando Gmail SMTP. Checklist:
1. **2FA en la cuenta Gmail:** la verificación en 2 pasos debe estar **activada**; sin ella Google no deja crear App Passwords.
2. **App password:** son 16 caracteres. Google los muestra en 4 bloques con espacios, pero al pegarlos en Supabase van **sin espacios**.
3. **Supabase → Authentication → SMTP Settings:**
   - Enable Custom SMTP: ✅
   - Host: `smtp.gmail.com` · Port: `465`
   - Username: tu correo Gmail **completo**
   - Password: el app password (sin espacios)
   - **Sender email = exactamente el mismo correo** que el Username (si no coinciden, Gmail rechaza).
4. **Authentication → Providers → Email:** confirma que Email esté habilitado y con Magic Link / OTP activo.
5. **Authentication → URL Configuration:** agrega el deep link de la app (`tuscheme://...`) como Redirect URL, para que el enlace del correo vuelva a la app.
6. **Auth Logs con rango de tiempo amplio:** ahí verás el error real de Gmail. Los típicos: "Username and Password not accepted" → app password mal o 2FA off; "rate limit" → superaste el cupo.
7. **Límite:** Gmail SMTP ~500 correos/día y **no es para producción**. Para producción: dominio propio + Resend o AWS SES.

### 4.2 Push notifications en teléfono real (eas init)

Los push **no funcionan** en Expo Go ni en simulador iOS. Necesitas un development build.
1. `npm install -g eas-cli` (o usa `npx eas-cli`)
2. `eas login`
3. `eas init` → esto crea `extra.eas.projectId` en `app.json`. **Sin este paso, `getExpoPushTokenAsync` no obtiene token** (por eso hoy degrada con un warning).
4. `eas build --profile development --platform android` (o `ios`)
5. Instala el build en tu teléfono (no Expo Go).
6. Prueba: reserva un viaje → acepta el permiso → se registra el token → recibes la notificación.

### 4.3 Promover tu cuenta para probar admin/composer/feed

Tu cuenta `alongarcia@alumnos.uai.cl` hoy es `user`, por eso no ves el botón de publicar ni el panel admin. En Supabase → SQL Editor:

```sql
-- Para ver TODO (feed composer + panel + aprobaciones):
update profiles set account_role='owner' where email='alongarcia@alumnos.uai.cl';
-- Si en cambio la haces 'admin', además debes agregarla como miembro de un publisher:
-- insert into publisher_members (publisher_id, profile_id) values ('<id_publisher>', '<tu_profile_id>');
```

### 4.4 Pruebas en dispositivos físicos (lo único que falta verificar de verdad)

Con 2 teléfonos y 2 correos institucionales:
- Login OTP/magic link real (fin del punto 4.1).
- Push llegando a ambos.
- Realtime: un mensaje/like en un teléfono aparece en el otro sin recargar.
- "Visto ✓✓" en vivo.

### 4.5 Verificar en runtime los pagos avanzados (Sesión 8) — pendiente clave

A diferencia de las sesiones 3–7, la Sesión 8 **no** aplicó sus migraciones al proyecto Supabase (solo versionó los archivos) ni pudo correr el ciclo en vivo (el entorno no tenía Docker/Supabase CLI/credenciales Fintoc). El código está mergeado a `main` (`92c47a8`) y `npm test` pasó, pero falta ejercitarlo tú:
1. **Aplicar migraciones y correr el test transaccional** (imprime `OK…` y hace ROLLBACK, no ensucia datos):
   ```bash
   supabase start && supabase db reset          # aplica migrations/
   psql <DB_URL> -f supabase/tests/payments_cycle_test.sql
   ```
2. **Credenciales Fintoc (sandbox) y desplegar las Edge Functions:**
   ```bash
   supabase secrets set FINTOC_SECRET_KEY=... FINTOC_WEBHOOK_SECRET=...
   supabase functions deploy create-payment-intent
   supabase functions deploy fintoc-webhook --no-verify-jwt
   ```
   Sin `FINTOC_SECRET_KEY`, `create-payment-intent` degrada a una intención **simulada** para probar sin credenciales.
3. **Si prefieres no tener las migraciones en `main` hasta correr el ciclo:** se revierte con `git revert -m 1 92c47a8`.

> **Cambio de comportamiento importante:** ahora el pago se verifica solo (intención → webhook Fintoc → `apply_payment_verification` marca `confirmed` y dispara el push). El conductor ya **no** confirma manualmente. Además `expire_overdue_payments` ahora strikea los estados `pending` **y** `marked`: solo un pago verificado protege del strike, y la disputa es la válvula de escape. Verifica este flujo con cuidado en tus pruebas, porque cambia quién recibe strikes.

### 4.6 Pendientes menores conocidos (de las sesiones)

- **`Alert` en RN-web:** con la verificación automática de la Sesión 8 el conductor ya no confirma el pago, así que ese `Alert` deja de ser crítico. Revisa si quedan otros `Alert` con botones en flujos web (p. ej. disputas o canjes) y reemplázalos por modales.
- **Mapas en web:** no hay variante `.web` de las pantallas de mapas; bug preexistente del target web.
- **Rama de asesorías (`feat/sistema-reputacion-asesorias`):** su esquema Supabase fue reemplazado por el canónico. Si la retomas, hay que reconciliar o darle su propio proyecto/branch de Supabase.
- **`metro.config.js` y `shims/`:** sin trackear desde antes; decide si los commiteas.
- **Edge Function `expire-payments`:** no desplegada (pg_cron ya cubre la expiración). Está en el repo como alternativa.

---

## 5. Orden recomendado para cerrar el proyecto

**Bloque A — Desbloquear (tú, esta semana)**
1. Arreglar magic link/OTP (4.1) → sin esto no hay login real.
2. `eas init` + development build (4.2).
3. Promover tu cuenta (4.3) y probar en 2 teléfonos (4.4).
4. Aplicar migraciones de la Sesión 8 + correr el test de pagos + Fintoc sandbox (4.5) → verificar el ciclo de pago automático y strikes antes de construir encima.

**Bloque B — Reordenar (Claude Code)**
4. Decidir política de DM (2.1) y tabs (2.2).
5. Sesión Navegación (5 tabs).
6. Sesión DM restringido.

**Bloque C — Pulir para jóvenes (Claude Code)**
7. Sesión Perfil novedades/gamificación/referidos.
8. Cerrar Ubicaciones (autocompletar + mapa).

**Bloque D — Pre-producción**
9. Sesión Moderación/seguridad (reportes, verificación conductor, SOS).
10. Migrar email a dominio + Resend/SES.
11. Revisión legal/regulatoria de pagos y carpooling.

---

## 6. Antes de producción (no lo dejes para el final)

- **Pagos + carpooling = zona regulada.** Con Fintoc (Sesión 8) ya estás moviendo **plata real** vía transferencia, no solo créditos internos → esto activa de lleno las obligaciones: términos y condiciones de pagos, posible KYC, manejo de disputas/reembolsos y las liquidaciones a conductores (`payouts`). La comisión de $300 sobre viajes puede tocar normativa de transporte según Chile. Conviene una revisión legal antes de salir de sandbox.
- **Seguridad en viajes:** verificación de identidad del conductor, botón de emergencia, registro del viaje. El sistema de reputación no reemplaza esto.
- **Datos de menores/estudiantes:** política de privacidad y consentimiento.
- **Moderación de contenido** en feed e historias (reportar/ocultar).

---

## 7. Plantilla para abrir cada sesión de Claude Code

> "Trabajo en Unities (Uturn), app RN/Expo + Supabase. Modelo de datos y roles en `docs/backend.md`; roles: owner/admin_federacion/tutor/user. Esta sesión es **[nombre del módulo]**. Respeta el esquema existente, no dupliques tablas de usuario, corre `npm test` (lint+typecheck) antes de mergear y verifica RLS impersonando cuentas por SQL. Al final dame la lista de decisiones tomadas."

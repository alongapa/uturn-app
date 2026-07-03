# Sesión 3 — Migración a Supabase: auth, datos y storage

## Objetivo
Llevar a Supabase todo lo construido en las Sesiones 0–2: autenticación real con email institucional, base de datos Postgres para usuarios, viajes, reservas, pagos, strikes, créditos y canjes, storage para imágenes y lógica crítica (plazos de 48 h, strikes, saldos) ejecutándose en el servidor. A partir de esta sesión la app funciona entre usuarios reales y **todos los módulos siguientes (4–10) se construyen directamente sobre Supabase**.

## Ya integrado en el repo
- **El proyecto Supabase ya está creado** (URL y anon key disponibles; van en variables de entorno, nunca commiteadas).
- `docs/backend.md` (Sesión 0) con la decisión por Supabase, el esquema base (profiles, vehicles, trips, bookings, ratings, penalties), bosquejo de RLS y plan de migración de referencia.
- App funcional con estado local: carpooling completo con pagos a 48 h, strikes por impago y reputación con rachas (Sesión 1), y perfil con créditos Uturn, canjes y configuración (Sesión 2). Todo detrás de `store/appState.tsx` + `contexts/UserContext.tsx`, persistido en AsyncStorage.
- Reglas de negocio ya escritas y probadas en TypeScript: `services/penalties.ts` (cancelaciones tardías y strikes), lógica de pagos/vencimientos y de créditos en `store/appState.tsx` — son la especificación de las funciones SQL.
- Roles `user/tutor/admin/owner` con `hooks/use-permissions.ts` (Sesión 0), login con validación de dominios institucionales (`screens/LoginScreen.tsx`) y verificación de credencial (`screens/CredentialVerificationScreen.tsx`).

## Mejoras sobre lo existente
- La auth actual acepta cualquier email con dominio válido sin verificar propiedad: pasar a **OTP/magic link** al correo institucional (confirma que el alumno controla ese email).
- Los plazos de 48 h y strikes hoy se evalúan en el cliente al abrir la app: pasan a **funciones de servidor** programadas — se cumplen aunque el usuario no abra la app y no se pueden burlar.
- Fotos de perfil y capturas de credencial hoy son URIs locales: pasan a Storage con URLs firmadas.
- AsyncStorage deja de ser fuente de verdad y queda como caché offline.

## Falta por construir
1. **Conexión**: instalar `@supabase/supabase-js`; crear `services/supabase.ts` leyendo URL/anon key desde variables de entorno (`app.config.ts` + `.env` en `.gitignore`).
2. **Migraciones versionadas** en `supabase/migrations/`: el esquema base de `docs/backend.md` **más** las tablas de lo construido en las Sesiones 1–2 — `payments` (estado, monto, comisión, vence a 48 h), `strikes`, `credit_transactions` (saldo por agregación), `redeemables` y `redemptions`. Actualizar `docs/backend.md` con las tablas nuevas.
3. **Auth real**: registro/login con OTP o magic link; validación de dominio universitario en hook de registro; trigger que crea el `profile` al registrarse; sesión persistente con refresh; `UserContext` pasa a envolver la sesión de Supabase; roles como columna de `profiles`.
4. **Row Level Security**: políticas según el bosquejo de `docs/backend.md`; además: `payments`/`strikes`/`credit_transactions` solo escribibles por funciones de servidor (el cliente jamás modifica saldos ni strikes); reservar pasa por RPC que valida bloqueo y asientos.
5. **Funciones de servidor**: portar `services/penalties.ts` a SQL (`register_late_cancellation`); Edge Function/pg_cron que expira pagos a las 48 h y emite strikes (3 strikes → baneo 2 días); cálculo de rachas y acreditación de puntos/créditos al completar viaje, recibir calificación o pagar a tiempo.
6. **Storage**: buckets `avatars` y `credentials` (privado, URL firmada); subida con compresión desde los flujos ya existentes de perfil y verificación.
7. **Capa de datos**: sustituir los CRUD de `store/appState.tsx` por servicios por dominio (`services/api/trips.ts`, `payments.ts`, `credits.ts`, …) manteniendo las mismas firmas que consumen las pantallas; realtime básico en `trips`/`bookings` (el conductor ve entrar reservas sin recargar).

## Entregables / criterios de aceptación
- [ ] Dos dispositivos con cuentas distintas ven los mismos viajes y reservas.
- [ ] Login por OTP/magic link con email institucional; reabrir la app conserva la sesión.
- [ ] Un pago no realizado genera strike a las 48 h **sin que nadie abra la app**; 3 strikes bloquean reservas 2 días.
- [ ] RLS verificada: un `user` no puede editar saldos, strikes, ni datos ajenos (probar con anon key desde SQL editor).
- [ ] Créditos y canjes de la Sesión 2 operan contra Postgres.
- [ ] Fotos y credenciales se sirven desde Storage.
- [ ] Migraciones versionadas en el repo y `docs/backend.md` actualizado; `npm test` pasa.

## Dependencias
Sesiones 0–2 (hechas). Las Sesiones 4–10 dependen de esta.

## Prompt para iniciar la sesión

```text
Estoy trabajando en Uturn (repo uturn-app), app universitaria en Expo + expo-router + TypeScript. Esta es la Sesión 3 del roadmap (ROADMAP.md, docs/sesiones/03-migracion-supabase.md). Trabaja en una rama nueva sesion/03-migracion-supabase creada desde main actualizado.

Contexto: las Sesiones 0-2 están hechas con estado local (store/appState.tsx + AsyncStorage): carpooling completo con pagos a 48h/strikes/rachas y perfil con créditos/canjes. Ya tengo el proyecto Supabase creado; te pasaré la URL y la anon key para variables de entorno (no las commitees). docs/backend.md define el esquema base y las convenciones.

Tareas de esta sesión — migrar todo lo construido a Supabase:
1. Instalar @supabase/supabase-js y crear services/supabase.ts con URL/anon key desde variables de entorno (.env en .gitignore).
2. Migraciones versionadas en supabase/migrations/: esquema de docs/backend.md (profiles, vehicles, trips, bookings, ratings, penalties) + tablas de las Sesiones 1-2: payments (con vencimiento 48h y comisión), strikes, credit_transactions, redeemables, redemptions. Actualiza docs/backend.md.
3. Auth real: OTP/magic link con validación de dominio universitario en hook de registro, trigger que crea el profile, sesión persistente; UserContext envuelve la sesión de Supabase; roles user/tutor/admin/owner en profiles.
4. RLS: según el bosquejo de docs/backend.md; payments/strikes/credit_transactions solo escribibles por funciones de servidor; reservar vía RPC que valida bloqueo y asientos.
5. Funciones de servidor: portar services/penalties.ts a SQL; Edge Function/pg_cron que expira pagos a 48h y emite strikes (3 → ban 2 días); rachas y acreditación de puntos/créditos.
6. Storage: buckets avatars y credentials (privado, URLs firmadas) conectados a los flujos existentes.
7. Reemplazar los CRUD de appState por servicios por dominio (services/api/*) manteniendo las firmas que usan las pantallas; realtime en trips/bookings; AsyncStorage queda como caché.

Usa las skills de Supabase instaladas en el repo (.agents/skills/supabase y .agents/skills/supabase-postgres-best-practices) al escribir migraciones, RLS y Edge Functions.

Al terminar, verifica con dos usuarios distintos (incluido el ciclo reserva→pago vencido→strike server-side) y que npm test pasa, haz commit y push de la rama, fusiónala a main y pushea también main; si npm test falla o algo queda a medias, no fusiones: pushea solo la rama y repórtame el problema.
```

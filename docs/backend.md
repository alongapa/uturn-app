# Backend de Uturn

> Sesión 0 — decisión de arquitectura. Sesión 3 — **implementación**.
> Este documento registra la elección de backend, el esquema de tablas y las
> convenciones. Desde la Sesión 3 el esquema está **implementado** como
> migraciones versionadas en [`supabase/migrations/`](../supabase/migrations)
> (ver [`supabase/README.md`](../supabase/README.md) para aplicarlas). La app
> usa Supabase como fuente de verdad cuando hay sesión; AsyncStorage queda como
> caché offline. Las tablas y funciones nuevas de las Sesiones 1–2 se documentan
> más abajo en «Tablas de las Sesiones 1–2».

## Decisión: Supabase

**Recomendación: Supabase** (Postgres gestionado + Auth + Realtime + Storage).

### Por qué Supabase

- **Postgres relacional.** El dominio de Uturn es naturalmente relacional:
  usuarios ↔ vehículos ↔ viajes ↔ reservas ↔ calificaciones. Las invariantes
  (asientos disponibles, una reserva por pasajero por viaje, contadores de
  penalización) se expresan bien con constraints, triggers y funciones SQL.
- **Auth incluida con restricción por dominio.** El registro está limitado a
  correos universitarios (`@alumnos.uai.cl`, `@miuandes.cl`, `@udd.cl`, …).
  Supabase Auth permite validar dominios en un hook de registro sin montar un
  servicio propio.
- **Row Level Security (RLS).** Las reglas de autorización del cliente
  (`usePermissions`, roles `user/tutor/admin/owner`) se replican en el servidor
  con políticas RLS por tabla: la seguridad no depende del cliente.
- **Realtime.** Suscripciones a cambios en `trips` y `bookings` cubren el caso
  "un pasajero reservó / canceló" sin infraestructura extra de websockets.
- **SDK oficial para React Native/Expo** (`@supabase/supabase-js`), compatible
  con AsyncStorage para la sesión (ya incorporado en Sesión 0).
- **Costo.** El tier gratuito cubre de sobra un piloto universitario; escalar a
  Pro es barato comparado con operar un backend propio.

### Alternativas consideradas

| Opción | Por qué no (por ahora) |
| --- | --- |
| **Firebase (Firestore)** | NoSQL complica las invariantes relacionales (asientos, unicidad de reservas) y las consultas de matching por geografía/horario. Reglas de seguridad menos expresivas que RLS + SQL. |
| **Backend propio (Node/NestJS + Postgres)** | Máxima flexibilidad, pero exige operar auth, infra, deploys y websockets. No se justifica con el tamaño actual del equipo. Migrar desde Supabase a Postgres propio es viable más adelante (es Postgres estándar). |

## Esquema tentativo de tablas

Convención: `snake_case`, ids `uuid` (default `gen_random_uuid()`), timestamps
`timestamptz` con `created_at`/`updated_at`. Mapea los tipos actuales de
`models/types.ts` y `store/appState.tsx`.

### `profiles`

Extiende `auth.users` (1:1, mismo id). Fuente: `User` + `UserProfile`.

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` PK | FK → `auth.users.id` |
| `full_name` | `text` | |
| `email` | `text` unique | dominio universitario validado en registro |
| `account_role` | `text` | check: `'user' \| 'tutor' \| 'admin' \| 'owner'`; default `'user'` |
| `travel_mode` | `text` | check: `'driver' \| 'rider'`; preferencia actual, no autorización |
| `university_id` | `text` | ref. catálogo `constants/campuses.ts` (a futuro tabla `universities`) |
| `home_campus_id` | `text` | ídem catálogo de campus |
| `date_of_birth` | `date` | |
| `avatar_url` | `text` | Storage bucket `avatars` |
| `rating_avg` | `numeric(3,2)` | denormalizado desde `ratings` (trigger) |
| `driver_license_number` | `text` | solo si conduce |
| `driver_license_expiration` | `date` | |
| `created_at` / `updated_at` | `timestamptz` | |

### `vehicles`

Fuente: `Car` / `VehicleInfo`.

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `owner_id` | `uuid` | FK → `profiles.id` |
| `brand` / `model` | `text` | |
| `year` | `int` | |
| `color` | `text` | |
| `plate` | `text` | única por dueño |
| `seat_capacity` | `int` | check `> 0` |

### `trips`

Fuente: `Trip` (versión de `store/appState.tsx`, que es la más completa).

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `driver_id` | `uuid` | FK → `profiles.id` |
| `vehicle_id` | `uuid` | FK → `vehicles.id` |
| `origin_campus_id` / `destination_campus_id` | `text` | catálogo de campus |
| `meeting_point_id` | `text` | catálogo de puntos de encuentro |
| `origin_coords` / `destination_coords` | `point` (o PostGIS `geography`) | |
| `meeting_point_coords` | `point` | nullable |
| `route_polyline` | `jsonb` | lista de coordenadas; PostGIS `linestring` a futuro |
| `departs_at` | `timestamptz` | |
| `price_clp` | `int` | check `>= 0` |
| `seats_total` | `int` | |
| `seats_taken` | `int` | mantenido por trigger sobre `bookings` |
| `status` | `text` | check: `'published' \| 'full' \| 'in_progress' \| 'completed' \| 'cancelled'` |
| `route_notes` | `text` | |

### `bookings`

Fuente: `Booking`.

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `trip_id` | `uuid` | FK → `trips.id` |
| `passenger_id` | `uuid` | FK → `profiles.id` |
| `status` | `text` | check: `'pending' \| 'confirmed' \| 'cancelled' \| 'completed'` |
| `cancelled_at` | `timestamptz` | nullable |
| `was_late_cancellation` | `boolean` | default `false`; lo fija la función de cancelación |
| `created_at` | `timestamptz` | |

Constraint: única reserva activa por `(trip_id, passenger_id)` (índice parcial
sobre estados no cancelados).

### `ratings`

Fuente: `Rating`.

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `trip_id` | `uuid` | FK → `trips.id` |
| `from_id` / `to_id` | `uuid` | FK → `profiles.id` |
| `stars` | `int` | check `between 1 and 5` |
| `note` | `text` | |

Constraint: una calificación por `(trip_id, from_id, to_id)`.

### `penalties`

Fuente: `PenaltyState` + `services/penalties.ts`. Se guarda el historial en vez
de solo contadores, para poder auditar y recalcular.

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `user_id` | `uuid` | FK → `profiles.id` |
| `booking_id` | `uuid` | FK → `bookings.id`; cancelación tardía que la originó |
| `occurred_at` | `timestamptz` | |
| `block_until` | `timestamptz` | nullable; se fija al cruzar los umbrales 3/6/9 |

La regla de negocio (3/6/9 cancelaciones tardías en ventana móvil de 30 días →
bloqueo de 1/3/7 días) vive hoy en `services/penalties.ts` y se portará a una
función SQL (`register_late_cancellation`) para que el servidor sea la fuente
de verdad; el cliente solo la refleja.

### Diagrama de relaciones

```
auth.users 1─1 profiles 1─* vehicles
profiles 1─* trips (driver_id)
profiles 1─* bookings (passenger_id)   trips 1─* bookings
profiles 1─* penalties                 bookings 1─0..1 penalties
profiles 1─* ratings (from_id/to_id)   trips 1─* ratings
```

## RLS: bosquejo de políticas

- `profiles`: cada usuario lee/edita el suyo; `account_role` solo lo modifican
  `admin`/`owner` (nunca el propio usuario). Lectura pública limitada a campos
  de perfil visible (nombre, rating, avatar).
- `vehicles`: CRUD solo del dueño.
- `trips`: lectura para autenticados; insert/update/delete solo del conductor;
  cancelar viaje ajeno requiere `admin+`.
- `bookings`: el pasajero ve/crea/cancela las suyas; el conductor ve las de sus
  viajes. Crear reserva pasa por RPC que valida bloqueo por penalización y
  asientos disponibles.
- `penalties`: lectura del propio usuario; escritura solo vía función del
  servidor (nadie inserta directo).

## Tablas de las Sesiones 1–2 (implementadas en Sesión 3)

Estados canónicos en inglés para `trips`/`bookings`/`payments` (como arriba); la
capa `services/api/*` los mapea a los tokens en español de las pantallas. Las
tablas de créditos/canjes conservan los tokens en español de `models/uturn.ts`.

### `payments`

Fuente: `BookingPayment` (`store/appState.tsx`). 1:1 con `bookings`.

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `booking_id` | `uuid` unique | FK → `bookings.id` |
| `status` | `text` | check: `'pending' \| 'marked' \| 'confirmed' \| 'overdue'` |
| `price_clp` / `commission_clp` / `total_clp` | `int` | comisión fija Uturn (300 CLP) |
| `due_at` | `timestamptz` | plazo de 48 h para pagar |
| `marked_at` / `confirmed_at` | `timestamptz` | pasajero marcó / conductor confirmó |

### `strikes`

Fuente: strikes por impago (`services/penalties.ts`). Historial; el contador
vigente vive denormalizado en `profiles.payment_strikes_count`.

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `user_id` | `uuid` | FK → `profiles.id` |
| `booking_id` | `uuid` | FK → `bookings.id`; pago vencido que lo originó |
| `kind` | `text` | `'payment'` |
| `occurred_at` | `timestamptz` | |

### `credit_transactions`

Fuente: `CreditTransaction` (`models/uturn.ts`). Saldo = `sum(abono) - sum(cargo)`
(función `credit_balance`).

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `user_id` | `uuid` | FK → `profiles.id` |
| `entry_type` | `text` | check: `'abono' \| 'cargo'` |
| `source` | `text` | check: `'viaje' \| 'racha' \| 'bono' \| 'canje' \| 'ajuste'` |
| `amount` | `int` | siempre positivo; `entry_type` define el signo |
| `description` | `text` | |
| `reference_id` | `text` | bookingId / redemptionId |

### `redeemables`

Catálogo de canjes (`RedeemableItem`). Lo publican admins (Sesión 4); se siembra
en la migración de seed.

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `text` PK | mismo id del catálogo (`redeem-cafe`, …) |
| `title` / `description` | `text` | |
| `category` | `text` | check: `'comida' \| 'merch' \| 'eventos' \| 'servicios'` |
| `cost_credits` | `int` | |
| `sponsor` / `stock` | `text` / `int` | nullable |
| `validity_days` | `int` | vigencia del código una vez canjeado |
| `published_by_admin` / `active` | `boolean` | |

### `redemptions`

Fuente: `Redemption` (`models/uturn.ts`).

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `user_id` | `uuid` | FK → `profiles.id` |
| `item_id` | `text` | FK → `redeemables.id` |
| `title` / `cost_credits` | `text` / `int` | copia al momento del canje |
| `code` | `text` | formato `UT-XXXX-XXXX` |
| `status` | `text` | check: `'disponible' \| 'canjeado'` (`expirado` se deriva de `expires_at`) |
| `expires_at` / `redeemed_at` | `timestamptz` | |

`profiles` lleva además, denormalizados y mantenidos por funciones de servidor:
`reward_points`, rachas (`streak_*`), cancelaciones tardías + `block_until`, y
strikes de impago + `payment_ban_until`. También `credential_verified` y
`bank_details` (jsonb).

## Funciones de servidor (fuente de verdad)

Toda la lógica crítica se ejecuta en Postgres (`supabase/migrations/…_functions.sql`),
imposible de burlar desde el cliente:

- `reserve_seat(trip_id, commission)` — valida ban/bloqueo y asientos, crea
  `booking` + `payment` (vence a 48 h) y ocupa asiento. **Única vía de reserva.**
- `cancel_booking(booking_id)` — libera asiento y aplica cancelación tardía
  (3/6/9 → bloqueo 1/3/7 días, ventana móvil de 30 días). Porta `services/penalties.ts`.
- `mark_payment_sent` / `confirm_payment_received` — el segundo acredita créditos
  y rachas de pagos a tiempo (+bono cada 3).
- `complete_booking` — puntos y racha de viajes completados (+bono cada 5).
- `expire_overdue_payments()` — expira pagos a 48 h y emite strikes (3 → baneo 2
  días). La corre **pg_cron** cada 15 min y/o la **Edge Function** `expire-payments`.
- `redeem_item(item_id)` — valida saldo, crea `redemption` y carga créditos.
- Triggers: `enforce_university_email` (valida dominio en `auth.users`),
  `handle_new_user` (crea el `profile`), `recompute_rating_avg`, `set_updated_at`,
  `protect_profile_columns` (impide auto-asignar rol o tocar saldos/strikes).

## Storage

Dos buckets **privados** (acceso por URL firmada), ruta `<uid>/<archivo>`:

- `avatars` — foto de perfil; lectura para autenticados, escritura del dueño.
- `credentials` — captura de intranet; lectura solo del dueño (+admin), escritura
  del dueño. Conectado a `CredentialVerificationScreen`.

## RLS: escritura solo por servidor

Además del bosquejo de arriba: **`payments`, `strikes` y `credit_transactions`
no tienen políticas de escritura para clientes** — solo se modifican vía las
funciones de servidor (security definer). `bookings`/`payments` se escriben
exclusivamente por RPC. `redemptions` se crea por `redeem_item` (que también
carga créditos) y el usuario solo puede marcar el suyo como usado.

## Catálogos aún en constantes

El catálogo de universidades/campus/puntos de encuentro sigue en
`constants/campuses.ts`; se moverá a tablas cuando exista panel de administración
(Sesión 4–5). Feed y mensajería definirán sus tablas en sus módulos.

## Plan de migración (ejecutado en Sesión 3)

1. ✅ Proyecto Supabase + migraciones SQL con RLS (`supabase/migrations/`).
2. ✅ Auth real por OTP/magic link con validación de dominio; sesión persistida;
   `UserContext` envuelve la sesión de Supabase.
3. ✅ `services/api/*` reemplazan los CRUD; `useAppState` conserva sus firmas y
   hace write-through + reconcilia con realtime.
4. ✅ `services/penalties.ts` portado a SQL (`cancel_booking` / `expire_overdue_payments`).
5. ✅ Realtime en `trips`/`bookings`.

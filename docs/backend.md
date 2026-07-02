# Backend de Uturn

> Sesión 0 — decisión de arquitectura. Este documento registra la elección de
> backend y un esquema tentativo de tablas. Nada de esto está implementado aún:
> la app sigue funcionando con estado mock en memoria + AsyncStorage.

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

## Fuera de alcance de esta sesión

Feed, mensajería, pagos y créditos definirán sus tablas cuando se aborden sus
módulos. El catálogo de universidades/campus/puntos de encuentro sigue en
`constants/campuses.ts`; se moverá a tablas cuando exista panel de
administración.

## Plan de migración (referencia)

1. Crear proyecto Supabase + migraciones SQL de este esquema (con RLS).
2. Auth real: registro con validación de dominio, sesión persistida en
   AsyncStorage (reemplaza el login mock de `LoginScreen`).
3. Sustituir mocks de `store/appState.tsx` por queries/mutations de
   `@supabase/supabase-js`, manteniendo la misma interfaz de `useAppState`.
4. Portar `services/penalties.ts` a función SQL y dejar el cliente como espejo.
5. Realtime en `trips`/`bookings` para reemplazar las notificaciones locales.

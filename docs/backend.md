# Backend de Unities

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

- **Postgres relacional.** El dominio de Unities es naturalmente relacional:
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
tablas de créditos/canjes conservan los tokens en español de `models/unities.ts`.

### `payments`

Fuente: `BookingPayment` (`store/appState.tsx`). 1:1 con `bookings`.

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `booking_id` | `uuid` unique | FK → `bookings.id` |
| `status` | `text` | check: `'pending' \| 'marked' \| 'confirmed' \| 'overdue'` |
| `price_clp` / `commission_clp` / `total_clp` | `int` | comisión fija Unities (300 CLP) |
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

Fuente: `CreditTransaction` (`models/unities.ts`). Saldo = `sum(abono) - sum(cargo)`
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

Fuente: `Redemption` (`models/unities.ts`).

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
strikes de impago + `payment_ban_until`. También `credential_verified`.

### `bank_details`

Datos bancarios del conductor (`BankDetails` de `models/types.ts`). Tabla aparte
de `profiles` para que la lectura comunitaria del perfil no exponga datos
sensibles: RLS de **solo-dueño**; un pasajero con reserva no cancelada los
obtiene vía la RPC `get_driver_bank_details`.

| Columna | Tipo | Notas |
| --- | --- | --- |
| `user_id` | `uuid` PK | FK → `profiles.id` |
| `details` | `jsonb` | banco, tipo/número de cuenta, titular, RUT |

## Funciones de servidor (fuente de verdad)

Toda la lógica crítica se ejecuta en Postgres (`supabase/migrations/…_functions.sql`),
imposible de burlar desde el cliente:

- `reserve_seat(trip_id)` — valida ban/bloqueo y asientos, crea `booking` +
  `payment` (vence a 48 h, comisión fijada por el servidor) y ocupa asiento.
  **Única vía de reserva.**
- `cancel_booking(booking_id)` — libera asiento y aplica cancelación tardía
  (3/6/9 → bloqueo 1/3/7 días, ventana móvil de 30 días). Porta `services/penalties.ts`.
- `mark_payment_sent` / `confirm_payment_received` — el segundo acredita créditos
  y rachas de pagos a tiempo (+bono cada 3).
- `complete_booking` — puntos y racha de viajes completados (+bono cada 5).
- `expire_overdue_payments()` — expira pagos a 48 h y emite strikes (3 → baneo 2
  días). La corre **pg_cron** cada 15 min y/o la **Edge Function** `expire-payments`.
- `redeem_item(item_id)` — valida saldo y stock (serializado con advisory lock
  contra doble gasto), crea `redemption` y carga créditos.
- `get_driver_bank_details(driver_id)` — entrega los datos bancarios solo al
  propio conductor o a pasajeros con reserva no cancelada en sus viajes.
- `credit_balance(target)` — saldo agregado; solo el propio usuario (o admin).
- Triggers: `enforce_university_email` (valida dominio en `auth.users`),
  `handle_new_user` (crea el `profile`; la universidad se deriva del dominio del
  correo, no de metadatos editables), `recompute_rating_avg`, `set_updated_at`,
  `protect_profile_columns` (impide auto-asignar rol o tocar saldos/strikes) y
  `protect_redemption_columns` (el cliente solo puede marcar su canje como usado).

Todos los RPC exigen sesión (`auth.uid()`), revocan el `EXECUTE` por defecto de
`PUBLIC`/`anon` y se conceden solo a `authenticated`; `expire_overdue_payments`
ni siquiera a `authenticated` (solo cron/service_role).

## Storage

Tres buckets **privados** (acceso por URL firmada), ruta `<uid>/<archivo>`:

- `avatars` — foto de perfil; lectura para autenticados, escritura del dueño.
- `credentials` — captura de intranet; lectura solo del dueño (+admin), escritura
  del dueño. Conectado a `CredentialVerificationScreen`.
- `feed-media` (Sesión 4) — imágenes/carretes del feed y de historias; lectura
  para autenticados (firmada en lote con `createSignedUrls`), escritura solo de
  roles que publican (`can_publish()`) en su carpeta. El composer comprime al
  subir (`quality` del image picker).

## RLS: escritura solo por servidor

Además del bosquejo de arriba: **`payments`, `strikes` y `credit_transactions`
no tienen políticas de escritura para clientes** — solo se modifican vía las
funciones de servidor (security definer). `bookings`/`payments` se escriben
exclusivamente por RPC. `redemptions` se crea por `redeem_item` (que también
carga créditos) y el usuario solo puede marcar el suyo como usado (trigger
`protect_redemption_columns`). `bank_details` es de solo-dueño (los pasajeros
pasan por la RPC). Las políticas usan `to authenticated` + `(select auth.uid())`
según las prácticas recomendadas de Supabase.

## Tablas del feed (Sesión 4)

El tab Inicio es un feed social sobre Supabase: entidades publicadoras,
posts tipados, historias de 24 h e interacciones. Migraciones
`…120000_feed_schema.sql`, `…120001_feed_functions_rls.sql` y
`…120002_feed_storage_seed.sql`. Servicio cliente: `services/api/feed.ts`.

### `publishers`

Quiénes publican en el feed (los alumnos no publican: lo hacen estas entidades
a través de cuentas con rol `tutor`/`admin`/`owner`).

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `slug` | `text` unique | identificador estable para seed y deep links (`feuai`, …) |
| `name` | `text` | |
| `kind` | `text` | check: `'federacion' \| 'departamento' \| 'centro_alumnos' \| 'universidad' \| 'marca'` |
| `university_id` | `text` | catálogo `constants/campuses.ts` (`'uai'`, …) |
| `avatar_url` | `text` | ruta en `feed-media` o URL http(s); sin imagen la UI muestra iniciales |
| `description` | `text` | |

Seed: FEUAI, cuenta oficial UAI, DAE, Deportes, centros de alumnos por carrera
(Ingeniería, Derecho, Negocios, Psicología, Diseño) y marcas auspiciadoras
(Cafetería Central, Copec).

### `posts`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `publisher_id` | `uuid` | FK → `publishers.id` |
| `author_id` | `uuid` | FK → `profiles.id`; la persona que publicó a nombre del publisher |
| `post_type` | `text` | check: `'noticia' \| 'evento' \| 'activacion' \| 'descuento'` |
| `body` | `text` | |
| `media` | `jsonb` | arreglo de strings: rutas en `feed-media` (se firman al leer) o URLs http(s). Varias imágenes = **carrete** (tarjeta con galería) |
| `event_starts_at` | `timestamptz` | obligatorio si `post_type = 'evento'` (check); opcional en activaciones |
| `event_location` | `text` | |
| `discount_code` / `discount_terms` | `text` | código y condiciones para `descuento` |
| `redeemable_id` | `text` | FK → `redeemables.id`; enlaza el descuento al catálogo de canjes (Sesión 2) |
| `like_count` / `repost_count` / `reply_count` | `int` | denormalizados, mantenidos por el trigger `bump_post_counters` (security definer: el cliente no tiene UPDATE sobre posts) |

Índices: `(created_at desc, id desc)` para el **cursor keyset** del feed
paginado, y parcial sobre `event_starts_at` para el widget "Eventos de la
semana" (posts `evento` de los próximos 7 días).

### `stories`

Historias con **expiración de 24 h aplicada por el servidor**: la política de
lectura exige `expires_at > now()` (una historia vencida deja de ser visible
aunque el cliente mienta) y el job pg_cron `purge-expired-stories` (cada hora)
borra las filas vencidas vía `purge_expired_stories()`.

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `publisher_id` | `uuid` | FK → `publishers.id` |
| `author_id` | `uuid` | FK → `profiles.id` |
| `media_path` | `text` | ruta en `feed-media` o URL http(s) |
| `caption` | `text` | |
| `expires_at` | `timestamptz` | default `now() + 24 h` |

### `post_likes` / `post_reposts` / `post_replies`

Interacciones **una por usuario por post**: `post_likes` y `post_reposts` con
PK compuesta `(post_id, user_id)`; `post_replies` (hilo simple, `body` de 1 a
500 caracteres) con unique `(post_id, user_id)`. Los contadores del post los
mueve el trigger; el cliente hace actualización optimista y reconcilia.

### RLS del feed

- Lectura de todo el feed para `authenticated` (stories además exigen no
  haber expirado).
- **Publicar (posts/stories) solo roles `tutor`/`admin`/`owner`** vía
  `public.can_publish()` (security definer sobre `profiles.account_role`,
  mismo patrón que `is_admin()`); además `author_id` debe ser `auth.uid()`.
  El botón de publicar del cliente solo refleja el permiso: el enforcement es
  la política.
- `publishers` solo lo administra `admin`/`owner`.
- Interacciones: insert/delete solo con `user_id = auth.uid()`; la unicidad la
  garantiza el constraint, no el cliente.

### Realtime

`posts` y `stories` se agregaron a la publicación `supabase_realtime` (el feed
se suscribe a INSERT de `posts` y muestra el banner "Nuevas publicaciones").
La publicación estaba vacía, así que en la misma migración se agregaron también
`trips`, `bookings`, `payments` y `credit_transactions`, cuyas suscripciones de
la Sesión 3 no recibían eventos.

## Panel de administración (Sesión 5)

Migraciones `20260705120000` a `20260705120002`. La regla de la sesión: **cada
admin opera solo en nombre de sus publishers** — y eso es una política RLS
sobre `publisher_members`, no lógica de cliente. El owner tiene alcance global.

### `publisher_members`

Membresía usuario ↔ publisher. PK compuesta `(publisher_id, user_id)`.

| Columna | Tipo | Nota |
|---|---|---|
| `publisher_id` | `uuid` | FK `publishers`, cascade |
| `user_id` | `uuid` | FK `profiles`, cascade |

- Select: mis membresías, las de mis publishers, o todo si owner.
- Insert/delete: **solo owner** (asigna admins desde su vista).
- Helpers security definer (patrón `is_admin`): `is_owner()`,
  `is_publisher_member(uuid)`, `can_publish_as(uuid)` (owner, o
  `can_publish()` + membresía) y `can_manage_publisher(uuid)` (owner, o
  `is_admin()` + membresía — los tutores publican pero no administran).
- Las políticas de la Sesión 4 sobre `posts`/`stories` pasaron de
  `can_publish()` global a `can_publish_as(publisher_id)`; crear/editar
  `publishers` pasó de `is_admin()` a solo owner.

### `brands`

Marcas asociadas a un publisher que co-firman promociones/activaciones
(`posts.brand_id`, FK nueva con `on delete set null`).

| Columna | Tipo | Nota |
|---|---|---|
| `publisher_id` | `uuid` | FK `publishers`, cascade |
| `name` | `text` | |
| `logo_path` | `text` | ruta en `feed-media` o URL http(s) |

Escritura vía `can_manage_publisher(publisher_id)`; lectura autenticada (el
feed muestra "Junto a <marca>").

### `widget_config`

Configuración editorial del widget "Eventos de la semana": una fila por post
configurado, `unique (widget, post_id)`.

| Columna | Tipo | Nota |
|---|---|---|
| `widget` | `text` | check `eventos_semana` |
| `post_id` | `uuid` | FK `posts`, cascade |
| `sort_order` | `integer` | orden dentro del widget |
| `pinned` | `boolean` | fijado al inicio |
| `featured` | `boolean` | badge "Destacado" |

`listWeekEvents()` ordena: fijados → configurados por `sort_order` → resto por
fecha del evento. Escritura vía `can_configure_widget(post_id)` (owner o admin
del publisher del post).

### `content_folders` / `content_items`

Carpetas de contenido por publisher (media en `feed-media`).
`content_folders.linked_widget` (check `galeria`, nullable) integra la carpeta
al widget de colecciones del feed; null = carpeta interna del panel.
Escritura vía `can_manage_publisher` / `can_manage_folder(folder_id)`.

### Flujo de postulación de canjeables

`redeemables` ganó `status` (`pendiente|aprobado|rechazado`), `proposed_by`,
`publisher_id`, `reviewed_by/reviewed_at/review_note`. El catálogo existente
quedó `aprobado`.

- **Insert**: owner libre; admin solo con `status = 'pendiente'`,
  `proposed_by = auth.uid()` y publisher propio.
- **Update/delete**: owner libre; el proponente solo mientras siga
  `'pendiente'` y el `WITH CHECK` le impide sacarla de ese estado — **aprobar
  desde una cuenta no-owner es imposible por RLS**.
- **Select**: el catálogo público solo ve `aprobado`; el proponente ve lo suyo
  y admin/owner todo (bandeja).
- **`review_redeemable(p_item_id, p_approve, p_note)`** (security definer)
  verifica el rol `owner` en el servidor y marca aprobado/rechazado con
  auditoría (`reviewed_by/at`). Un admin no puede aprobarse a sí mismo.
- **`redeem_item` endurecido**: solo canjea items `active` **y** `aprobado`;
  `listCatalog()` aplica el mismo filtro en el cliente.

## Mensajes, tutores y Q&A (Sesión 6)

Migraciones `20260706120000` a `20260706120003` (la última endurece según los
advisors: search_path fijo, helpers sin EXECUTE para anon/PUBLIC, índices de
FKs y políticas de admin sin solapar el SELECT). Chat **realtime desde el día
uno** sobre Supabase; la privacidad es la política RLS (solo los miembros de
una conversación leen/escriben sus mensajes), no el cliente. Servicios:
`services/api/messages.ts`, `qa.ts`, `guides.ts`.

### `conversations`

DM 1-a-1 o ticket de "Soporte Unities". Los campos `last_message_*` se
denormalizan por trigger para ordenar/previsualizar la bandeja sin N+1.

| Columna | Tipo | Notas |
|---|---|---|
| `kind` | `text` | check: `'dm' \| 'soporte'` |
| `dm_key` | `text` unique | `'<uuid menor>:<uuid mayor>'`; garantiza un único DM por par |
| `support_category` | `text` | check: `'pagos' \| 'baneos' \| 'verificacion' \| 'otro'` |
| `support_status` | `text` | check: `'abierto' \| 'resuelto'` |
| `created_by` | `uuid` | FK `profiles` |
| `last_message_at/preview/sender` | | denormalizados por `touch_conversation_on_message` |

### `conversation_members`

PK `(conversation_id, user_id)`. `last_read_at` es el puntero de lectura por
miembro: alimenta los contadores de no-leídos y el indicador **"visto"** de
los DMs (el otro cliente lo recibe en vivo por realtime).

### `messages`

Texto (≤ 2000) y/o imagen (`image_path` en el bucket `chat-media`, ruta
`<conversation_id>/<uid>/<archivo>`). Inmutables: sin UPDATE/DELETE de
clientes. Índice `(conversation_id, created_at desc, id desc)` para el
historial.

### `topics` / `topic_assignees`

Catálogo de temas del Q&A (id de texto estable: `mallas`, `becas`,
`deportes`, `fiestas`, `intercambio`, `practicas`, `vida-campus`; seed en la
migración). `topic_assignees` define **quién responde oficialmente** cada
tema: un tutor (`user_id`) **o** un publisher/federación (`publisher_id`),
exactamente uno (check); lo administra admin/owner.

### `questions` / `question_replies`

Preguntas públicas por tema. `reply_count` y `answered_at` los mantiene el
trigger `bump_question_counters` (el autor no puede tocarlos:
`protect_question_columns`, mismo patrón que profiles). Las respuestas con
`is_official = true` quedan destacadas y solo pueden crearlas los asignados
al tema — la política evalúa `can_answer_question(question_id, publisher_id)`
(tutor asignado, o miembro de un publisher asignado vía `publisher_members`
de la Sesión 5). **Un `user` no puede responder oficialmente: lo rechaza la
RLS**, no el cliente.

### `guides`

Material de tutores: `title`, `description`, `topic_id`, `file_path` (bucket
`guides`) y `file_kind` (`'imagen' \| 'pdf'`). Insert solo `tutor`+
(`can_publish()`, Sesión 4) y a nombre propio; lectura para autenticados;
consultables desde el Q&A del tema y el mini-perfil del tutor.

### Funciones de servidor (mensajería)

Única vía de creación de conversaciones/membresías (no hay políticas de
INSERT para clientes), mismo estándar de grants que la Sesión 3:

- `start_dm(p_other_user)` — devuelve el DM existente del par (por `dm_key`)
  o lo crea con ambas membresías (con `on conflict` para la carrera). Antes de
  crear uno nuevo exige `can_start_dm` (ver **DM híbrido** más abajo); los
  hilos ya existentes se devuelven sin re-validar.
- `start_support(p_category)` — reutiliza el ticket abierto del usuario en la
  categoría o crea uno nuevo.
- `set_support_status(p_conversation, p_status)` — abierto/resuelto; agentes
  (admin/owner) o el propio miembro.
- `mark_conversation_read(p_conversation)` — mueve `last_read_at`; si un
  admin abre un ticket del que no es miembro, se une aquí (gana puntero de
  lectura propio).
- `conversation_unread_counts()` — no-leídos por conversación en una sola
  consulta (security **invoker**: cuenta solo lo que la RLS deja ver).
- Triggers: `touch_conversation_on_message` (resumen de bandeja + reabre
  tickets resueltos cuando escribe un no-agente + deja el mensaje propio como
  leído), `bump_question_counters`, `protect_question_columns`,
  `set_updated_at` en las tablas nuevas.

### RLS de mensajería (la garantía es la política)

- `conversations`/`conversation_members`/`messages`: **solo** con
  `can_access_conversation(id)` — miembro de la conversación, o admin/owner
  únicamente en las de soporte (atienden "Soporte Unities"). El insert de
  mensajes exige además `sender_id = auth.uid()`.
- Helpers security definer (patrón `is_admin`): `is_conversation_member`,
  `can_access_conversation`, `can_answer_question`,
  `conversation_from_path` (cast seguro para las políticas de Storage).
- `topics`/`topic_assignees`: lectura autenticada; escritura admin/owner.
- `questions`: lectura autenticada; insert/update/delete del autor (admin
  modera). `question_replies`: comentar cualquiera a nombre propio; oficial
  solo asignados (ver arriba); sin update (historial inmutable).
- `guides`: lectura autenticada; insert `can_publish()` + autor propio.

### DM híbrido — anti-bullying (migración `20260711200427_dm_hibrido`)

Un alumno solo puede **abrir** un DM con otra persona si (a) comparte con
ella un viaje con reserva **confirmada** en el mismo trip — conductor↔pasajero
en cualquier dirección, o copasajeros del mismo viaje — o (b) la contraparte
es cuenta oficial (`tutor`/`admin`/`owner`). Cero DM libre alumno↔alumno; los
hilos que ya existían antes de esta regla (o abiertos legítimamente) se siguen
leyendo sin re-validar — la regla gobierna la apertura, no el acceso histórico.

- `is_official_account(p_user)` / `shares_confirmed_trip(p_a, p_b)` —
  helpers de la regla (security definer, sin `EXECUTE` para roles de
  cliente: solo se evalúan en contexto de servidor).
- `can_start_dm(p_a, p_b)` — combina ambos: oficial en cualquiera de los dos,
  o viaje confirmado compartido. Es la fuente de verdad única de la regla.
- `start_dm` la exige antes de insertar una conversación nueva (ver arriba).
- **Defensa en profundidad**: los triggers `enforce_dm_conversation` (BEFORE
  INSERT en `conversations`) y `enforce_dm_membership` (BEFORE INSERT en
  `conversation_members`) re-validan `can_start_dm` para cualquier insert de
  origen usuario (`auth.uid()` presente), aunque no pase por `start_dm` —
  así una futura función `security definer` descuidada no puede saltarse la
  regla. `conversations`/`conversation_members`/`messages` siguen sin
  políticas de INSERT/UPDATE/DELETE para clientes: crear pasa únicamente por
  el RPC.
- `list_dm_contacts()` — directorio mínimo para el composer "nuevo mensaje":
  cuentas oficiales + compañeros de viaje confirmado del usuario actual (no
  expone al resto del alumnado; reemplazó la búsqueda libre por nombre sobre
  `profiles`).

### Storage (Sesión 6)

- `guides` — privado; lectura autenticada por URL firmada, escritura solo
  `tutor`+ en su carpeta `<uid>/…` (mismo patrón que feed-media).
- `chat-media` — privado; ruta `<conversation_id>/<uid>/<archivo>`. Leer y
  subir exige `can_access_conversation` del primer segmento de la ruta — la
  privacidad del chat aplica también a sus imágenes.

### Realtime (Sesión 6)

Se agregaron a `supabase_realtime`: `messages` (los mensajes entran sin
recargar), `conversations` (bandeja y estados de soporte en vivo),
`conversation_members` (indicador "visto"), `questions` y `question_replies`
(el Q&A abierto se refresca solo). RLS sigue filtrando lo que cada suscriptor
recibe: un cliente jamás recibe mensajes de conversaciones ajenas.

## Pagos avanzados (Sesión 8)

Migraciones `20260708120000` a `20260708120002`. Objetivo: quitar la fricción y el
fraude del pago manual. La **fuente de verdad del strike deja de ser la palabra
del pasajero** (marcar pagado) y pasa a ser el estado **verificado** por el banco.
Servicios cliente: `services/api/payments.ts` (+ helpers puros en
`services/payments.ts`).

### Decisión de proveedor: Fintoc (verificación de transferencias)

**Recomendado: Fintoc.** El flujo actual de Unities ya es por **transferencia
bancaria** (el pasajero transfiere al conductor con los datos de `bank_details`).
Fintoc verifica transferencias/`payment_intents` vía API + webhooks, así que
encaja sin cambiar el hábito del usuario: se confirma el pago automáticamente en
vez de depender de que el conductor apriete "confirmar".

| Opción | Veredicto |
| --- | --- |
| **Fintoc** ✅ | API chilena de pagos/transferencias con webhooks firmados y sandbox. Verifica el flujo de transferencia ya existente; la comisión se calcula sobre el mismo pago. Elegido para el piloto. |
| **Mercado Pago** | Buen alcance (tarjeta, saldo MP), pero orientado a checkout con tarjeta más que a verificar transferencias; comisiones más altas y otro hábito de pago. Queda como opción futura de **tarjeta**. |
| **Webpay / Transbank** | Estándar de tarjeta en Chile, pero onboarding y contrato más pesados, pensado para comercios establecidos; excede un piloto universitario. Futuro. |

La arquitectura queda **agnóstica**: `payments.provider` (`fintoc | manual |
credits`) y la tabla `payment_events` permiten sumar Mercado Pago/Webpay después
sin tocar el dominio. Credenciales SOLO en variables de entorno de las Edge
Functions (`FINTOC_SECRET_KEY`, `FINTOC_WEBHOOK_SECRET`); nunca en el cliente ni
en git.

### Cambio de fuente de verdad

`expire_overdue_payments()` ahora expira y strikea los pagos `pending` **y**
`marked` que vencen (marcar pagado es solo la palabra del pasajero, ya no
protege). Solo el pago **verificado** (`confirmed`, que fijan el webhook, el
conductor o una disputa aprobada) evita el strike. La válvula de escape justa es
la **disputa** (`disputed` nunca se strikea). El estado `disputed` se sumó al
check de `payments.status`.

### Verificación automática

- Al pagar, la Edge Function **`create-payment-intent`** (verify_jwt, autentica
  al pasajero por su JWT) llama a `prepare_payment_intent` (calcula el pago
  parcial con créditos y el monto en efectivo), crea la intención en Fintoc y
  guarda su id con `attach_provider_intent`.
- El **webhook `fintoc-webhook`** (verify_jwt=false, validado por **firma
  HMAC-SHA256** `t=…,v1=…` con `FINTOC_WEBHOOK_SECRET`) deduplica el evento en
  `payment_events` (unique `provider, provider_event_id`) y, al acreditarse la
  transferencia, llama a `apply_payment_verification`, que marca `confirmed`.
- Las recompensas al confirmar (créditos por pago a tiempo, racha, descuento de
  créditos aplicados) se centralizaron en el trigger `award_on_payment_confirmed`
  para que TODAS las vías de verificación (webhook, conductor, disputa aprobada)
  premien igual sin duplicar la lógica. El push de "pago confirmado" ya lo emite
  `notify_on_payment_update` (Sesión 7).

### Tablas nuevas

- **`platform_config`** (fila única `'default'`): parámetros que ajusta el owner
  — `commission_clp` (la lee `reserve_seat`), `credit_clp_rate` (CLP por crédito)
  y `max_credit_discount_pct`. Lectura autenticada; escritura solo por
  `update_platform_config` (owner).
- **`payments`** ganó: `provider`, `provider_intent_id` (unique parcial),
  `provider_status`, `verified_at`, `credits_applied`/`credits_clp`/`cash_clp`
  (pago parcial con créditos) y `payout_id` (liquidación).
- **`strikes`** ganó `status` (`active|frozen|reverted`) y `dispute_id` para
  congelarlos/revertirlos en una disputa.
- **`payment_events`**: bitácora de webhooks (auditoría + idempotencia). Sin
  acceso de cliente; solo el owner la lee.
- **`disputes`**: flujo "yo sí pagué" — `booking_id`, `payment_id`, `opened_by`,
  `reason`, `evidence_path` (bucket `dispute-evidence`), `status`
  (`abierta|resuelta_pagada|resuelta_rechazada`), `conversation_id` (ticket de
  Soporte Unities). Única disputa abierta por reserva (índice parcial).
- **`payouts`**: liquidaciones al conductor (bruto/comisión/neto por periodo,
  `status pendiente|pagada`).

### Funciones de servidor

- `prepare_payment_intent` / `attach_provider_intent` / `apply_payment_verification`
  — **solo service_role** (las llama la Edge Function con la service key).
- `open_dispute(booking, reason, evidence)` — congela el strike si el pago ya
  estaba vencido (decrementa el contador y levanta el baneo mientras se revisa) y
  abre/reutiliza un ticket de soporte (`start_support('pagos')`).
- `resolve_dispute(dispute, approve, note)` — admin/owner. Aprobar verifica el
  pago (trata como a tiempo) y revierte el strike; rechazar reactiva/emite el
  strike y recalcula el baneo.
- `list_disputes(only_open)` — bandeja admin/owner con el detalle en un jsonb.
- `driver_earnings()` — bruto/comisión/neto + historial del conductor.
- `create_payout` / `mark_payout_paid` — liquidaciones (owner).
- `owner_finance_summary()` — comisiones, volumen por campus, morosidad (owner).
- `update_platform_config` — comisión, tasa de créditos, tope (owner).
- `_register_payment_strike` / `award_on_payment_confirmed` — helpers internos
  (service/trigger), sin EXECUTE para clientes.

Grants: los RPC de cliente van a `authenticated` (los de owner/admin verifican el
rol dentro, patrón `is_admin`/`is_owner`); las funciones de proveedor solo a
`service_role`.

### RLS y Storage

- `platform_config`: lectura autenticada; escritura por RPC.
- `payment_events`: solo el owner lee; el service_role escribe.
- `disputes`: el pasajero ve las suyas, admin/owner todas; escritura por RPC.
- `payouts`: el conductor las suyas, el owner todas; escritura por RPC.
- Bucket privado **`dispute-evidence`** (`<uid>/…`): lo lee el dueño y admin/owner
  (revisar la disputa), lo escribe el dueño (mismo patrón que `credentials`).
- Realtime: `disputes` se agregó a `supabase_realtime` (la bandeja se actualiza en
  vivo).

### Probar el ciclo en sandbox

`supabase/tests/payments_cycle_test.sql` simula end-to-end (reserva → intención →
webhook → verificación → recompensas; vencimiento → strike; disputa → congela →
resuelve; pago con créditos; ganancias/panel) sin credenciales de Fintoc
(reemplaza el webhook por `apply_payment_verification`, su misma fuente de
verdad). Corre en una transacción con ROLLBACK. Para probar contra Fintoc real:
configura `FINTOC_SECRET_KEY`/`FINTOC_WEBHOOK_SECRET` (sandbox), despliega
`create-payment-intent` y `fintoc-webhook`, y registra la URL del webhook en el
dashboard de Fintoc.

## Bots de IA

Migraciones `20260712120000_ai_bots_schema.sql` y
`20260712120001_ai_bots_functions_rls.sql` + Edge Function `ai-bot-reply`.
Cada publisher (federación/centro de alumnos/marca) y cada tutor por
asignatura puede tener un bot de IA con el que **cualquier alumno chatea por
DM normal**, exactamente igual que con una persona. Servicios cliente:
`services/api/bots.ts` (configuración) y el `services/api/messages.ts`
existente sin cambios (`startDm(bot.profileId)` abre el chat).

### Decisión de diseño: el bot ES un `profiles`

En vez de inventar un tipo de conversación nuevo, el bot es una fila más de
`profiles` (`is_bot = true`) con su propio `auth.users` "de servicio" — sin
contraseña ni OTP real, nadie puede iniciar sesión como él. Esto reutiliza el
**100%** de la mensajería de la Sesión 6 (`start_dm`, `conversation_members`,
RLS, realtime) sin tocar una sola línea de esa migración: para el sistema de
chat, un bot es un miembro más de la conversación.

- `profiles.is_bot boolean` — marca los perfiles de servicio.
- `_create_bot_profile(display_name, university_id)` (interno, sin `EXECUTE`
  para clientes) — crea el `auth.users` + `profiles` del bot. El email es
  sintético pero con **dominio institucional real** (`bot-<uuid>@alumnos.uai.cl`,
  etc.) porque `enforce_university_email` (Sesión 3) no tiene excepción para
  triggers; nadie puede completar un login ahí (no hay OTP a esa casilla).

### `ai_bots`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `profile_id` | `uuid` unique | FK `profiles`; el "otro lado" del DM |
| `owner_kind` | `text` | check: `'publisher' \| 'tutor_topic'` |
| `publisher_id` | `uuid` | exactamente uno de (`publisher_id`) o (`tutor_id`+`topic_id`) |
| `tutor_id` / `topic_id` | `uuid` / `text` | mismo grano que `topic_assignees` (Sesión 6) |
| `persona_name` | `text` | nombre visible en el chat, editable |
| `system_prompt` | `text` | FAQ/instrucciones adicionales, editable por quien administra |
| `enabled` | `boolean` | el trigger de auto-respuesta solo actúa si está en `true` |

Un bot por publisher (`ai_bots_publisher_uq`); un bot por `(tutor, asignatura)`
(`ai_bots_tutor_topic_uq`). Select abierto a todo autenticado (para que el
cliente pueda mostrar el botón "chatear con el bot"); **sin políticas de
insert/update/delete** — toda escritura pasa por las RPC de abajo.

### Funciones de servidor

- `set_publisher_bot(publisher_id, persona_name, system_prompt, enabled)` —
  solo quien administra ese publisher (`can_manage_publisher`, Sesión 5).
  Idempotente: si ya existe el bot, lo actualiza; si no, crea su perfil de
  servicio (heredando el avatar del publisher, para que en el chat se vea
  como la propia federación hablando).
- `set_tutor_topic_bot(topic_id, persona_name, system_prompt, enabled)` —
  solo el tutor asignado a ese tema (`topic_assignees.user_id = auth.uid()`).
- `notify_ai_bot_on_message()` (trigger AFTER INSERT en `messages`) — si el
  destinatario de la conversación es un bot habilitado y quien escribió no es
  el propio bot (evita loops), invoca `ai-bot-reply` vía `pg_net` (mismo
  patrón que `invoke_send_push`, Sesión 7).

### Edge Function `ai-bot-reply`

Sin `verify_jwt` (solo la invoca el trigger interno). Arma el contexto del
bot — `persona_name`/`system_prompt` propios, más las **publicaciones
recientes del publisher** o las **guías recientes del tutor en esa
asignatura** (según `owner_kind`) — y el historial reciente del DM, llama a
**Claude (`claude-opus-4-8`, thinking adaptativo)** vía el SDK oficial de
Anthropic, y publica la respuesta como un mensaje más del bot (`sender_id =
bot.profile_id`, con la `service_role`, que bypassa RLS). Esa inserción
dispara sola el resto de la mensajería ya existente: `touch_conversation_on_message`
(resumen de bandeja) y `notify_on_message` (push al alumno).

Guardrails en el prompt: nunca afirmar ser una persona real, no inventar
datos concretos (fechas/precios/horarios) que no estén en el contexto —
sugerir escribir directo o abrir un ticket de Soporte Unities en su lugar—, no
compartir información personal de otros alumnos, respuestas cortas (~120
palabras). Si Claude rechaza la solicitud (`stop_reason === 'refusal'`), el
bot responde con un mensaje genérico de fallback en vez de fallar en
silencio. Sin `ANTHROPIC_API_KEY` configurada, la función no revienta: registra
el problema y simplemente no publica respuesta.

Secreto nuevo (Edge Function, **nunca** en el repo ni en el cliente):
`ANTHROPIC_API_KEY` — `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`.

### Dónde lo usa el alumno

- **Tutor**: mini-perfil de tutor (`TutorProfileScreen`) lista sus bots
  habilitados con un botón "Chatear con el bot de \<asignatura>".
- **Publisher**: cada tarjeta del feed cuyo publisher tiene un bot habilitado
  muestra un ícono ✨ junto al nombre que abre el DM directo.
- **Configuración**: el tutor gestiona sus bots por asignatura desde Perfil →
  "Bots de tutoría" (`app/tutor-bots.tsx`); el admin/owner de un publisher
  desde el panel → "Bot de IA" (`app/admin/bot.tsx`).

## Gamificación y referidos (Sesión "Perfil novedades jóvenes")

Migraciones `20260715000000` (esquema) y `20260715000001` (funciones/RLS).
Reutiliza los contadores server-authoritative de las Sesiones 1–2
(`profiles.reward_points`, `streak_on_time_payments`/`best_streak_*`,
`streak_completed_trips`/`best_streak_*`): esta sesión **no duplica** esa
lógica, solo la lee para desbloquear insignias y para el bono de referidos.
Servicios cliente: `services/api/gamification.ts`, `referrals.ts`;
`redemptions.ts` gana `listWeeklyHighlights()`.

### `badge_definitions` / `user_badges`

| Tabla | Notas |
|---|---|
| `badge_definitions` | Catálogo (id texto estable, `category`, `title`, `description`, `threshold`). Lectura autenticada; escritura solo owner/admin (curación futura). |
| `user_badges` | PK `(user_id, badge_id)`; `unlocked_at`. **Sin políticas de insert/update/delete para clientes** — solo el trigger `sync_user_badges` escribe. |

`category = 'buen_pagador'` compara `threshold` contra
`best_streak_on_time_payments` ("buen pagador" y "puntual" son la misma racha
vista desde dos ángulos: no se inventa un segundo contador). `category =
'viajero'` compara contra `best_streak_completed_trips`. Seed inicial: 3
niveles por categoría (3/10/25 pagos a tiempo; 5/15/30 viajes seguidos).

El trigger `sync_user_badges` (AFTER UPDATE en `profiles`, `WHEN` acota a
cuando cambia alguno de esos dos `best_streak_*`) inserta las insignias que
recién califican, `on conflict do nothing` — **no se revocan**: son un logro,
no un estado en vivo. La migración incluye un backfill de una sola vez para
los perfiles que ya calificaban antes de que existiera la tabla.

### Código de referido y `referrals`

`profiles.referral_code` (6 caracteres, alfabeto sin ambiguos, único) se
asigna una sola vez en `handle_new_user` (extendida) y es inmutable desde el
cliente (`protect_profile_columns` lo blinda, igual que `reward_points`/
`streak_*`).

| Columna de `referrals` | Notas |
|---|---|
| `referrer_id` / `referred_user_id` | `referred_user_id` es **`unique`**: un invitado solo puede aparecer una vez (antiabuso #1). `check (referrer_id <> referred_user_id)` (antiabuso #2, autorreferido). |
| `status` | `'pendiente' \| 'completado'`; pasa a `'completado'` solo cuando se acredita el bono. |
| `credited_at` | timestamp del bono; `null` mientras está pendiente. |

Lectura: el propio referrer, el propio invitado, o admin. **Sin políticas de
escritura para clientes** — todo pasa por las dos funciones de abajo.

### Funciones de servidor

- `redeem_referral_code(p_code)` — la llama el invitado recién registrado.
  Antiabuso server-side: código inexistente → error; código propio → error;
  invitado que ya pagó su primer viaje → error (ya no calificaría como
  "invitado nuevo", y el bono de todos modos nunca dispararía); segundo
  intento de canje → `unique_violation` en `referred_user_id` capturado y
  reportado como "ya usaste un código".
- `award_referral_on_first_payment()` (trigger AFTER UPDATE en `payments`,
  mismo evento que `award_on_payment_confirmed` de la Sesión 8 pero en un
  trigger **separado** para no tocar esa función crítica) — cuenta los pagos
  `confirmed` históricos del pasajero; si el conteo (incluida la fila recién
  confirmada) es exactamente **1**, es su primer viaje pagado: busca un
  `referrals` `pendiente` para ese invitado, lo marca `completado` y
  acredita **+100 créditos a cada lado** (`credit_transactions`, `source =
  'bono'`) más una notificación (`social`) a ambos. Si ya no es el primer
  pago, o no hay referral pendiente, no hace nada — así un segundo viaje
  pagado del mismo invitado **no repite el bono**.

### Vista previa semanal

`redemptionsApi.listWeeklyHighlights()` reemplaza el mock
(`constants/mock-unities.ts#WEEKLY_HIGHLIGHTS`) por los canjeables reales del
catálogo (`redeemables` activos y `aprobado`, más recientes primero) — no se
creó una tabla nueva, tal como pide la sesión ("usa redeemables ya
migrados"). El cliente marca "Nuevo" (publicado hace ≤ 7 días) y "¡Últimos
cupos!" (`stock <= 5`) localmente a partir de `created_at`/`stock`. Los tipos
`evento`/`activacion` del modelo `WeeklyHighlight` quedan reservados para
cuando el feed publique contenido con fecha propia; por ahora la sección solo
puebla `canjeable`.

### Verificación

`supabase/tests/gamification_referrals_test.sql` (mismo patrón que
`payments_cycle_test.sql`: transacción con `ROLLBACK`, `RAISE NOTICE`/`RAISE
EXCEPTION`) cubre: canje de código feliz + los 3 antiabuso de arriba; primer
viaje pagado del invitado acredita +100 a ambos; segundo viaje pagado **no**
repite el bono; y `sync_user_badges` desbloquea `pagador-confiable` a los 3
pagos a tiempo sin desbloquear `puntualidad-oro` (umbral 10) antes de tiempo.

## Seguridad, confianza y moderación (Sesión 9)

Migraciones `20260723000000` a `20260723000002` + Edge Function
`delete-account`. Regla de la sesión: **cada decisión de seguridad se ejecuta y
gatea en el servidor** — quién puede moderar, quién queda suspendido, qué
publicación se filtra, qué perfil se ve. El cliente solo refleja. Servicios:
`services/api/safety.ts`, `moderation.ts`, `identity.ts`, `privacy.ts`,
`antiabuse.ts`.

### Seguridad en viaje

- **`trip_live_shares`**: compartir viaje en vivo con un contacto de confianza.
  `start_trip_share(trip, nombre, teléfono)` (solo el conductor o un pasajero con
  reserva no cancelada) devuelve un `share_token` opaco; el cliente lanza
  `watchPosition` (`services/location.ts`) y llama `update_trip_share_location`
  cada 15 s. **`get_live_share(token)` tiene `grant` a `anon`**: el contacto abre
  `/live/<token>` (pantalla pública `LiveShareScreen`, sin mapa nativo, se
  refresca sola) y ve conductor, patente y última posición sin cuenta Unities.
  **Retención limitada**: solo se guarda la ÚLTIMA posición (no hay historial de
  rutas); el cron `safety-purge-trip-shares` detiene compartidos abandonados
  (6 h sin update) y borra los detenidos hace > 24 h.
- **`sos_alerts`** + `trigger_sos(trip, lat, lng)`: botón SOS durante el viaje.
  Registra la alerta y **notifica a todo admin/owner sin pasar por
  `notification_prefs`** (una alerta de seguridad no se puede silenciar); el
  cliente además ofrece SMS/llamada al contacto de emergencia. `resolve_sos`
  (admin/owner) la marca atendida/falsa alarma; `list_sos_alerts` alimenta la
  bandeja `app/admin/safety` (realtime sobre `sos_alerts`).
- `profiles.emergency_contact_name/phone` (autoeditables) guardan el contacto.
- Los detalles del auto/conductor van siempre visibles antes de subir
  (`getTripDriverAndVehicle`, panel `TripSafetyPanel` en Mis viajes y en el mapa
  del pasajero).

### Reportes, bloqueos y sanciones

- **`reports`** (polimórfico: `usuario|viaje|mensaje|post|historia|post_respuesta|
  pregunta|qa_respuesta`): `report_target(...)` desde perfil, viaje, chat o
  publicación (hoja `components/safety/report-sheet.tsx`, con evidencia opcional
  al bucket `report-evidence`). El reportante ve los suyos; **tutor+**
  (`can_moderate()`) ve la bandeja `app/admin/reports` (`list_reports`).
- **`user_blocks`** (bloqueo **mutuo**): `are_blocked(a,b)` es simétrico y se teje
  en `can_start_dm` (endurece el DM híbrido de la Sesión 6), `can_send_message`,
  `list_dm_contacts` y las políticas SELECT de `post_replies`/`question_replies`.
  Un bloqueado no abre/escribe DM ni ve respuestas cruzadas — en ambos sentidos.
- **`moderation_actions`** (auditoría) + `apply_moderation_action` (**admin+**):
  advertencia (suma `warnings_count`), suspensión temporal, baneo o levantar
  sanción. El estado vigente vive denormalizado en
  `profiles.moderation_status/moderation_until`; **`is_active_account()` lo lee y
  gatea `reserve_seat`, publicar (`trips`/`posts`/`stories`/`questions`/…) y
  mensajear**. Sancionar cierra el reporte de origen y notifica al usuario con
  enlace a las reglas.
- `moderate_content(report, delete)` (**admin+**) elimina el contenido reportado
  (reusa las políticas DELETE de `is_admin()` de las Sesiones 4/6) y cierra el
  reporte.

### Moderación de contenido

- **`blocked_words`** + trigger `enforce_word_filter` (BEFORE INSERT en
  `posts`/`stories`/`post_replies`/`questions`/`question_replies`): rechaza la
  publicación con palabras vetadas. Lee el texto vía `to_jsonb(new)->>'campo'`
  para servir a las cinco tablas con un solo trigger (columnas distintas).
- Trigger `enforce_rate_limit` (mismas tablas): tope de publicaciones por autor
  y ventana (anti-spam). El owner gestiona la lista desde `app/admin/antiabuse`.
- **Reglas de la comunidad** publicadas en la app (`app/community-rules`,
  `CommunityRulesScreen`), enlazadas desde las notificaciones de sanción.

### Identidad

La verificación de credencial deja de ser automática por captura y pasa a
**cola de revisión humana**: `submit_credential_review` (lo llama
`CredentialVerificationScreen` tras subir la captura) marca `en_revision`;
`review_credential` (**tutor+**) aprueba/rechaza. Aprobar fija
`credential_verified` **y `credential_expires_at = now()+6 meses`**; el cron
`safety-expire-credentials` la vence al semestre (vuelve a `pendiente`).
`protect_profile_columns` blinda todas las columnas de credencial/moderación.
**Verificación reforzada opcional de conductor** (`driver_verifications`: cédula
+ licencia en el bucket privado `driver-documents`): `submit_driver_verification`
/ `review_driver_verification`. Si el owner activa
`platform_config.require_reinforced_driver_verification`, el trigger
`enforce_driver_verification` **bloquea publicar viajes** sin la verificación
`aprobado`. Bandeja: `app/admin/identity`.

### Privacidad y datos

- `profiles.profile_visibility` (`publico|oculto`): `get_public_profile` lo
  respeta (un perfil oculto solo lo ven admin y compañeros de viaje confirmado);
  no toca `profiles_select` para no romper los joins de viajes/reservas.
- `export_my_data()` (**security invoker**: solo lo que la RLS del propio usuario
  permite) devuelve todos sus datos en un jsonb (portabilidad).
- **Eliminar cuenta**: Edge Function `delete-account` (verify_jwt) → RPC
  `admin_delete_account` (anonimiza, solo `service_role`) + Admin API borra
  `auth.users` (cascada sobre `profiles`). Contacto de emergencia, visibilidad,
  export y borrado viven en `PrivacySecurityScreen` (`app/privacy`).

### Anti-abuso

- `redeem_item` endurecido: máx. 5 canjes/24 h y no repetir el mismo beneficio
  antes de 24 h (evita farmear stock/descuentos).
- **`device_token_seen`** (bitácora de solo-inserción que alimenta
  `register_push_token`): `list_duplicate_account_signals` (**owner**) marca los
  dispositivos donde iniciaron sesión varias cuentas (señal de duplicados).

### Grants y RLS

Los RPC de cliente van a `authenticated`; los helpers usados dentro de políticas
(`can_moderate`, `are_blocked`, `is_active_account`, `contains_blocked_word`,
`can_send_message`) y `get_live_share` se conceden también a `anon` (mismo patrón
que `is_admin`/`can_publish`). `admin_delete_account` solo a `service_role`. Las
tablas nuevas tienen SELECT acotado (dueño / `can_moderate` / `is_admin` /
`is_owner`) y **sin políticas de INSERT/UPDATE para clientes salvo `user_blocks`**
(simple, como `ratings`): todo lo demás pasa por las RPC. Buckets privados nuevos
`report-evidence` y `driver-documents` (ruta `<uid>/…`, lectura del dueño +
`can_moderate`), y `credentials` amplía su lectura de solo-admin a `can_moderate`.

### Verificación

`supabase/tests/safety_moderation_test.sql` (patrón transacción + `ROLLBACK`)
cubre end-to-end: compartir en vivo + token público, SOS que avisa a admins,
reporte→suspensión que cierra el reporte y bloquea `reserve_seat`→levantar,
filtro de palabras + `moderate_content`, bloqueo mutuo que impide abrir DM en
ambos sentidos, credencial a revisión→aprobada con vencimiento semestral,
verificación reforzada exigida que gatea publicar, y `export_my_data` +
`get_public_profile` respetando la visibilidad.

## Catálogos aún en constantes

El catálogo de universidades/campus/puntos de encuentro sigue en
`constants/campuses.ts`; se moverá a tablas cuando se priorice la expansión
multi-universidad (backlog del roadmap).

## Plan de migración (ejecutado en Sesión 3)

1. ✅ Proyecto Supabase + migraciones SQL con RLS (`supabase/migrations/`).
2. ✅ Auth real por OTP/magic link con validación de dominio; sesión persistida;
   `UserContext` envuelve la sesión de Supabase.
3. ✅ `services/api/*` reemplazan los CRUD; `useAppState` conserva sus firmas y
   hace write-through + reconcilia con realtime.
4. ✅ `services/penalties.ts` portado a SQL (`cancel_booking` / `expire_overdue_payments`).
5. ✅ Realtime en `trips`/`bookings`.

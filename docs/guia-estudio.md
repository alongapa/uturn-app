# Guía de estudio — Entender el código de Uturn

Esta guía es para leer el proyecto y entenderlo de verdad: qué hace cada carpeta, cómo viaja un dato desde que tocas un botón, qué cambia con Supabase y cómo estudiarlo por etapas.

## 1. La idea general en una frase

La app es una **interfaz (pantallas)** que lee y escribe sobre un **estado (datos en memoria)** a través de **servicios (lógica de negocio)**. Hoy ese estado vive dentro del teléfono; con Supabase pasará a vivir en un servidor Postgres y el teléfono solo lo consulta.

## 2. Mapa de carpetas: qué es y qué pasa dentro

| Carpeta | Qué es | Qué pasa dentro |
|---|---|---|
| `app/` | **Las rutas** (expo-router) | Cada archivo es una URL/pantalla navegable: `app/(tabs)/index.tsx` es el tab Inicio, `app/trip/[id].tsx` es el detalle de un viaje (el `[id]` es un parámetro). Son archivos delgados: casi solo importan la pantalla real desde `screens/`. `_layout.tsx` define la estructura (stack raíz, barra de tabs). |
| `screens/` | **Las pantallas reales** | Aquí vive la interfaz: qué se dibuja, qué pasa al tocar un botón. Ej: `BookingScreen.tsx` (reservar), `PaymentScreen.tsx` (pagar), `RewardsScreen.tsx` (premios). Una pantalla típica: lee datos del store, los muestra, y ante una acción llama a una función del store/servicio. |
| `components/` | **Piezas reutilizables de UI** | Botones, textos con tema, íconos — ladrillos que las pantallas combinan. No tienen lógica de negocio. |
| `store/` | **El estado global** (`appState.tsx`) | La "base de datos en memoria" actual: listas de viajes, reservas, pagos, créditos, y las funciones para modificarlas (`addBooking`, `cancelBooking`, …). Toda pantalla que necesita datos los saca de aquí vía el hook `useAppState`. **Es el archivo más importante para entender el flujo de datos.** |
| `contexts/` | **Sesión del usuario** (`UserContext.tsx`) | Quién está logueado: nombre, email, universidad, rol, vehículo. Separado del resto del estado porque casi todas las pantallas lo necesitan. |
| `services/` | **La lógica de negocio pura** | Funciones sin UI que implementan las reglas: `penalties.ts` (strikes y bloqueos), `payments.ts` (plazos 48h, comisiones), `credits.ts` (saldo y canjes), `matching.ts` (puntuar qué viaje le conviene a un pasajero), `geo.ts` (distancias, rutas), `location.ts` (GPS), `storage.ts` (persistencia local). Se pueden leer como "las reglas del juego" sin saber nada de pantallas. |
| `hooks/` | **Lógica reutilizable de React** | `use-permissions.ts` (qué puede hacer cada rol), `use-theme-color.ts` / `use-color-scheme.ts` (tema claro/oscuro). Un hook es una función que las pantallas usan para "engancharse" a datos o comportamientos. |
| `models/` | **Los tipos de datos** (`types.ts`) | El "diccionario" del dominio: qué campos tiene un `User`, un `Trip`, un `Booking`. TypeScript usa esto para avisarte si usas mal un dato. Leerlo primero hace que todo lo demás se entienda. |
| `constants/` | **Datos fijos** | `campuses.ts` (universidades y coordenadas), `meetingPoints.ts` (puntos de encuentro), `theme.ts` (colores), `mock-data.ts` (datos de ejemplo). |
| `types/` | Tipos auxiliares de TypeScript (complementa `models/`). | |
| `assets/` | Imágenes, íconos, fuentes. | |
| `scripts/` | Utilidades de desarrollo (no van en la app). | |
| `docs/` | Documentación del proyecto: `backend.md` (esquema de datos), `sesiones/` (roadmap), esta guía. | |
| `.agents/skills/` + `.claude/skills/` | Skills de Supabase para los chats de sesión (guías expertas de SQL/RLS). No son código de la app. | |

### El viaje de un dato (ejemplo: reservar un cupo)

1. Tocas "Reservar" en `screens/BookingScreen.tsx` (que llegaste vía la ruta `app/trip/[id].tsx`).
2. La pantalla llama a `addBooking(...)` de `store/appState.tsx`.
3. `appState` consulta las reglas: ¿está bloqueado el usuario? (`services/penalties.ts`), crea el pago con vencimiento a 48 h (`services/payments.ts`).
4. El estado nuevo se guarda localmente (`services/storage.ts` → AsyncStorage) y todas las pantallas que muestran reservas se re-dibujan solas.

Si entiendes ese recorrido, entiendes la app entera: todos los flujos (cancelar, calificar, canjear créditos) siguen el mismo patrón.

## 3. Qué cambia al llevarlo a Supabase (Sesión 3)

| Aspecto | Modelo actual (local) | Con Supabase |
|---|---|---|
| **Dónde viven los datos** | En la memoria del teléfono (`store/appState.tsx`), respaldados en AsyncStorage. Cada teléfono tiene SU copia: dos usuarios no ven lo mismo. | En Postgres (servidor). Todos los teléfonos consultan la misma base: tu viaje publicado lo ve el resto. |
| **Login** | Cosmético: cualquier email con dominio válido entra; no hay contraseña ni verificación. | Real: OTP/magic link al correo institucional — hay que controlar ese email para entrar. Sesión con tokens que se renuevan. |
| **Reglas de negocio** (48h, strikes, saldos) | Corren en el teléfono al abrir la app. Si no abres la app, no pasan; y un cliente modificado podría saltárselas. | Corren en el servidor (funciones SQL + tareas programadas). El strike a las 48 h cae aunque nadie abra la app, y nadie puede editarse el saldo. |
| **Seguridad** | `usePermissions` decide qué mostrar — pero es solo visual. | Row Level Security: la base de datos misma rechaza lo que tu rol no permite, sin importar qué haga el cliente. |
| **Imágenes** (foto de perfil, credencial) | URIs locales del teléfono. | Supabase Storage: se suben y se sirven con URLs (privadas para credenciales). |
| **Tiempo real** | No existe: hay que recargar. | Realtime: el conductor ve entrar reservas al instante; el chat (Sesión 6) es en vivo. |
| **AsyncStorage** | Fuente de verdad. | Baja a caché: acelera la app y da soporte offline básico, pero manda Postgres. |
| **Estructura del repo** | Todo el CRUD dentro de `store/appState.tsx`. | Aparecen `supabase/migrations/` (el esquema SQL versionado), `supabase/functions/` (lógica de servidor), `services/supabase.ts` (conexión) y `services/api/*` (un servicio por dominio: trips, payments, credits…). Las **pantallas casi no cambian**: siguen llamando funciones con las mismas firmas, solo que ahora esas funciones hablan con el servidor. |

**Lo que NO cambia**: React Native, Expo, expo-router, las pantallas, los componentes, los tipos de `models/`. Supabase reemplaza la "base de datos" y la lógica crítica, no la app.

## 4. ¿Sigo necesitando Expo Go?

**Sí, por ahora — Supabase no cambia nada de esto.** `@supabase/supabase-js` es una librería JavaScript normal que habla HTTPS: funciona perfecto dentro de Expo Go. Podrás desarrollar y probar las Sesiones 3–6 (backend, feed, admin, mensajes) igual que hasta ahora: `npx expo start` + escanear el QR.

Los límites llegan después:

- **Sesión 7 (notificaciones push)**: Expo Go ya no soporta push remotas en Android — necesitarás una **development build** (`eas build --profile development`), que es tu propia versión de "Expo Go" con tu app dentro. Se instala una vez y se sigue desarrollando igual (recarga en caliente incluida).
- **Sesión 10 (tiendas)**: para publicar en App Store/Play Store siempre se usan builds de EAS; Expo Go nunca fue el vehículo de publicación.

Resumen: **Expo Go hasta la Sesión 6 inclusive; development build desde la Sesión 7**.

## 5. Plan de estudio por etapas

Cada etapa tiene lectura + un ejercicio práctico. Orden pensado para que cada cosa apoye la siguiente.

### Etapa 1 — El lenguaje de la app (React Native + TypeScript)
- **Lee**: `models/types.ts` (el diccionario del dominio) y una pantalla simple como `screens/RateScreen.tsx`: identifica el estado (`useState`), el render (JSX) y los estilos (`StyleSheet`).
- **Concepto clave**: un componente = función que recibe datos y devuelve interfaz; cuando el estado cambia, se re-dibuja.
- **Ejercicio**: cambia un color en `constants/theme.ts` y un texto en una pantalla; míralo en Expo Go.

### Etapa 2 — Navegación (expo-router)
- **Lee**: `app/_layout.tsx`, `app/(tabs)/_layout.tsx` y compara `app/trip/[id].tsx` con `screens/TripDetailScreen.tsx`.
- **Concepto clave**: la estructura de carpetas de `app/` ES el mapa de navegación; `[id]` = parámetro dinámico.
- **Ejercicio**: agrega una pantalla `app/acerca.tsx` con un texto y navega a ella con `router.push('/acerca')` desde un botón.

### Etapa 3 — El estado global (la parte más importante)
- **Lee**: `contexts/UserContext.tsx` (corto) y luego `store/appState.tsx` con calma: los tipos arriba, las funciones de escritura (`addBooking`, `cancelBooking`), y cómo `services/storage.ts` lo persiste.
- **Sigue el flujo completo**: reservar un cupo desde `BookingScreen` hasta que aparece en `MyTripsScreen` (sección 2 de esta guía).
- **Ejercicio**: agrega un campo nuevo a `User` en `models/types.ts` (ej. `apodo`), muéstralo en `ProfileScreen` y hazlo editable.

### Etapa 4 — La lógica de negocio (services/)
- **Lee**: `services/penalties.ts` (reglas de strikes — se lee como un reglamento), `services/payments.ts` (48h, comisiones), `services/credits.ts`, y al final `services/matching.ts` con `services/geo.ts` (el más matemático: cómo se puntúa qué viaje te conviene).
- **Concepto clave**: esta lógica no sabe nada de pantallas — por eso en la Sesión 3 se puede portar a SQL casi 1:1.
- **Ejercicio**: cambia la comisión o el umbral de strikes y verifica el efecto en la app.

### Etapa 5 — Supabase (antes de la Sesión 3)
- **Lee**: `docs/backend.md` (el esquema que se va a crear) comparándolo con `models/types.ts` — verás que cada tipo se convierte en una tabla.
- **Aprende los 5 conceptos**: tabla y relación (foreign key) → migración (cambio de esquema versionado) → RLS (quién puede leer/escribir cada fila) → función de servidor/trigger (lógica que corre en la base) → Storage (archivos).
- **Práctica**: en tu proyecto de supabase.com, abre el **Table Editor** y el **SQL Editor**; crea una tabla de juguete, insértale filas con SQL, actívale RLS y comprueba que sin política no puedes leerla desde la API.
- Después de la Sesión 3, abre `supabase/migrations/` y lee el SQL generado comparándolo con `docs/backend.md`.

### Etapa 6 — El flujo de trabajo (git + sesiones)
- **Lee**: `ROADMAP.md` (flujo de git) y mira el historial: `git log --oneline --graph` — verás las ramas `sesion/XX` fusionadas a `main`.
- **Concepto clave**: rama = borrador aislado; merge = incorporar el borrador aprobado; `main` siempre funciona.
- **Ejercicio**: crea una rama, cambia algo trivial, fusiónala a `main` y pushea — el mismo ciclo que hacen los chats de sesión.

### Cómo estudiar cada sesión que ejecuten los chats
Al terminar una sesión, antes de abrir la siguiente: (1) mira el diff en GitHub (pestaña de commits de `main`), (2) identifica qué carpeta tocó y por qué, (3) corre la app y usa la funcionalidad nueva, (4) pregunta en un chat cualquier cosa del diff que no entiendas. Es la manera más rápida de aprender: código nuevo en porciones pequeñas sobre una base que ya conoces.

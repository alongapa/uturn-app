# Roadmap Uturn — Plan de trabajo por sesiones

Uturn es la app universitaria que combina **carpooling con turnos y pagos**, un **feed social** (federaciones, departamentos, centros de alumnos), **mensajería/tutorías**, un **perfil con créditos y canjeos**, y un **panel de administración** para federaciones y marcas.

Este documento divide el desarrollo en **11 sesiones de trabajo ordenadas por dependencias**. Cada sesión está pensada para abrirse en un chat nuevo e independiente: su archivo en `docs/sesiones/` incluye el estado actual del repo, mejoras, lo que falta, criterios de aceptación y un **prompt listo para pegar** al inicio del chat.

## Estado actual del repositorio

Stack: **Expo ~54 · React Native 0.81 · expo-router 6 · TypeScript · react-native-paper · react-native-maps**. Las Sesiones 0–2 están completadas con estado local (`store/appState.tsx` + `contexts/UserContext.tsx` persistido en AsyncStorage). **El proyecto Supabase ya está creado**: la Sesión 3 migra todo a él y desde ahí cada módulo se construye directamente sobre Supabase.

| Módulo | Avance | Estado |
|---|---|---|
| Fundaciones (roles, persistencia, limpieza) | ✅ Sesión 0 | Hecho: roles `user/tutor/admin/owner`, `usePermissions`, AsyncStorage, penalizaciones unificadas, `docs/backend.md` |
| Turnos / Carpooling | ✅ Sesión 1 | Hecho (local): pagos con plazo 48h, strikes por impago, comisiones, reputación con rachas |
| Perfil Uturn | ✅ Sesión 2 | Hecho (local): créditos, canjes, perfil renovado, configuración |
| Backend Supabase | ✅ Sesión 3 (en revisión) | Migrado: auth OTP, Postgres + RLS, funciones de servidor (48 h/strikes/créditos), Storage y realtime |
| Inicio / Feed | 0% → Sesión 4 | Publicaciones, historias, widgets de eventos, carretes, activaciones, descuentos |
| Perfil Administrador | 0% → Sesión 5 | Widgets, carpetas de contenido, marcas, aprobación de canjeos por owner |
| Mensajes | 0% → Sesión 6 | DMs realtime, soporte, tutores, Q&A por temas |

## Orden de sesiones

### Fase 1 — MVP local (✅ completada)

| # | Sesión | Documento | Estado |
|---|---|---|---|
| 0 | Fundaciones y limpieza | [docs/sesiones/00-fundaciones.md](docs/sesiones/00-fundaciones.md) | ✅ Hecha |
| 1 | Turnos / Carpooling: pagos, strikes y reputación | [docs/sesiones/01-turnos-carpooling.md](docs/sesiones/01-turnos-carpooling.md) | ✅ Hecha |
| 2 | Perfil Uturn: créditos, canjeos y gestión de cuenta | [docs/sesiones/02-perfil-uturn.md](docs/sesiones/02-perfil-uturn.md) | ✅ Hecha |

### Fase 2 — Todo sobre Supabase

| # | Sesión | Documento | Depende de |
|---|---|---|---|
| 3 | **Migración a Supabase**: auth, datos y storage | [docs/sesiones/03-migracion-supabase.md](docs/sesiones/03-migracion-supabase.md) | 0–2 |
| 4 | Inicio / Feed: publicaciones, historias y widgets | [docs/sesiones/04-inicio-feed.md](docs/sesiones/04-inicio-feed.md) | 3 |
| 5 | Perfil Administrador | [docs/sesiones/05-perfil-administrador.md](docs/sesiones/05-perfil-administrador.md) | 3, 4 |
| 6 | Mensajes, tutores y Q&A (realtime) | [docs/sesiones/06-mensajes.md](docs/sesiones/06-mensajes.md) | 3 |
| 7 | Notificaciones push, centro de notificaciones y deep links | [docs/sesiones/07-notificaciones-realtime.md](docs/sesiones/07-notificaciones-realtime.md) | 3–6 |
| 8 | Pagos avanzados: pasarela, verificación automática y liquidaciones | [docs/sesiones/08-pagos-avanzados.md](docs/sesiones/08-pagos-avanzados.md) | 1, 2, 3, 7 |
| 9 | Seguridad, confianza y moderación | [docs/sesiones/09-seguridad-moderacion.md](docs/sesiones/09-seguridad-moderacion.md) | 3–6 (mejor con 7) |
| 10 | Calidad, onboarding y lanzamiento a tiendas | [docs/sesiones/10-calidad-lanzamiento.md](docs/sesiones/10-calidad-lanzamiento.md) | 0–9 |

### Por qué este orden

1. **Sesiones 0–2 (hechas)**: fundaciones, el corazón del negocio (carpooling con pagos/strikes) y el perfil con créditos, todo funcionando localmente como prototipo validable.
2. **Sesión 3 (Supabase) es la bisagra**: migra lo ya construido a un backend real — auth verdadera, plazos de 48 h y strikes ejecutados en el servidor (imposibles de burlar), datos compartidos entre usuarios. Va **antes** de feed/admin/mensajes para que esos módulos nazcan sobre Supabase (tablas, RLS, Storage, Realtime) en vez de programarse dos veces.
3. **Sesión 4 (Feed)**: introduce las entidades publicadoras (federaciones, centros de alumnos) sobre las que se monta el panel admin; la restricción de quién publica es una política RLS real.
4. **Sesión 5 (Admin)**: escribe en las tablas del feed (4) y postula canjeos contra los créditos migrados (3), con aprobación del owner ejecutada en el servidor.
5. **Sesión 6 (Mensajes)**: nace realtime sobre Supabase; solo necesita la base (3), por eso puede ir en paralelo conceptual con 4–5.
6. **Sesiones 7–10**: push que hace cumplir los plazos (7), dinero verificado automáticamente (8), seguridad y moderación (9), y calidad/lanzamiento a tiendas (10).

## Backlog — ideas post-lanzamiento (sin sesión asignada)

Para priorizar según lo que pida la comunidad una vez lanzada la app:

- **Expansión multi-universidad**: alta de nuevas universidades sin tocar código (dominios de email, campus y puntos de encuentro como datos, no constantes), federaciones por universidad y feed segmentado por campus.
- **Crecimiento**: programa de referidos con créditos, gamificación extendida (ranking por campus, desafíos semanales), compartir posts/viajes fuera de la app con deep links públicos.
- **Carpooling avanzado**: viajes recurrentes con suscripción semanal, grupos de confianza (solo mi carrera/mis contactos), preferencias de viaje (música, mascotas, solo mujeres), optimización de rutas multi-parada.
- **Marketplace estudiantil**: compraventa entre alumnos (apuntes, entradas, artículos), integrado a créditos y reputación.
- **Integraciones académicas**: calendario de la universidad (pruebas, feriados) alimentando el widget semanal, horario personal para sugerir turnos automáticamente.
- **Web companion**: panel web para admins/owner (gestionar contenido y moderación es más cómodo en desktop; `react-native-web` ya está en el proyecto).

## Cómo usar este roadmap

1. Abre un chat nuevo por sesión.
2. Copia el bloque **"Prompt para iniciar la sesión"** del archivo correspondiente en `docs/sesiones/` y pégalo como primer mensaje.
3. La sesión termina fusionando su rama a `main` y pusheando (ver flujo abajo); abre el chat siguiente solo cuando `main` quedó actualizado.
4. Actualiza la tabla de avance de este archivo y marca los criterios de aceptación cumplidos en el documento de la sesión.

Las **skills oficiales de Supabase** están instaladas en `.agents/skills/` (`supabase` y `supabase-postgres-best-practices`, enlazadas también en `.claude/skills/`): los chats de sesión las usan al escribir migraciones, RLS y Edge Functions.

Para trabajar desde tu terminal local con el MCP de Supabase conectado (Claude aplica las migraciones y corrige el SQL él mismo, sin pegar SQL a mano), sigue **[docs/setup-local.md](docs/setup-local.md)**. El `.mcp.json` del repo ya trae el proyecto configurado; solo autenticas con `claude /mcp`.

### Flujo de git por sesión

Las sesiones son secuenciales y dependientes, así que cada una debe quedar integrada en `main` antes de empezar la siguiente:

1. **Rama por sesión**: cada sesión parte de `main` actualizado y trabaja en su propia rama `sesion/XX-nombre` (ej. `sesion/03-migracion-supabase`). Los prompts ya incluyen esta instrucción.
2. **Al terminar**: la propia sesión verifica `npm test` y sus criterios de aceptación, hace commit, **fusiona la rama a `main` y pushea `main` y la rama**.
3. **Si algo falla** (`npm test` en rojo o criterios a medias): la sesión **no fusiona** — pushea solo su rama y reporta el problema para que decidas (arreglar en la misma rama o descartarla y repetir en una nueva).
4. **Regla de oro**: `main` siempre queda funcionando — `npm test` en verde y la app arrancando.
5. **Secretos**: la URL y las claves de Supabase van en `.env` (ignorado por git) y en variables de entorno de EAS; nunca se commitean.

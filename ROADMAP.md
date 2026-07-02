# Roadmap Uturn — Plan de trabajo por sesiones

Uturn es la app universitaria que combina **carpooling con turnos y pagos**, un **feed social** (federaciones, departamentos, centros de alumnos), **mensajería/tutorías**, un **perfil con créditos y canjeos**, y un **panel de administración** para federaciones y marcas.

Este documento divide el desarrollo en **6 sesiones de trabajo ordenadas por dependencias**. Cada sesión está pensada para abrirse en un chat nuevo e independiente: su archivo en `docs/sesiones/` incluye el estado actual del repo, mejoras, lo que falta, criterios de aceptación y un **prompt listo para pegar** al inicio del chat.

## Estado actual del repositorio

Stack: **Expo ~54 · React Native 0.81 · expo-router 6 · TypeScript · react-native-paper · react-native-maps**. Sin backend ni persistencia: todo vive en memoria (`store/appState.tsx`, `contexts/UserContext.tsx`) con datos mock, y se pierde al recargar.

| Módulo | Avance | Qué existe | Qué falta |
|---|---|---|---|
| Turnos / Carpooling | ~70% | Crear/buscar/reservar viajes, matching por ruta (`services/matching.ts`), mapas y puntos de encuentro, calificación, gestión de pasajeros, bloqueos por cancelación tardía | Pago real con plazo 48h, comisiones, strikes/baneo por impago, reputación conectada a datos reales (rachas) |
| Perfil Uturn | ~40% | Edición de cuenta, verificación de credencial con captura de intranet, tab Premios (niveles/insignias, solo visual) | Créditos Uturn, canjeos, vista semanal de eventos/canjeables, viajes por pagar/pagados, configuración, subida de foto |
| Inicio / Feed | 0% | Nada (el tab "Inicio" actual es un selector conductor/pasajero) | Todo: publicaciones, historias, widgets de eventos, carretes, activaciones, descuentos |
| Perfil Administrador | 0% | Nada (roles solo `driver`/`rider` en `models/types.ts`) | Todo: widgets, carpetas de contenido, marcas, promociones, aprobación de canjeos por owner |
| Mensajes | 0% | Nada | Todo: DMs, comunidad, soporte, tutores, Q&A por temas |

Deuda técnica transversal: archivos `.js` duplicados de casi todo el código `.tsx/.ts`, carpeta `uturn/` con el template de Expo sin usar, `api.ts`/`api.js` muertos en la raíz, dos implementaciones divergentes de penalizaciones, auth cosmética (solo valida dominio de email), fechas mock fijadas en octubre 2024.

## Orden de sesiones

### Fase 1 — MVP funcional (datos locales)

| # | Sesión | Documento | Depende de |
|---|---|---|---|
| 0 | Fundaciones y limpieza | [docs/sesiones/00-fundaciones.md](docs/sesiones/00-fundaciones.md) | — |
| 1 | Turnos / Carpooling: pagos, strikes y reputación | [docs/sesiones/01-turnos-carpooling.md](docs/sesiones/01-turnos-carpooling.md) | 0 |
| 2 | Perfil Uturn: créditos, canjeos y gestión de cuenta | [docs/sesiones/02-perfil-uturn.md](docs/sesiones/02-perfil-uturn.md) | 0, 1 |
| 3 | Inicio / Feed: publicaciones, historias y widgets | [docs/sesiones/03-inicio-feed.md](docs/sesiones/03-inicio-feed.md) | 0 |
| 4 | Perfil Administrador | [docs/sesiones/04-perfil-administrador.md](docs/sesiones/04-perfil-administrador.md) | 0, 2, 3 |
| 5 | Mensajes, tutores y Q&A | [docs/sesiones/05-mensajes.md](docs/sesiones/05-mensajes.md) | 0 |

### Fase 2 — Producto real y lanzamiento

| # | Sesión | Documento | Depende de |
|---|---|---|---|
| 6 | Backend real (Supabase): auth, datos y storage | [docs/sesiones/06-backend.md](docs/sesiones/06-backend.md) | 0–5 |
| 7 | Notificaciones push y tiempo real | [docs/sesiones/07-notificaciones-realtime.md](docs/sesiones/07-notificaciones-realtime.md) | 6 |
| 8 | Pagos avanzados: pasarela, verificación automática y liquidaciones | [docs/sesiones/08-pagos-avanzados.md](docs/sesiones/08-pagos-avanzados.md) | 1, 2, 6, 7 |
| 9 | Seguridad, confianza y moderación | [docs/sesiones/09-seguridad-moderacion.md](docs/sesiones/09-seguridad-moderacion.md) | 0–6 (mejor con 7) |
| 10 | Calidad, onboarding y lanzamiento a tiendas | [docs/sesiones/10-calidad-lanzamiento.md](docs/sesiones/10-calidad-lanzamiento.md) | 0–9 |

La Fase 1 deja la app completa funcionando con datos locales en un dispositivo. La Fase 2 la convierte en producto: usuarios reales compartiendo datos (6), avisos que hacen cumplir los plazos de 48 h (7), dinero verificado automáticamente (8), seguridad para subirse al auto de un desconocido (9) y salida a las tiendas (10).

### Por qué este orden

1. **Sesión 0 primero**: la limpieza de duplicados, el sistema de roles (`user | tutor | admin | owner`) y la persistencia son prerrequisitos de todos los módulos. Hacerlo antes evita que cada sesión lo re-resuelva a su manera.
2. **Sesión 1 (Carpooling)**: es el módulo más avanzado y el corazón de la app; cerrarlo (pagos, strikes, reputación) genera los datos que consumen el perfil y los créditos.
3. **Sesión 2 (Perfil)**: los créditos y los estados de viajes por pagar/pagados dependen del flujo de pagos de la Sesión 1.
4. **Sesión 3 (Feed)**: introduce las entidades publicadoras (federaciones, departamentos, centros de alumnos) sobre las que se monta el panel admin.
5. **Sesión 4 (Admin)**: publica al feed (Sesión 3) y postula canjeos de créditos (Sesión 2), por eso va después de ambas.
6. **Sesión 5 (Mensajes)**: solo necesita los roles de la Sesión 0; es la más independiente y por eso cierra el ciclo.

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
3. Al terminar la sesión, revisa y fusiona su Pull Request a `main` (ver flujo abajo) **antes** de abrir el chat de la sesión siguiente.
4. Actualiza la tabla de avance de este archivo y marca los criterios de aceptación cumplidos en el documento de la sesión.

### Flujo de git por sesión

Las sesiones son secuenciales y dependientes, así que cada una debe quedar integrada en `main` antes de empezar la siguiente:

1. **Rama por sesión**: cada sesión parte de `main` actualizado y trabaja en su propia rama `sesion/XX-nombre` (ej. `sesion/01-turnos`). Los prompts ya incluyen esta instrucción.
2. **Al terminar**: commit, push y **Pull Request hacia `main`** (nunca push directo a `main`).
3. **Antes de fusionar**: revisar el diff del PR y probar la app; el PR se fusiona solo cuando la sesión cumple sus criterios de aceptación.
4. **Regla de oro**: `main` siempre queda funcionando — `npm test` en verde y la app arrancando. Si una sesión sale mal, se cierra el PR sin fusionar y se repite en una rama nueva, sin ensuciar `main`.

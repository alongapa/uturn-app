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

| # | Sesión | Documento | Depende de |
|---|---|---|---|
| 0 | Fundaciones y limpieza | [docs/sesiones/00-fundaciones.md](docs/sesiones/00-fundaciones.md) | — |
| 1 | Turnos / Carpooling: pagos, strikes y reputación | [docs/sesiones/01-turnos-carpooling.md](docs/sesiones/01-turnos-carpooling.md) | 0 |
| 2 | Perfil Uturn: créditos, canjeos y gestión de cuenta | [docs/sesiones/02-perfil-uturn.md](docs/sesiones/02-perfil-uturn.md) | 0, 1 |
| 3 | Inicio / Feed: publicaciones, historias y widgets | [docs/sesiones/03-inicio-feed.md](docs/sesiones/03-inicio-feed.md) | 0 |
| 4 | Perfil Administrador | [docs/sesiones/04-perfil-administrador.md](docs/sesiones/04-perfil-administrador.md) | 0, 2, 3 |
| 5 | Mensajes, tutores y Q&A | [docs/sesiones/05-mensajes.md](docs/sesiones/05-mensajes.md) | 0 |

### Por qué este orden

1. **Sesión 0 primero**: la limpieza de duplicados, el sistema de roles (`user | tutor | admin | owner`) y la persistencia son prerrequisitos de todos los módulos. Hacerlo antes evita que cada sesión lo re-resuelva a su manera.
2. **Sesión 1 (Carpooling)**: es el módulo más avanzado y el corazón de la app; cerrarlo (pagos, strikes, reputación) genera los datos que consumen el perfil y los créditos.
3. **Sesión 2 (Perfil)**: los créditos y los estados de viajes por pagar/pagados dependen del flujo de pagos de la Sesión 1.
4. **Sesión 3 (Feed)**: introduce las entidades publicadoras (federaciones, departamentos, centros de alumnos) sobre las que se monta el panel admin.
5. **Sesión 4 (Admin)**: publica al feed (Sesión 3) y postula canjeos de créditos (Sesión 2), por eso va después de ambas.
6. **Sesión 5 (Mensajes)**: solo necesita los roles de la Sesión 0; es la más independiente y por eso cierra el ciclo.

## Cómo usar este roadmap

1. Abre un chat nuevo por sesión.
2. Copia el bloque **"Prompt para iniciar la sesión"** del archivo correspondiente en `docs/sesiones/` y pégalo como primer mensaje.
3. Al terminar cada sesión, actualiza la tabla de avance de este archivo y marca los criterios de aceptación cumplidos en el documento de la sesión.

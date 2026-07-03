# Sesión 0 — Fundaciones y limpieza

## Objetivo
Dejar la base del código limpia y preparada para los 5 módulos: un solo árbol de fuentes TypeScript, sistema de roles completo (`user | tutor | admin | owner`), persistencia de estado y una decisión de backend documentada.

## Ya integrado en el repo
- Proyecto Expo ~54 + expo-router 6 + TypeScript funcionando (`app/`, `package.json`), con `npm test` = lint + typecheck.
- Estado global en React Context: `contexts/UserContext.tsx` (usuario) y `store/appState.tsx` (viajes, reservas, premios).
- Tipos base en `models/types.ts` (con `Role = 'driver' | 'rider'`).
- Servicio de penalizaciones limpio pero sin conectar: `services/penalties.ts`.
- Login con validación de dominio institucional (`screens/LoginScreen.tsx`: `@alumnos.uai.cl`, `@udd.cl`, `@miuandes.cl`) y verificación de credencial (`screens/CredentialVerificationScreen.tsx`).

## Mejoras sobre lo existente
- **Unificar penalizaciones**: `store/appState.tsx` (líneas ~381–482) reimplementa las reglas de bloqueo por cancelación tardía con umbrales distintos a `services/penalties.ts` (3/6/9 → 1/3/7 días). Dejar `services/penalties.ts` como única fuente y que `appState` lo consuma.
- **Roles como jerarquía de permisos**: separar el rol de permisos (`user | tutor | admin | owner`) del modo de uso del carpooling (conductor/pasajero), que hoy está mezclado en `Role`.
- Actualizar fechas mock (hoy fijadas a octubre 2024 en `constants/mock-data.ts` y `store/appState.tsx`) a fechas relativas al día actual.

## Falta por construir
1. **Limpieza de código muerto**:
   - Borrar los duplicados `.js` compilados de `screens/`, `store/`, `contexts/`, `services/`, `models/`, `constants/` (los `.ts/.tsx` son los canónicos).
   - Borrar la carpeta `uturn/` (template de create-expo-app sin usar), `api.ts`/`api.js` de la raíz (mock API nunca importada), `App.js`/`App.tsx` de la raíz (la entrada real es `expo-router/entry`) y `screens/prototip`/`app/prototip.tsx` si duplica ProfileScreen.
2. **Sistema de roles**: nuevo tipo `AccountRole = 'user' | 'tutor' | 'admin' | 'owner'` en `models/types.ts`, campo en `User`, helpers de autorización (`canPublish`, `canApprove`, etc.) y un hook `usePermissions`.
3. **Persistencia**: instalar `@react-native-async-storage/async-storage` y persistir `UserContext` + `appState` (hidratar al arrancar). Es el puente hasta tener backend.
4. **Decisión de backend**: documentar en `docs/backend.md` la elección (recomendado: **Supabase** — auth con email institucional, Postgres, storage para imágenes, realtime para mensajes) y el esquema tentativo de tablas por módulo. No implementar aún.

## Entregables / criterios de aceptación
- [ ] `npm test` (lint + typecheck) pasa sin los archivos `.js` duplicados ni `uturn/`.
- [ ] Un solo módulo de penalizaciones (`services/penalties.ts`) usado por `appState`, con las reglas 3/6/9 strikes → 1/3/7 días.
- [ ] `User` tiene `accountRole` y existe `usePermissions`; el login asigna `user` por defecto.
- [ ] Cerrar la app y reabrirla conserva sesión, viajes y reservas (AsyncStorage).
- [ ] `docs/backend.md` con la decisión y el esquema de datos.

## Dependencias
Ninguna. Es la primera sesión.

## Prompt para iniciar la sesión

```text
Estoy trabajando en Uturn (repo uturn-app), una app universitaria en Expo ~54 + expo-router 6 + TypeScript. Esta es la Sesión 0 del roadmap (ver ROADMAP.md y docs/sesiones/00-fundaciones.md). Trabaja en una rama nueva sesion/00-fundaciones creada desde main actualizado.

Contexto: todo el estado es mock en memoria (store/appState.tsx, contexts/UserContext.tsx), casi todos los .tsx tienen un duplicado .js compilado, hay una carpeta uturn/ con el template de Expo sin usar y un api.ts muerto en la raíz. Hay dos implementaciones divergentes de penalizaciones (store/appState.tsx líneas ~381-482 vs services/penalties.ts). Los roles son solo 'driver' | 'rider' (models/types.ts).

Tareas de esta sesión:
1. Borrar código muerto: duplicados .js, carpeta uturn/, api.ts/api.js, App.js/App.tsx de la raíz, prototip. Verificar que npm test sigue pasando.
2. Unificar penalizaciones: que appState consuma services/penalties.ts (reglas 3/6/9 cancelaciones tardías → bloqueo 1/3/7 días).
3. Sistema de roles: AccountRole = 'user' | 'tutor' | 'admin' | 'owner' en models/types.ts, separado del modo conductor/pasajero; hook usePermissions con helpers de autorización.
4. Persistencia con @react-native-async-storage/async-storage para UserContext y appState (hidratar al arrancar).
5. Crear docs/backend.md documentando la elección de backend (recomendación: Supabase) y esquema tentativo de tablas.

No implementes features de otros módulos (feed, mensajes, pagos, créditos): solo fundaciones. Al terminar, verifica que npm test pasa, haz commit y push de la rama, fusiónala a main y pushea también main; si npm test falla o algo queda a medias, no fusiones: pushea solo la rama y repórtame el problema.
```

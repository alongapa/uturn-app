# Sesión DM híbrido — anti-bullying

## Objetivo
Restringir los mensajes directos para eliminar el bullying sin perder la coordinación de viajes: **un alumno solo puede abrir un DM si (a) comparte un viaje confirmado con la otra persona, o (b) la contraparte es `tutor`/`admin`/`owner`.** Cero DM libre alumno↔alumno.

## Ya integrado en el repo
- Mensajería completa (Sesión 6): `conversations`/`conversation_members`/`messages`, RPC `start_dm`, RLS por miembros, chat realtime.
- Carpooling con `bookings` en estado confirmado (Sesiones 1–3).
- "Mensaje al conductor" desde el detalle del viaje (Sesión 6) — encaja con la condición (a).

## Decisión cerrada (Plan Maestro §2.1 — Opción C híbrida)
DM permitido solo si:
1. Existe un `booking` **confirmado** que une a ambos `profile_id` en el mismo `trip` (cualquier dirección conductor↔pasajero), **o**
2. Al menos uno de los dos tiene `account_role` en (`tutor`,`admin`,`owner`).

## Falta por construir
1. Modificar el RPC `start_dm` para validar server-side una de las dos condiciones antes de crear la conversación.
2. Endurecer la RLS de `conversations`/`messages` con la misma condición (que no se pueda crear un DM por fuera del RPC).
3. Reutilizar el "Mensaje al conductor" del detalle de viaje (condición a).
4. Composer "nuevo mensaje": al buscar personas, listar **solo** cuentas oficiales/tutores + compañeros de viajes confirmados. No exponer al resto del alumnado.

## Entregables / criterios de aceptación
- [ ] Dos alumnos sin viaje común NO pueden abrir DM (probado por SQL impersonando cuentas).
- [ ] Con un `booking` confirmado que los une, SÍ pueden.
- [ ] Alumno↔tutor/admin/owner SÍ.
- [ ] El composer no lista al alumnado general.
- [ ] Migraciones versionadas + `docs/backend.md`; `npm test` pasa.

## Dependencias
Sesión 6 (mensajería) y carpooling (bookings). Ideal después de Navegación.

## Prompt para iniciar la sesión

```text
Trabajo en Unities (Uturn), RN/Expo + Supabase. Roles: owner/admin/tutor/user. Esta sesión es DM híbrido (anti-bullying). Rama nueva sesion/dm-hibrido desde main actualizado. Usa las skills de Supabase (.agents/skills/*) para SQL/RLS.
Regla: un alumno solo abre DM si (a) comparte un booking CONFIRMADO con la otra persona en el mismo trip (cualquier dirección), O (b) la contraparte es tutor/admin/owner. Cero DM libre alumno↔alumno.
1. Modifica el RPC start_dm para validar server-side una de esas dos condiciones antes de crear la conversación.
2. Endurece la RLS de conversations/messages con la misma condición (que no se cree por fuera del RPC).
3. Reutiliza el "Mensaje al conductor" del detalle de viaje.
4. Composer "nuevo mensaje": lista SOLO cuentas oficiales/tutores + compañeros de viaje confirmado; no expongas al resto del alumnado.
Verifica por SQL impersonando cuentas (dos alumnos sin viaje común NO; con booking confirmado SÍ; alumno↔tutor SÍ). Corre npm test. Al terminar: commit y push; fusiona a main y pushea; si falla, no fusiones y repórtame. Dame las decisiones tomadas.
```

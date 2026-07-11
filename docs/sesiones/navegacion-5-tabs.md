# Sesión Navegación — 5 tabs

## Objetivo
Reestructurar la app a los 5 tabs definitivos: **Inicio · Mensajes · Turnos · Tutorías · Perfil**, dividiendo el actual tab "Mensajes" (que hoy mezcla DM + Soporte + Q&A) en tres destinos.

## Ya integrado en el repo
- Sesiones 0–8 en `main`: feed (Inicio), carpooling (Turnos/"Mis viajes"), Mensajes con DM/Soporte/Q&A, perfil con créditos, backend Supabase completo.
- El tab "Mensajes" (Sesión 6) agrupa DM, "Soporte Unities" (`start_support`, tickets pagos/baneos/verificación) y Q&A por temas (topics/questions/guides).

## Decisiones cerradas (Plan Maestro §2.2)
- Tabs finales: Inicio · Mensajes · Turnos · Tutorías · Perfil.
- **Soporte Unities** vive dentro de **Perfil** ("Ayuda / Soporte"), no es tab.
- **Q&A** pasa a un tab nuevo **Tutorías**.
- **DM** se queda en el tab **Mensajes**.
- Sin sub-pestaña de DM dentro de Inicio.

## Falta por construir
1. Ajustar `app/(tabs)/_layout.tsx` a los 5 tabs y sus íconos.
2. Tab Tutorías: nueva pantalla que reúsa el Q&A existente (topics/questions/replies/guides) sin tocar su backend.
3. Perfil: entrada "Ayuda / Soporte" que abre el flujo de soporte existente (`start_support`, estados abierto/resuelto).
4. Tab Mensajes: quitarle Soporte y Q&A; deja solo DM.
5. Mover únicamente navegación y puntos de entrada (`app/(tabs)/`, `screens/`). No cambiar backend, RLS ni pagos.

## Entregables / criterios de aceptación
- [ ] La barra tiene 5 tabs: Inicio · Mensajes · Turnos · Tutorías · Perfil.
- [ ] Q&A accesible desde Tutorías; Soporte desde Perfil; DM desde Mensajes.
- [ ] Ningún backend/RLS modificado; `npm test` pasa.

## Dependencias
Sesiones 4 (feed) y 6 (mensajes/Q&A/soporte). Ideal hacerla **antes** de DM híbrido y Analítica (para instrumentar los tabs finales).

## Prompt para iniciar la sesión

```text
Trabajo en Unities (Uturn), app RN/Expo + Supabase. Roles en profiles.account_role: owner/admin/tutor/user; modelo en docs/backend.md. Esta sesión es Navegación (5 tabs). Rama nueva sesion/navegacion-5-tabs desde main actualizado. No dupliques tablas.
Reestructura a 5 tabs: Inicio · Mensajes · Turnos · Tutorías · Perfil.
1. Inicio = FeedScreen; Turnos = "Mis viajes" (ya existen).
2. Divide el tab "Mensajes" actual (mezcla DM+Soporte+Q&A): DM se queda en Mensajes; Q&A (topics/questions/guides) pasa a un tab nuevo "Tutorías"; Soporte (start_support) pasa a Perfil como "Ayuda / Soporte" (no es tab).
3. Solo mueve navegación y puntos de entrada (app/(tabs)/ + screens); no cambies backend, RLS ni pagos.
Corre npm test. Al terminar: commit y push de la rama; fusiona a main y pushea main; si npm test falla o algo queda a medias, no fusiones: pushea solo la rama y repórtame. Dame la lista de decisiones tomadas.
```

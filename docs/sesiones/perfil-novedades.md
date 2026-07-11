# Sesión Perfil "novedades jóvenes" — gamificación y referidos

## Objetivo
Hacer el perfil atractivo para los jóvenes: gamificación (insignias, niveles), programa de **referidos** con créditos, y una vista previa semanal de canjeables más llamativa.

## Ya integrado en el repo
- Créditos Unities, canjes y configuración (Sesión 2); rachas/streaks, `totalPoints` y reputación (Sesión 1), persistidos en Supabase (Sesión 3).
- Catálogo de canjeables (`redeemables`) migrado y con aprobación del owner (Sesión 5).

## Falta por construir
1. **Gamificación**: insignias por racha de buen pagador y de puntualidad, niveles por puntos — sobre el sistema de `streaks`/`totalPoints` ya existente (no dupliques su lógica).
2. **Referidos**: código por usuario; al registrarse un invitado con correo institucional y completar su **primer viaje pagado**, ambos ganan créditos. Anti-abuso: 1 acreditación por invitado, validada server-side.
3. **Preview semanal de canjeables** más atractiva en Perfil (usa el catálogo ya migrado).

## Entregables / criterios de aceptación
- [ ] Insignias/niveles se muestran y derivan de los datos reales de rachas/puntos.
- [ ] Un referido válido acredita créditos a ambos una sola vez; un `user` no puede auto-acreditarse (probado por SQL).
- [ ] Preview semanal de canjeables visible en Perfil.
- [ ] Migraciones versionadas + `docs/backend.md`; `npm test` pasa.

## Dependencias
Sesiones 1–3 (créditos/rachas) y 5 (canjeables). Idealmente después de Navegación.

## Prompt para iniciar la sesión

```text
Trabajo en Unities (Uturn), RN/Expo + Supabase. Roles: owner/admin/tutor/user. Esta sesión es Perfil "novedades jóvenes" (gamificación + referidos). Rama nueva sesion/perfil-novedades desde main actualizado. Reutiliza créditos/rachas/puntos existentes (Sesiones 1-2); no dupliques su lógica.
1. Gamificación: insignias por racha de buen pagador y de puntualidad, niveles por puntos, sobre streaks/totalPoints existentes.
2. Referidos: código por usuario; al registrarse un invitado con correo institucional y completar su primer viaje pagado, ambos ganan créditos (anti-abuso: 1 por invitado, validado server-side).
3. Preview semanal de canjeables más atractiva (usa redeemables ya migrados).
Todo lo que otorgue créditos/puntos se valida server-side (RLS: el cliente no se auto-acredita). Migraciones versionadas + docs/backend.md. Verifica por SQL que un user no infla créditos ni referidos. Corre npm test. Al terminar: commit y push; fusiona a main y pushea; si falla, no fusiones y repórtame. Dame las decisiones tomadas.
```

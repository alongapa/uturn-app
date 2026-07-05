# Sesión 8 — Pagos avanzados: pasarela, verificación automática y liquidaciones

## Objetivo
Quitar la fricción y el fraude del pago por transferencia manual: integrar una pasarela/verificador de pagos chileno, verificar transferencias automáticamente, cobrar la comisión de Unities en el flujo y liquidar a los conductores. Los strikes por impago pasan a basarse en datos bancarios reales, no en confirmaciones manuales.

## Ya integrado en el repo
- Flujo de pago manual completo (Sesión 1): datos bancarios, plazo 48 h, marcar pagado, confirmación del conductor, strikes/baneos.
- Comisión calculada y desglosada en `PaymentScreen` (Sesión 1); registro por viaje.
- Backend con tabla `payments`, Edge Functions de expiración (Sesión 3) y push de recordatorios (Sesión 7).
- Créditos Unities y canjeos operativos (Sesión 2).

## Mejoras sobre lo existente
- Hoy "pago realizado" es palabra del pasajero y "recibido" palabra del conductor: la verificación automática elimina disputas y hace justos los strikes.
- La comisión hoy es solo informativa: pasar a retenerse en el flujo real de dinero.

## Falta por construir
1. **Elección e integración de proveedor**: evaluar **Fintoc** (verificación de transferencias bancarias, encaja con el flujo actual de datos bancarios), **Mercado Pago** o **Webpay/Transbank** (pago con tarjeta). Recomendado: Fintoc para transferencias verificadas + tarjeta como opción futura. Integración vía Edge Functions con webhooks.
2. **Verificación automática**: al reservar se genera una intención de pago; el webhook del proveedor marca `pagado` automáticamente y dispara el push de confirmación; sin verificación al vencer las 48 h → strike automático (ya existe la función, cambia la fuente de verdad).
3. **Disputas**: flujo "yo sí pagué" con comprobante que congela el strike hasta revisión (bandeja para `admin`/`owner`, enlazada al soporte de la Sesión 5).
4. **Liquidaciones al conductor**: acumulado por conductor (bruto, comisión, neto), historial de liquidaciones y pantalla "Mis ganancias" con exportación simple.
5. **Pagar con créditos**: opción de cubrir parte del viaje con créditos Unities (tasa de conversión configurable por el owner), integrando el saldo de la Sesión 2.
6. **Panel financiero del owner**: comisiones acumuladas, volumen por campus/universidad, morosidad, strikes activos.

## Entregables / criterios de aceptación
- [ ] Un pago real de prueba (sandbox del proveedor) marca la reserva como pagada sin acción del conductor.
- [ ] El impago a las 48 h genera strike usando el estado verificado, no la palabra de las partes.
- [ ] Una disputa con comprobante congela el strike hasta resolución.
- [ ] El conductor ve bruto/comisión/neto y su historial de ganancias.
- [ ] Se puede pagar parte de un viaje con créditos.
- [ ] Webhooks firmados y credenciales en variables de entorno; `npm test` pasa.

## Dependencias
Sesiones 1, 2, 3 y 7. (Sesión 6 para enlazar disputas con soporte.)

## Prompt para iniciar la sesión

```text
Estoy trabajando en Unities (repo uturn-app), app universitaria en Expo + expo-router + TypeScript con backend Supabase. Esta es la Sesión 8 (ROADMAP.md, docs/sesiones/08-pagos-avanzados.md). Ya existen: pago manual por transferencia con plazo 48h y strikes (Sesión 1), créditos/canjeos (Sesión 2), backend con tabla payments y Edge Functions de expiración (Sesión 3) y push (Sesión 7). Trabaja en una rama nueva sesion/08-pagos creada desde main actualizado.

Tareas de esta sesión:
1. Integrar un verificador/pasarela de pagos chileno vía Edge Functions + webhooks (recomendación: Fintoc para verificar transferencias; evalúa alternativas Mercado Pago/Webpay y documenta la elección en docs/backend.md). Sandbox primero.
2. Verificación automática: intención de pago al reservar, webhook marca 'pagado' y dispara push; sin verificación a las 48h → strike automático (cambiar la fuente de verdad de la confirmación manual al webhook).
3. Disputas: flujo "yo sí pagué" con comprobante que congela el strike hasta revisión en una bandeja admin/owner enlazada al soporte.
4. Liquidaciones: pantalla "Mis ganancias" del conductor (bruto, comisión Unities, neto, historial).
5. Pago parcial con créditos Unities (tasa configurable por el owner).
6. Panel financiero del owner: comisiones, volumen por campus, morosidad.

Usa las skills de Supabase instaladas en el repo (.agents/skills/supabase y .agents/skills/supabase-postgres-best-practices) para las Edge Functions y webhooks. Webhooks firmados y credenciales solo en variables de entorno. Al terminar, prueba el ciclo completo en sandbox, verifica que npm test pasa, haz commit y push de la rama, fusiónala a main y pushea también main; si npm test falla o algo queda a medias, no fusiones: pushea solo la rama y repórtame el problema.
```

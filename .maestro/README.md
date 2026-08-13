# Tests E2E con Maestro (Sesión 10)

Recorren los caminos felices sobre la app **ya compilada**, en un emulador o
dispositivo real. No reemplazan a Jest: acá se prueba que las pantallas se
encadenan y que los datos reales del backend llegan, no la lógica de negocio
(esa está cubierta en `__tests__/unit`).

## Requisitos

```bash
# Instalar Maestro (macOS/Linux; en Windows va sobre WSL2)
curl -Ls "https://get.maestro.mobile.dev" | bash

# Un emulador Android o simulador iOS corriendo, con la app instalada.
# Sirve el APK del perfil `preview`:
eas build --profile preview --platform android
adb install unities.apk
```

## Cuenta de prueba y el problema del OTP

Unities entra con **OTP al correo institucional**, y Maestro no puede leer un
correo. La solución no es simular el login: es configurar un **OTP fijo** para
una cuenta de prueba, en el panel de Supabase:

> Authentication → Sign In / Providers → Email → **Test OTPs**

Ahí se registra el par `e2e@alumnos.uai.cl : 12345678` (el código tiene
`OTP_LENGTH` = 8 dígitos, ver `services/api/auth.ts`). Supabase acepta ese
código sin enviar correo, **solo** para esa dirección.

Esa cuenta debe existir con datos sembrados para que los flujos tengan qué
tocar: un viaje reservable publicado por otra persona, créditos suficientes
para un canje y una conversación abierta.

> Nunca uses una cuenta real de un estudiante para esto. El flujo de reserva
> crea reservas de verdad y compromete pagos de verdad.

## Correr los flujos

```bash
maestro test .maestro/flows                      # todos
maestro test .maestro/flows/01-login-reservar-pagar.yaml
maestro studio                                   # inspector interactivo
```

## Por qué los selectores son textos y no testID

La app no tiene `testID` en ninguna pantalla, y agregarlos a las decenas de
componentes que estos flujos tocan sería un cambio grande justo en el cierre,
con riesgo de conflicto con el pulido de UI que corre en paralelo.

Maestro selecciona por texto visible, y toda la interfaz está en español y es
estable. La contra es real y conviene tenerla clara: **si cambia una etiqueta,
el flujo se cae**. Cuando alguna pantalla se vuelva inestable, el arreglo es
ponerle `testID` a *esa* pantalla, no a todas por adelantado.

## Estado

Los flujos están escritos y revisados contra las etiquetas actuales, pero
**no se han ejecutado en verde todavía**: falta el emulador con la build
instalada y la cuenta de prueba sembrada en Supabase. Es el primer paso
pendiente antes del piloto.

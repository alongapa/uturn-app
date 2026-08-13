# Builds, OTA y publicación (Sesión 10)

Cómo se compila, se actualiza y se publica Unities. El CI (`.github/workflows/ci.yml`)
solo corre lint, typecheck y tests: **no** compila ni publica. Las builds se lanzan a mano.

## Perfiles de EAS

`eas.json` define tres, y cada uno usa su propio canal de EAS Update:

| Perfil | Distribución | Android | Para qué |
|---|---|---|---|
| `development` | interna | APK + dev client | Desarrollo con Metro conectado |
| `preview` | interna | APK | Probar la app real sin pasar por la tienda |
| `production` | tienda | AAB | Lo que se sube a Play Store / App Store |

```bash
eas build --profile preview --platform android    # APK instalable desde el link
eas build --profile production --platform all
```

## Android

Funciona sin configuración extra: EAS genera y guarda el keystore en la nube la primera
vez. El APK de `preview` se instala desde el link que imprime la CLI.

## iOS

**Requiere una sesión interactiva**: hay que iniciar sesión con la cuenta de Apple
Developer (con 2FA) y, para distribución interna, registrar el UDID de cada dispositivo.
No se puede hacer en `--non-interactive`:

```bash
eas device:create                                  # registra el dispositivo
eas build --profile preview --platform ios         # sin --non-interactive
```

Antes de la primera subida hay que completar en `eas.json` → `submit.production.ios`
el `ascAppId` y el `appleTeamId`, que hoy dicen `PENDIENTE`.

## Sourcemaps de Sentry

Los tres perfiles llevan `SENTRY_DISABLE_AUTO_UPLOAD=true`, y no es un descuido.

El plugin `@sentry/react-native` agrega al build de Gradle un paso que sube los
sourcemaps a Sentry. Ese paso **falla la build entera** si no encuentra organización,
proyecto y token — que es exactamente lo que pasó en el primer intento de esta sesión:

```
error: An organization ID or slug is required (provide with --org)
FAILURE: Execution failed for task ':app:...SentryUpload...'
```

Como el proyecto de Sentry todavía no existe, la subida queda apagada. Sin sourcemaps
los crashes igual llegan, solo que con el stack trace minificado.

Para activarla, cuando exista el proyecto en Sentry:

1. Agregar la config del plugin en `app.json`:
   ```json
   ["@sentry/react-native", { "organization": "<org>", "project": "unities" }]
   ```
2. Guardar el token como secreto de EAS (nunca en el repo):
   ```bash
   eas secret:create --name SENTRY_AUTH_TOKEN --value <token> --scope project
   ```
3. Quitar `SENTRY_DISABLE_AUTO_UPLOAD` de `eas.json`.

Y poner `EXPO_PUBLIC_SENTRY_DSN` en el entorno de EAS: sin DSN,
`services/monitoring.ts` queda en no-op y no se reporta nada.

## OTA con EAS Update

Configurado con `runtimeVersion.policy = "appVersion"`: una OTA solo llega a las builds
que comparten la misma `version` de `app.json`. Si un cambio toca código nativo (una
dependencia nueva con módulo nativo), **no** se puede entregar por OTA — hay que subir
la versión y compilar de nuevo.

```bash
eas update --branch preview --message "arregla el cálculo del plazo"
eas update --branch production --message "..."
```

## Publicar en las tiendas

```bash
eas submit --profile production --platform android
eas submit --profile production --platform ios
```

Pendiente antes de la primera subida: screenshots, descripciones, clasificación de
contenido, cuentas de revisión para Apple/Google, y publicar `docs/legal/*.md` en una
URL pública para enlazarla desde ambas fichas.

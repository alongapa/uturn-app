# Setup local — Terminal, Supabase MCP y Sesión 3

Guía para trabajar Uturn desde la terminal de tu PC con Claude conectado a Supabase por MCP, de modo que **Claude aplique las migraciones él mismo y corrija los errores de SQL** (nada de pegar SQL a mano en el editor de Supabase).

## 0. Seguridad primero: qué clave va dónde

| Clave (Supabase → Settings → API) | Dónde va | ¿Secreta? |
|---|---|---|
| **Project URL** `https://jkqzuddxahoamoygdrrb.supabase.co` | `.env` del app | No |
| **anon / public key** | `.env` del app | No (protegida por RLS), pero igual en `.env` |
| **service_role key** | Solo en Supabase → Edge Functions → Secrets | **SÍ, secretísima** |

Reglas de oro:
- La `service_role` **nunca** va al repo, ni al `.env` del app, ni a un chat. Salta la RLS = acceso total de admin.
- En Expo, todo lo que empieza con `EXPO_PUBLIC_` viaja al teléfono del usuario final → ahí solo la URL y la anon key.
- El `.env` está en `.gitignore`; no se sube.

## 1. Traer el repo actualizado

```bash
git checkout claude/university-app-modules-l413dc
git pull origin claude/university-app-modules-l413dc
npm install
```

## 2. Conectar el MCP de Supabase

El repo ya trae `.mcp.json` con tu proyecto configurado. Solo tienes que autenticar:

```bash
claude            # ábrelo dentro de la carpeta del repo
# Claude detecta .mcp.json y pregunta si confías en los MCP del proyecto → acepta
```

Dentro de Claude:

```
/mcp
```

Selecciona **supabase** → **Authenticate** → se abre el navegador → inicia sesión en Supabase y autoriza. Al volver, el servidor `supabase` debe figurar como *connected*.

> Alternativa manual (si prefieres el comando en vez del `.mcp.json`):
> ```bash
> claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=jkqzuddxahoamoygdrrb"
> ```

## 3. Skills de Supabase (ya instaladas)

Vienen en el repo en `.agents/skills/` (`supabase` y `supabase-postgres-best-practices`) y enlazadas en `.claude/skills/`. Los chats las usan solos al escribir SQL/RLS. Para verificar:

```bash
ls .agents/skills/
```

## 4. Variables de entorno del app

Crea `.env` en la raíz (queda fuera de git) con la URL y la **anon** key:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://jkqzuddxahoamoygdrrb.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<tu-anon-public-key>
```

## 5. Sobre el error `column "departs_at" does not exist`

Ese error salió de **pegar SQL a mano en desorden** en el editor de Supabase: una parte (un índice o una política RLS) usó la columna `departs_at` antes de que existiera la tabla `trips`. No es un problema del esquema, es de orden de ejecución.

**Solución: no pegues SQL a mano.** Deja que el Claude local, con el MCP conectado, aplique las migraciones en orden (tablas y columnas primero, luego índices y políticas) y verifique/corrija los errores por su cuenta contra tu base real. Eso es exactamente lo que hace la Sesión 3.

Si quieres empezar de cero (por SQL a medio aplicar), pídele a Claude que primero liste lo que existe (`list_tables`) y limpie lo aplicado a medias antes de volver a migrar.

## 6. Lanzar la Sesión 3

Abre un chat nuevo y pega el prompt de [`docs/sesiones/03-migracion-supabase.md`](sesiones/03-migracion-supabase.md). Ese prompt ya le indica a Claude que aplique las migraciones vía las herramientas del MCP de Supabase y corrija los errores solo. Cuando te pida las claves, dale la URL y la **anon** key (la `service_role` la cargará como *secret* en Supabase para las Edge Functions, no en el repo).

Puedes seguir usando **Expo Go** para probar la app hasta la Sesión 6 inclusive (ver `docs/guia-estudio.md`).

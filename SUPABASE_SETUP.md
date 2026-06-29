# Backend Supabase — guía de setup

La app puede correr con **datos mock** (sin configurar nada) o con el **backend real** de Supabase. Esta guía deja el backend real andando.

## 1. Crear el proyecto

1. Entra a https://supabase.com y crea un proyecto (región más cercana: South America / São Paulo).
2. En **Project Settings → API**, copia:
   - `Project URL`
   - `anon public` key

## 2. Configurar credenciales en la app

```bash
cp .env.example .env
```

Pega tus valores en `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Reinicia Metro con caché limpia para que tome las variables:

```bash
npx expo start -c
```

> Sin `.env`, `isSupabaseConfigured` es `false` y la app usa los datos mock.

## 3. Crear el esquema

Opción A — Dashboard: abre **SQL Editor**, pega el contenido de
`supabase/migrations/0001_init.sql` y ejecútalo.

Opción B — CLI:

```bash
npm i -g supabase
supabase link --project-ref TU_REF
supabase db push
```

Esto crea las tablas (`profiles`, `trips`, `bookings`, `ratings`,
`tutoring_sessions`, `benefits`, `institutional_emails`,
`verification_requests`), las políticas RLS, el bucket privado
`intranet-screenshots` y el trigger que crea el `profile` al registrarse.

## 4. Cargar el padrón de correos (cuando la UAI lo entregue)

En **SQL Editor**:

```sql
insert into institutional_emails (university_id, email) values
  ('uai', 'alumno1@alumnos.uai.cl'),
  ('uai', 'alumno2@alumnos.uai.cl');
```

O importa un CSV desde **Table editor → institutional_emails → Import**.
Los correos del padrón quedan **verificados automáticamente** al registrarse.

## 5. Verificación por screenshot (InfoAlumno) + OCR

El flujo de verificación sube la captura al bucket y llama a la Edge Function
`verify-intranet`, que confirma que la imagen es de
`intranet.uai.cl/.../InfoAlumno.aspx` y que el **nombre coincide** con el
registrado.

```bash
supabase functions deploy verify-intranet
supabase secrets set OCR_API_KEY=...   # proveedor de visión/OCR
```

> En `supabase/functions/verify-intranet/index.ts`, la función `extractFromScreenshot`
> está como esqueleto: hay que conectar el proveedor de visión real (OpenAI Vision,
> Google Vision o Anthropic). La comparación de nombres ya está implementada.

## 6. Crear un administrador

Registra un usuario normal y luego promuévelo:

```sql
update profiles set role = 'admin' where email = 'tu-correo@alumnos.uai.cl';
```

El panel admin (en construcción) usa este rol para el dashboard, la cola de
verificación y la gestión del padrón.

## Arquitectura del cliente

- `lib/supabase.ts` — cliente único (auth persistida con AsyncStorage).
- `services/db.ts` — capa de datos tipada (auth, viajes, reservas, verificación)
  que mapea filas snake_case ↔ modelo de dominio (`models/types.ts`).
- La migración a backend es **gradual**: las pantallas pueden seguir usando
  `store/appState` (mock) e ir cambiando a `services/db` flujo por flujo.

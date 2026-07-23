# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Unities** (formerly Uturn) — a university app combining carpooling (with shift payments), a social
feed (federations, departments, student centers), messaging/tutoring (incl. AI bots), a profile with
credits/redemptions, and an admin panel for federations/brands. Chilean university context; almost all
UI copy, commit messages, and docs are in **Spanish** — match that when writing user-facing text or docs.

Stack: **Expo ~54 · React Native 0.81 · expo-router 6 · TypeScript (strict) · react-native-paper ·
react-native-maps**, backed by **Supabase** (Postgres + Auth + Realtime + Storage + Edge Functions).

## Commands

```bash
npm install
npx expo start          # dev server (press i/a/w, or scan QR with Expo Go)
npm run ios / android / web

npm run lint             # expo lint (eslint-config-expo flat config)
npm run typecheck        # tsc -p tsconfig.json --noEmit-equivalent
npm test                 # runs lint && typecheck — this is the whole test suite, no unit test runner
```

There is no unit/component test runner in this repo. "Tests" for backend logic are SQL scripts under
`supabase/tests/*.sql` (see below) — there is no JS test command for them.

### Supabase (backend)

The Supabase MCP server is preconfigured in `.mcp.json` (project ref `jkqzuddxahoamoygdrrb`); authenticate
via `/mcp` → `supabase` → Authenticate. Prefer applying migrations through the MCP tools
(`list_tables`, `apply_migration`, `execute_sql`) rather than pasting SQL into the dashboard by hand —
migrations must be applied **in timestamp order**, and out-of-order manual pasting is a known footgun
(see `docs/setup-local.md`).

- `supabase/migrations/*.sql` — versioned schema, applied in order by filename timestamp.
- `supabase/functions/*` — Edge Functions (`expire-payments`, `send-push`, `create-payment-intent`,
  `fintoc-webhook`, `ai-bot-reply`). Excluded from the app's `tsconfig.json`/eslint (separate Deno runtime).
- `supabase/tests/*.sql` — end-to-end SQL scenarios run in a transaction with `ROLLBACK` (no schema
  changes persist); use these to validate RPC/RLS/trigger behavior against a real or branch database.
- `supabase/apply_all.sql` — bundled version of all migrations for pasting into the SQL Editor in one go;
  `supabase/verify.sql` — post-apply checks (tables, functions, RLS, grants, seed, pg_cron); `reset.sql`
  destructively drops only Unities' own objects (for cleaning up a half-applied attempt).
- `docs/backend.md` is the source of truth for the schema, RLS policy summary, and server functions —
  read it before writing migrations. `supabase/README.md` documents the migration files/apply flow.

Secrets: `.env` (gitignored) holds only the Supabase **URL** and **anon/publishable key**
(`EXPO_PUBLIC_*`, safe for the client — protected by RLS). The **service_role** key and provider
secrets (`FINTOC_SECRET_KEY`, `FINTOC_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`) are **only** ever set as
Edge Function secrets (`supabase secrets set ...`) — never in the repo, `.env`, or client code.

## Architecture

### Server is the source of truth, not the client

Every business rule that matters (seat availability, one active booking per passenger, the 48h payment
deadline, late-cancellation strikes at 3/6/9, payment verification, role assignment, redemption approval)
is enforced in Postgres via **RLS policies and `security definer` RPC functions**, not client-side checks.
Client-side permission checks (`usePermissions`, role-gated buttons) are UX only — treat them as such when
changing them; the real gate is always the matching RLS policy or RPC in `supabase/migrations/`. When
adding a feature that touches money, roles, or moderation, the question isn't "does the UI block this?"
but "does the database reject it if the UI didn't?"

### Layered client architecture

```
app/**                    expo-router file-based screens (Spanish route titles in app/_layout.tsx)
  ↓ uses
contexts/ (UserContext, NotificationsContext) + store/appState.tsx
  ↓ calls
services/api/*.ts          one file per domain, thin wrappers over supabase-js
  ↓ talks to
services/supabase.ts        Supabase client singleton (isSupabaseConfigured guards offline/dev mode)
```

- `services/api/index.ts` is the barrel: `import { tripsApi, bookingsApi, ... } from '@/services/api'`.
  Each domain file (`trips.ts`, `bookings.ts`, `payments.ts`, `feed.ts`, `messages.ts`, `qa.ts`,
  `guides.ts`, `admin.ts`, `bots.ts`, ...) maps 1:1 to a session in `docs/backend.md`.
- `services/api/mappers.ts` translates between DB rows (English `snake_case`, canonical status tokens)
  and the client's domain types, which mix English and **Spanish field names** (e.g. `UserProfile.nombre`,
  `credit_transactions.entry_type: 'abono' | 'cargo'`) inherited from the pre-Supabase local prototype.
  When adding a table, decide deliberately whether client-facing names follow the English DB convention
  or the existing Spanish screen vocabulary — check how sibling mappers in that file do it.
- `store/appState.tsx` (~1400 lines) is the legacy local-state provider from the pre-Supabase prototype
  (Sessions 0–2). It's being phased into write-through + realtime-reconcile over `services/api/*`
  (see `UserContext.tsx`'s `updateUser` for the pattern: optimistic local update + AsyncStorage cache +
  fire-and-forget Supabase write). Don't add new business logic here — add it as a server function and
  call it from `services/api/*`.
- `contexts/UserContext.tsx` owns the Supabase auth session (OTP/magic-link, domain-restricted to
  university emails) and the current `profile`, cached to AsyncStorage for offline restore.
- `hooks/use-permissions.ts` derives a `Permissions` object from `AccountRole` (`user < tutor < admin <
  owner`, each level includes the ones below) — mirrors, but does not replace, the RLS role checks.
- `constants/campuses.ts` etc. are catalogs (universities, campuses, meeting points) still hardcoded in
  the client rather than DB tables; multi-university expansion is a known future migration (see
  `ROADMAP.md` backlog) — don't assume campus/university lists are stable long-term.

### Feature sessions

The app was built in a sequence of dependent "sessions" (see `ROADMAP.md`), each adding a vertical slice
(schema + RLS + RPC + client). `docs/backend.md` is organized the same way and is the fastest way to
understand *why* a table/column exists. Notable design decisions worth knowing before touching related
code:

- **AI bots are just `profiles` rows** (`is_bot = true`) with a synthetic service `auth.users` account —
  this lets bots reuse 100% of the existing DM machinery (`start_dm`, RLS, realtime) with zero special-
  casing in the messaging layer. A bot reply is triggered by a Postgres trigger calling the `ai-bot-reply`
  Edge Function via `pg_net`, which calls the Claude API and inserts a normal message as the bot user
  (`service_role`, bypasses RLS).
- **Payments**: source of truth for "did they pay" moved from passenger self-report (`marked`) to
  provider-verified (`confirmed` via Fintoc webhook, HMAC-signed). `disputes` is the escape valve — a
  `disputed` payment is never struck while under review.
- **Admin scoping**: `publisher_members` ties an admin/tutor to specific publishers (federations, student
  centers); an admin can only manage what they're a member of. Only `owner` has global scope.
- Money, credits, strikes, and role columns on `profiles` are denormalized and only ever written by
  server-side functions/triggers — there are deliberately no client UPDATE policies on them.

## Conventions

- Path alias `@/*` maps to repo root (`tsconfig.json`); use it instead of relative imports across
  directories.
- Domain/DB layer (`models/`, `services/api/`, SQL) uses **English `snake_case`**; some client-facing
  types and screens use **Spanish** field names/tokens carried over from the original local-only
  prototype — follow whichever convention the file you're editing already uses.
- `supabase/functions/**` is excluded from the app's TypeScript project and ESLint config — it's a
  separate Deno runtime; don't expect `npm run typecheck`/`lint` to catch issues there.

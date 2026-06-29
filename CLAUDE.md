# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

UTurn is an Expo / React Native (TypeScript) mobile app: university carpooling for Chilean universities, with a built-in student tutoring ("asesorías") module, a reputation/tier system, and partner benefits. The product goal is to replace WhatsApp-based ride coordination and be handed to the university. All business data is currently **mock / in-memory** — there is no backend yet.

## Commands

Run these from the `uturn-app/` directory.

```bash
npm install                 # install deps
npx expo start              # start Metro; press w (web), a (Android), i (iOS), or scan QR with Expo Go
npx expo start --web        # web only (maps fall back — see below)
npx expo start -c           # start with cleared cache

npm run lint                # expo lint (eslint-config-expo)
npm run typecheck           # tsc -p tsconfig.json (strict, noEmit)
npm test                    # lint + typecheck (there is NO unit-test runner configured)
```

There is no test framework — `npm test` only runs lint + typecheck. To validate that the whole app bundles end-to-end, run a web export:

```bash
npx expo export --platform web --output-dir <tmp>
```

This catches missing-module / resolution errors across all routes (a green export = every route bundles).

## Architecture

### Two-layer routing: `app/` (routes) → `screens/` (implementations)

Routing is **file-based** via `expo-router` with typed routes enabled (`app.json` → `experiments.typedRoutes`). Files under `app/` are intentionally **thin wrappers** — each one imports and renders a component from `screens/`. Put real UI/logic in `screens/`, not in `app/`.

- Route groups: `app/(tabs)/` is the bottom-tab group (index/home, my-trips, rewards, profile).
- Dynamic routes: `app/trip/[id].tsx`, `app/passenger/trip-map/[id].tsx`.
- Role subflows: `app/driver/*` and `app/passenger/*`.
- Root `app/index.tsx` is the **Login** screen; `app/_layout.tsx` wires the providers.

### Map screens have `.web.tsx` siblings — this is required

`react-native-maps` is native-only and breaks the web bundle. Every map screen therefore ships a native implementation **and** a `*.web.tsx` fallback that renders a list/banner instead of a `MapView` (e.g. `MapScreen.tsx` + `MapScreen.web.tsx`). When you touch a map screen, update **both** variants and keep them on the same data model. Native maps use the shared muted `MAP_STYLE` from `constants/mapStyle.ts` via `customMapStyle`.

### Two state layers — do not confuse them

- `contexts/UserContext.tsx` — **who is logged in** (the current session `User`, with `setUser`/`updateUser`/`clearUser`). Consumed via `useUser()`.
- `store/appState.tsx` — **global app data** via Context + `useReducer`: `trips`, `bookings`, `tutoringSessions`, `benefits`, and `registeredUsers` (the multi-user account registry). Consumed via `useAppState()` → `{ state, dispatch }`. Mutations go through typed actions (`ADD_TRIP`, `ADD_BOOKING`, `REGISTER_USER`, `UPDATE_USER`, …). Seed data lives inside this file.

Both providers are mounted in `app/_layout.tsx` (`UserProvider` → `AppStateProvider`).

### Domain model

`models/types.ts` is the single source of truth for domain types (`User`, `Trip`, `Booking`, `TutoringSession`, `Benefit`, `ReputationTier`, `PenaltyState`, `VerificationStatus`, …) plus tier helpers: `TIER_LABELS`, `TIER_COLORS`, `TIER_MIN_TRIPS`, and `getTierForUser(trips, rating)`.

### Design system — use it instead of hardcoding styles

`constants/designSystem.ts` exports tokens (`COLORS`, `SPACING`, `RADII`, `TYPE`, `SHADOW`). Reusable UI lives in `components/ui/` (`AppButton`, `Card`, `Avatar`, `TierBadge`, `SectionHeader`). The visual direction is a modern mobility app (Uber/Cabify): light surfaces, line icons via `@expo/vector-icons` (Ionicons) — **not emojis** — and large rounded controls. New screens should compose these tokens/components, not re-roll colors or buttons.

### Student verification

`services/verification.ts` decides student verification using two sources:
- `constants/institutionalEmails.ts` — the institutional email roster (currently empty; populated when a university provides it). A match → instant auto-verify.
- `constants/intranets.ts` — per-university intranet config (domains, reference screenshot, expected hints). No roster match → the user uploads an intranet screenshot and is left `pending`.

`getUniversityIdFromEmail` / `getIntranetForEmail` map an email domain to a university. The verification UI is `screens/CredentialVerificationScreen.tsx` (route `app/verify-profile.tsx`).

### University / campus data

`constants/campuses.ts` defines `UNIVERSITIES`, `CAMPUSES` (with bounds + `meetingPoints`), and lookups (`getCampusById`, `getMeetingPointById`). `constants/meetingPoints.ts` flattens these into map markers. Login restricts to institutional domains (`@alumnos.uai.cl`, `@udd.cl`, `@miuandes.cl`).

## Conventions & gotchas

- **Path alias:** `@/*` → repo root (`tsconfig.json`). Import as `@/screens/...`, `@/constants/...`, etc.
- TypeScript is **strict**; keep `npm run typecheck` green.
- Build from `uturn-app/` — the sibling `uturn/` folder is a separate scratch copy; ignore it.
- The root `api.ts` is an older **simulated** API with its own local types, not wired into the current screens/store. The live mock data path is `store/appState.tsx` + `constants/mock-data.ts`.
- New Architecture and the React Compiler experiment are enabled in `app.json`.
- Main work happens on the `feat/sistema-reputacion-asesorias` branch.

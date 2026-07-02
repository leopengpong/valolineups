# CLAUDE.md
<!-- docs-synced-commit: 9b101354d030e24b0762c736a2c1480afe393260 -->

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Source of truth

[SPEC.md](SPEC.md) at the repo root is the design spec — read it before making non-trivial changes. The schema, auth model, image flow, page-level UX behavior, and "decisions locked in" all live there.

## Stack notes that diverge from common defaults

- **Next.js 16** (App Router, React 19). SPEC.md still says "Next 15"; the actual install is 16.2.6. Treat that as a versioning quirk in the spec, not a target.
- **Route middleware lives in [proxy.ts](proxy.ts), not `middleware.ts`** — Next 16 renamed the file. Same export shape (`proxy(req)` + `config.matcher`), just a different filename.
- **Dynamic route `params` and page `searchParams` are `Promise`s** and must be `await`ed (see [app/(protected)/page.tsx:22](app/(protected)/page.tsx) and `[id]/route.ts` files). This is the Next 15+/16 async signature — do not type them as plain objects.
- **Tailwind v4** via `@tailwindcss/postcss`. Theme is configured in [app/globals.css](app/globals.css) with `@import "tailwindcss"` and `@theme inline` — there is no `tailwind.config.*` file.
- **shadcn style is `base-nova`** (see [components.json](components.json)), not the default `new-york`. Run shadcn commands accordingly; manual UI primitives belong in [components/ui/](components/ui/).

## Commands

```bash
npm run dev      # next dev
npm run build    # next build
npm run start    # next start
npm run lint     # eslint (flat config in eslint.config.mjs)
```

There is no test suite. There is no typecheck script — rely on `next build` or your editor's TS server.

### Database setup

Schema is one-shot SQL run manually in the Supabase SQL editor — there is no migration tool wired up.

- [supabase/schema.sql](supabase/schema.sql) — run once against a fresh project. Creates the `lineups` (with the `abilities` text[] column and its CHECK constraint) and `field_definitions` tables, indexes, the `set_updated_at` trigger, enables RLS with no policies, and creates the private `lineups` storage bucket. Maps and agents are **not** in the DB.
- [supabase/seed.sql](supabase/seed.sql) — idempotent (`on conflict do nothing`). Seeds `field_definitions` only.
- [supabase/migrations/](supabase/migrations/) — one-off migration SQL files for past schema changes. Run manually when applicable; not auto-applied.

## Architecture

### Auth (single-password, HMAC cookie)

There is no user table. Access is gated by a single shared password in `APP_PASSWORD`.

1. `POST /api/auth/login` ([app/api/auth/login/route.ts](app/api/auth/login/route.ts)) compares `{ password }` against `APP_PASSWORD` with constant-time compare and, on success, sets an `auth` cookie whose value is `HMAC-SHA256(APP_PASSWORD, AUTH_SECRET)` as hex.
2. [proxy.ts](proxy.ts) runs on every route except `/login`, `/api/auth/login`, and Next internals/static assets. It recomputes the expected HMAC and compares cookie value in constant time. Failure → 302 to `/login?redirect=<original>`.
3. Crypto utils live in [lib/auth.ts](lib/auth.ts) and use Web Crypto (`crypto.subtle`) — edge-runtime safe, no `node:crypto`. Don't reach for Node crypto in code that may run at the edge.
4. To invalidate all sessions, rotate `APP_PASSWORD` or `AUTH_SECRET`.

### Route groups

- `app/(auth)/login/page.tsx` — the only unauthenticated page.
- `app/(protected)/...` — everything else (`/`, `/add`, `/lineup/[id]`). Group is for organization; the actual gate is in `proxy.ts`.
- `app/api/...` — route handlers. Same proxy guard applies, so handlers can assume the request is authenticated.

### Supabase clients — strict server/browser split

Two clients, two keys, two purposes:

- **[lib/supabase/server.ts](lib/supabase/server.ts) — `getServerSupabase()`**: uses `SUPABASE_SECRET_KEY` (formerly `service_role`), bypasses RLS. **All DB reads/writes go through this**, from route handlers or server components only. Never import from a `"use client"` file.
- **[lib/supabase/client.ts](lib/supabase/client.ts) — `getBrowserSupabase()`**: uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. **Only used for `uploadToSignedUrl` against the private storage bucket.** The browser never queries DB tables directly.

[lib/lineups.ts](lib/lineups.ts) imports `"server-only"` at the top — that's the canonical guard for server-only helper modules.

### DB security model

`field_definitions`, `lineups`, and the `lineups` storage bucket all have **RLS enabled with no policies**. That means:

- The publishable (anon) key has zero DB access — if it leaks, attacker can't read or write.
- All DB access works only via the server secret key (bypasses RLS).
- Storage objects are reachable only through short-lived signed URLs.

When adding a new table, follow the same pattern: enable RLS, write no policies, access exclusively from server route handlers using `getServerSupabase()`.

### Reference data — static JSON, refreshed at build time

Maps and agents are **not** in Postgres. They live as committed JSON at [lib/data/maps.json](lib/data/maps.json) and [lib/data/agents.json](lib/data/agents.json), refreshed from `valorant-api.com` by [asset_updater/sync-reference.mjs](asset_updater/sync-reference.mjs) as a `prebuild` step on every deploy. Soft-fails on API outage so a flaky upstream never blocks a deploy — the committed files are the fallback. Ability icons live at [public/agent-abilities/](public/agent-abilities/) (e.g. `sova-ability1.png`) and are committed alongside the JSON.

Three things flow from this:

- New agents/maps appear in production by re-deploying (no manual step). To bake in a current-day refresh into a commit, run `node asset_updater/sync-reference.mjs` and commit the diff.
- `lineups.map_slug` and `lineups.agent_slug` are plain `text` columns (no FK). The slug is the stable identity — derived once from the display name (lowercase, `/` dropped, non-alphanumerics → `-`), so `KAY/O` → `kayo`.
- **`maps.json` is hand-maintained for `in_competitive_rotation`** — the valorant-api maps endpoint doesn't expose rotation status, so flipping a map in/out of the rotation is a JSON edit + commit + redeploy. New maps default to `in_competitive_rotation: true`.

Server reads go through plain async helpers in [lib/data/reference.ts](lib/data/reference.ts): `listMaps()`/`listAgents()` are JSON imports cast to the row types; `listFields()` and `getLineupCounts()` still hit Postgres. There is **no** `unstable_cache` / `revalidateTag` layer — every page render hits Postgres for the DB-backed reads. Why: single-user Hobby-tier app on Vercel, tables are tiny, pages are `force-dynamic`. An earlier tag-based scheme served stale counts because `revalidateTag` only invalidates the local serverless instance. If you re-add caching, pick a solution that propagates across instances.

Client lineup fetches go through SWR. [components/swr-config.tsx](components/swr-config.tsx) wraps the `(protected)` layout with `revalidateOnFocus: true` so edits made on another device show up when you tab back. [components/lineup-grid.tsx](components/lineup-grid.tsx) keys SWR as `["lineups", mapSlug, agentSlug]` — **`side` is intentionally omitted from the key**: the API returns both sides in one response and the client filters in memory, so toggling Attack ↔ Defense never refetches. After any lineup mutation, invalidate by calling `mutate((key) => Array.isArray(key) && key[0] === "lineups", undefined, { revalidate: true })` (see [components/lineup-form.tsx](components/lineup-form.tsx)).

### URL contract: slug-based filters

The cheat sheet's URL is `?map=<slug>&agent=<slug>&side=attack|defense`. Slug is now baked into the JSON row (`Map.slug`, `Agent.slug`) — no runtime derivation. `GET /api/lineups` and the lineup mutation routes both accept slugs and write them directly to `lineups.map_slug` / `lineups.agent_slug`. Filter persistence localStorage key is `valolineups.filters.v2` (v1 stored UUIDs and is ignored). localStorage is written only on explicit user interaction (matrix pick, side toggle) and read only by the hydration effect when landing on `/` with no filter params — so per-navigation persistence relies on the URL/history, not localStorage. The lineup form's "← Back" button lives inside [components/lineup-form.tsx](components/lineup-form.tsx) and uses `router.back()` to return to the previous URL with its filters intact; don't replace it with a static `<Link href="/">` (that strips the filters and forces a fragile localStorage round-trip on every nav back). Navigation (both "← Back" and "Cancel") goes through a dirty-detection guard: if the form has unsaved changes, a discard-confirmation dialog appears before navigating away. (`components/back-button.tsx` is now dead code — nothing imports it.)

**`side` is client-only state.** [components/side-context.tsx](components/side-context.tsx) `SideProvider` seeds its `useState` initializer from `?side=` via `useSearchParams()` — **don't** revert to a server-passed `initialSide` prop. Next copies the current entry's cached router tree onto a new history entry when you call `history.replaceState`, so a prop-driven provider would re-mount from that stale tree on back and show the wrong side. Reading the live searchParams means each fresh mount of the cheat sheet (e.g. `router.back()` from `/lineup/[id]`) sees the URL bar as the source of truth. Toggling Attack ↔ Defense calls `setSideState` for instant UI then mirrors the URL via `window.history.replaceState` — **never** `router.replace` — so it does not trigger an RSC fetch on the `force-dynamic` page. `FilterBar` reads/writes side via `useSide()`/`useSetSide()`; `LineupGrid` reads side via `useSide()`. Map/agent changes still go through `router.replace` because they drive the SWR key and the `hasFilters` server branch. Don't put `side` back into a `router.replace` URL — that re-introduces the unnecessary roundtrip.

### Image flow

1. Client compresses with [lib/image.ts](lib/image.ts) → `browser-image-compression`, max 1920px, JPEG ~80%.
2. Client calls `POST /api/images/sign-upload` with `{ count }` → gets back `{ slots: [{ path, token, signedUrl }] }`. Server mints object keys as `<uuid>.jpg` ([app/api/images/sign-upload/route.ts](app/api/images/sign-upload/route.ts)).
3. Client uploads each blob via `supabase.storage.from(BUCKET).uploadToSignedUrl(path, token, file)` ([components/lineup-form.tsx](components/lineup-form.tsx)).
4. Server saves `lineups.images = [{ path, label?, order, zoom_enabled?, zoom_x?, zoom_y?, crop_x?, crop_y?, crop_w?, crop_h? }]` (JSONB, max 5). `zoom_enabled` is an opt-out flag — absent or `true` means the zoom circle + crosshair appear; `false` hides them. `zoom_x` / `zoom_y` are optional 0-100 % deltas for the local-zoom anchor; absence means dead center (50/50). `crop_*` are an optional 0-100 % crop rectangle applied on the cheat-sheet card (all four must be present together — absence means the full image is shown). The edit form clamps the zoom anchor to stay inside the crop rectangle.
5. On read, [lib/lineups.ts](lib/lineups.ts) `attachSignedUrls()` batches `createSignedUrls(paths, 3600)` for all visible lineups. The `GET /api/lineups` handler does this server-side; the browser never asks for download URLs separately. (`POST /api/images/sign-download` exists but has no callers — treat as dead code, don't build new flows on it.)
6. On lineup update/delete, [lib/lineups.ts](lib/lineups.ts) `deleteStorageObjects()` strips orphaned objects so storage stays in sync with the DB.

### Image-zoom preference (pre-hydration script)

Cheat-sheet image height is user-adjustable via the slider in the filter bar ([components/image-size-slider.tsx](components/image-size-slider.tsx)), persisted in localStorage as `valolineups.image-height` (range 80–480), and applied as a CSS variable `--lineup-image-height` consumed by [components/lineup-card.tsx](components/lineup-card.tsx). [app/layout.tsx](app/layout.tsx) injects an inline `<script>` in `<body>` that sets the variable from localStorage **before** React hydrates — without it, every page load flashes the default 200 px height. Don't move that script into a client component or wrap it in `useEffect`.

### Custom fields — immutable key, hard-delete strips JSONB

`field_definitions.key` is the JSONB key inside `lineups.custom_fields` and is **immutable** after creation (label and `input_type` and `sort_order` are editable). Don't add a PATCH path that lets `key` change.

Deleting a `field_definitions` row is a **hard delete**: the handler ([app/api/fields/[id]/route.ts](app/api/fields/[id]/route.ts)) scans every `lineups.custom_fields`, removes the dropped key in JS, writes each row back, then deletes the definitions row. The `GET` on that route returns the usage count for the confirm dialog. This is acceptable because it's a single-user, small-dataset app.

The keys `title` and `stance` are the seeded "primary" custom fields shown most prominently on cheat-sheet cards (see [supabase/seed.sql](supabase/seed.sql)) — anything else is a generic textual extra.

### Abilities — dedicated column, not a custom field

`lineups.abilities` is a `text[]` column whose elements are a subset of `('ability1','ability2','ability3','ultimate')` (enforced by CHECK constraint). The slot keys mirror the keys in [lib/data/agents.json](lib/data/agents.json), so the rendered icon + display name is derivable from `(agent_slug, ability_key)` with no per-lineup denormalization.

- The cheat-sheet card ([components/lineup-card.tsx](components/lineup-card.tsx)) renders ability icons in a **dedicated left column** (`h-12 w-12` icons with base-ui tooltips) and title/stance text to the right. `splitSummary()` returns `{ abilities: AgentAbility[], textPrimary: string[], secondary: string[] }` — abilities occupy their own column, title + stance sit beside them (`|`-separated), and other custom fields go on a smaller muted secondary line below.
- The add/edit form ([components/lineup-form.tsx](components/lineup-form.tsx)) renders an `<AbilityToggleField>` between the agent selector and the image input. It shows one icon-button per slot the chosen agent actually has (since `Agent.abilities` is `Partial<Record<AgentAbilityKey, AgentAbility>>`), and lets the user toggle each independently.
- **Empty array is permitted** — the form shows an amber warning ("⚠️ No abilities selected"), but submits cleanly. The card just skips the icon row in that case.
- New lineups default to `["ability1"]`; edits load whatever is stored.
- The submit handler filters `abilities` to only slots that exist for the currently selected agent before sending, so switching agents mid-edit can't persist a slot the new agent doesn't have. `normalizeAbilities()` in [lib/lineups.ts](lib/lineups.ts) re-validates on the server and emits the canonical order.
- Migration [0004_standardize_abilities.sql](supabase/migrations/0004_standardize_abilities.sql) added the column, stripped the legacy `custom_fields.ability` key from every row, and deleted the `field_definitions` row for `key='ability'`. It does **not** backfill — the legacy text was free-form, not slot-mapped, so every row starts at `'{}'` and gets re-tagged manually.

### Route handler shape

REST-ish convention used throughout `app/api/`. Only `fields` and `lineups` are DB-backed — there are no `/api/maps` or `/api/agents` routes.

- `POST /api/{resource}` — create.
- `PATCH /api/fields` — bulk reorder (`{ order: [{ id, sort_order }, ...] }`).
- `GET/PATCH/DELETE /api/{resource}/[id]` — read/update/delete one row.
- Maps and agents are sorted alphabetically by `name` in [asset_updater/sync-reference.mjs](asset_updater/sync-reference.mjs) when the JSON is written, so the committed file diffs cleanly.

### Environment variables

See [.env.example](.env.example). Copy to `.env.local`. Required for the app to run at all: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `APP_PASSWORD`, `AUTH_SECRET`.
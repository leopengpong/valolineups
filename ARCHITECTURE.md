# Architecture deep dive

Reference notes for tasks that touch data fetching, cache invalidation, or the
cheat-sheet render path. CLAUDE.md states the contracts; this file shows the
flows behind them. Skip if your change is contained to a single component or a
single route handler.

## Reference data: build-time sync

Maps and agents are static — committed JSON at
[lib/data/maps.json](lib/data/maps.json) and
[lib/data/agents.json](lib/data/agents.json), refreshed from
`valorant-api.com` by [asset_updater/sync-reference.mjs](asset_updater/sync-reference.mjs)
as a `prebuild` step on every Vercel deploy.

Flow per build:

1. `npm run build` → `prebuild` invokes the sync script with `--soft-fail`.
2. Script `fetch`es `/v1/agents?isPlayableCharacter=true` and `/v1/maps`.
3. For agents: writes `lib/data/agents.json` fully (no merge — API is
   authoritative for ability names/icons). The four slots emit in canonical
   order (ability1, ability2, ability3, ultimate) regardless of API order.
   Each ability's `displayIcon` is downloaded to
   `public/agent-abilities/<slug>-<slot>.png` if not already present.
4. For maps: filters to PvP maps (non-null `coordinates` && non-null
   `displayIcon` — the discriminator that drops TDM, Range, Skirmish).
   Merges with existing `lib/data/maps.json` to preserve
   `in_competitive_rotation` flags. New maps default to `true`. Maps that
   were committed but vanished from the API are kept (some lineup might
   still reference them).
5. On any fetch/IO failure: prints a warning, exits 0, build continues
   with the committed files. Deploys are never blocked by upstream.

Icons in `public/` get bundled into the build output, so they ship as static
assets — no signed-URL roundtrip when rendering an ability badge.

To refresh and commit locally:

```
node asset_updater/sync-reference.mjs
git add lib/data public/agent-abilities && git commit
```

Editing `in_competitive_rotation` is a manual JSON edit (valorant-api doesn't
expose rotation status).

## Cache invalidation matrix

Only one cache now: client SWR ([components/lineup-grid.tsx](components/lineup-grid.tsx)),
keyed `["lineups", mapSlug, agentSlug]`. Invalidated by
`mutate((key) => Array.isArray(key) && key[0] === "lineups", undefined, { revalidate: true })`
from the component that ran the mutation.

Server-side `unstable_cache`/`revalidateTag` is gone — `lib/data/reference.ts`
hits Postgres directly per render for `listFields` and `getLineupCounts`, and
returns the imported JSON for `listMaps`/`listAgents`. The earlier tag-based
scheme served stale counts across serverless instances and was deleted.

| Mutation                                  | SWR `lineups` |
| ----------------------------------------- | :-----------: |
| `POST /api/fields`                        |               |
| `PATCH /api/fields` (reorder)             |               |
| `PATCH /api/fields/[id]`                  |               |
| `DELETE /api/fields/[id]`                 |    ✓ (c)      |
| `POST /api/lineups`                       |    ✓ (c)      |
| `PATCH /api/lineups/[id]`                 |    ✓ (c)      |
| `DELETE /api/lineups/[id]`                |    ✓ (c)      |

`(c)` = invalidation happens client-side in the component that ran the
mutation. Field-definition mutations only need an SWR invalidation when the
key was actually used by a lineup (delete strips it from JSONB rows).

## Cheat-sheet load (`/`)

1. RSC [app/(protected)/page.tsx](app/(protected)/page.tsx) awaits
   `searchParams` and parallels `listMaps`/`listAgents`/`listFields`/`getLineupCounts`.
   The first two are pure JSON imports; the last two hit Postgres.
2. URL slugs (`?map=`, `?agent=`) are validated against the loaded data —
   `maps.some(m => m.slug === sp.map)`. Unknown slugs fall back to
   `undefined` (renders an empty hint).
3. Renders `<FilterBar>` (sticky top, client) and either the empty hint or
   `<LineupGrid>`.
4. `<LineupGrid>` SWR-fetches `/api/lineups?map=<slug>&agent=<slug>`. The
   handler passes the slugs directly to `listLineups({ mapSlug, agentSlug })`
   (both sides) and runs `attachSignedUrls` before responding.
5. Client filters the response by `side` and renders cards.

Why side is excluded from the SWR key: pressing `s` to flip Attack ↔ Defense
should never trigger a refetch. The single-(map,agent) response covers both.

`FilterBar` mirrors filters into both the URL (`router.replace`) and
localStorage (`valolineups.filters.v2`). On first mount, if the URL is missing
filters and localStorage has them, it pushes them into the URL so the RSC has
something to render against next navigation.

`lineupCounts.byMapAgentSide` is keyed by `mapSlug → agentSlug → SideCounts`
(post-refactor). Consumers read `selectedMap.slug` and `selectedAgent.slug` to
index it — there is no longer an `id` field on `Map`/`Agent` rows.

## Add / edit lineup

1. RSC ([add/page.tsx](app/(protected)/add/page.tsx),
   [lineup/[id]/page.tsx](app/(protected)/lineup/[id]/page.tsx)) loads
   reference data; edit additionally loads the row + signs its image URLs.
2. `<LineupForm>` (client) holds new images as `{ file, previewUrl }` and
   existing images as `{ existingPath, previewUrl, label }`. Map and agent
   are tracked as slugs (`mapSlug`/`agentSlug`).
3. On submit:
   - `POST /api/images/sign-upload` with `{ count }` of new files; server
     mints `<uuid>.jpg` paths and returns one `{ path, token, signedUrl }`
     slot per file.
   - Each file is compressed by [lib/image.ts](lib/image.ts) to ≤1920 px JPEG,
     then `getBrowserSupabase().storage.from("lineups").uploadToSignedUrl(...)`.
   - Final `images` array merges existing paths and uploaded paths preserving
     UI order.
   - `POST /api/lineups` (create) or `PATCH /api/lineups/[id]` (edit) persists
     the row with `map_slug`/`agent_slug` as text.
4. PATCH compares `before.images[].path` to the incoming set and
   `deleteStorageObjects(removed)` for any orphaned paths. DELETE removes the
   row first, then its storage objects.
5. Client calls `mutate(...)` to nuke SWR `lineups` cache, then
   `router.push` + `router.refresh` to land on `/` with current filters.

The SWR invalidation has to happen even on PATCH where map/agent didn't
change, because the cards on the cheat sheet may now have different
`custom_fields` / images.

## Image-zoom pre-hydration script

`--lineup-image-height` is read by [lineup-card.tsx](components/lineup-card.tsx)
via `style={{ height: "var(--lineup-image-height, 200px)" }}`.
[components/image-size-slider.tsx](components/image-size-slider.tsx) writes
the variable in a `useEffect` whenever the slider changes — but `useEffect`
runs after hydration, so a cold load would briefly show 200 px before the
user's preferred height kicks in.

[app/layout.tsx](app/layout.tsx) avoids the flash by emitting a tiny inline
`<script>` at the top of `<body>` (before React hydrates) that reads
localStorage and sets the variable on `<html>`. Constraints:

- Must stay in the server `<RootLayout>` body — moving it to a client
  component defers it to post-hydration.
- Must not throw on private-mode / disabled storage — the existing
  `try { ... } catch {}` covers that.
- The clamp `n >= 80 && n <= 480` must match the slider's `MIN`/`MAX`
  constants; out-of-range values are ignored and the CSS fallback (200 px)
  takes over.

## Notes on dead / legacy code

- `POST /api/images/sign-download` ([app/api/images/sign-download/route.ts](app/api/images/sign-download/route.ts))
  has no callers. SSR signs URLs in `attachSignedUrls`; the SWR-loaded
  `/api/lineups` response already includes signed URLs. Don't add a client
  download-signing flow without first asking why the existing path is
  insufficient.
- `supabase/migrations/0001_rename_type_to_stance.sql` is a one-shot for
  pre-rename databases. New deployments don't need it.
- `supabase/migrations/0002_drop_map_agent_sort_order.sql` is rendered moot
  by 0003 (the tables themselves are dropped). Keep the file for historical
  ordering; running it on an already-migrated DB is a no-op.
- `supabase/migrations/0003_replace_reference_tables.sql` moved maps and
  agents out of the DB. Lineups now reference them by slug as text.
- `supabase/migrations/0004_standardize_abilities.sql` lifted `ability` out of
  `lineups.custom_fields` (free-form text) into a dedicated `text[]` column
  with a CHECK constraint pinning values to the four legal slot keys. Strips
  the legacy JSONB key from every row and deletes the matching
  `field_definitions` row. No backfill — every row starts with `'{}'`.

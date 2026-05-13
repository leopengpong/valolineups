# Valorant Lineups DB — Spec

A personal cheat-sheet web app for storing Valorant lineups (screenshot pairs/triples with metadata) and filtering them down to the relevant subset while in game.

## Goals & constraints

- Single-user, not publicly accessible (primarily to avoid free-tier rate limits and abuse, secondarily privacy).
- Free tier across all services.
- Fast access — no email check or password typing on every visit.
- Create/edit/view from any device (desktop and phone).
- Sortable/filterable cheat sheet on a second monitor, glanceable without mouse movement.

## Tech stack

- **Framework:** Next.js 15 (App Router) + TypeScript
- **UI:** Tailwind CSS + shadcn/ui
- **DB & file storage:** Supabase (Postgres + Storage), accessed via `@supabase/supabase-js`
- **Client-side image compression:** `browser-image-compression`
- **Hosting:** Vercel Hobby

## Auth

- Single shared password in `APP_PASSWORD` env var.
- `POST /api/auth/login` accepts `{ password }`, compares with `crypto.timingSafeEqual`, and on success sets an `auth` cookie whose value is `HMAC(password, AUTH_SECRET)`.
- Cookie: `httpOnly`, `secure`, `samesite=lax`, `maxAge ≈ 1 year`.
- `middleware.ts` verifies the cookie on every route except `/login` and `/api/auth/login`. Failure → 302 to `/login?redirect=<original>`.
- `/login` is a single password field. No email, no per-visit prompt after the first sign-in on each device.

**Threat model note:** an attacker with physical access to a signed-in device sees lineups. Acceptable since the data isn't sensitive. Rotate `APP_PASSWORD` + `AUTH_SECRET` to invalidate all sessions.

## Data model

```sql
create table maps (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

create table agents (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

-- runtime-configurable string fields shown on each lineup form
create table field_definitions (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,                          -- e.g. "ability", immutable
  label text not null,                               -- e.g. "Ability", editable
  input_type text not null default 'text',           -- 'text' | 'textarea'
  sort_order int not null default 0,
  created_at timestamptz default now()
);

create table lineups (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references maps(id) on delete restrict,
  agent_id uuid not null references agents(id) on delete restrict,
  side text not null check (side in ('attack', 'defense')),
  images jsonb not null default '[]'::jsonb,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index lineups_filter_idx on lineups (map_id, agent_id, side);
```

**JSONB shapes:**

- `lineups.images`: `Array<{ path: string; label?: string; order: number }>` — 1 to 3 entries. `path` is the Supabase Storage object key.
- `lineups.custom_fields`: `Record<string, string>` keyed by `field_definitions.key`.

**Seed data:** a one-shot `supabase/seed.sql` populates a starter set of maps, agents, and the three default custom fields (`ability`, `type`, `notes` — `notes` is `textarea`, others `text`). Lists are then editable from `/settings`.

## Image flow

1. Client compresses image to max 1920 px wide, JPEG ~80% quality (~100–400 KB per shot).
2. Client requests a signed upload URL from `POST /api/images/sign-upload` (server uses `SUPABASE_SECRET_KEY`).
3. Client uploads directly to Supabase Storage private bucket `lineups`.
4. Returned object path is saved into `lineups.images[].path`.
5. On read, server route mints 1-hour signed download URLs in batch (`POST /api/images/sign-download` accepting an array of paths). Cheat sheet hydrates `<img src>` from those URLs.

Secret key never reaches the browser. Publishable key is fine to expose (it's used only for the direct-to-Storage `uploadToSignedUrl` call); DB access goes through Next.js route handlers.

## Pages & UX

### `/login`
- Single password input + submit.
- Success → redirect target (defaults to `/`).

### `/` — Cheat sheet

**Sticky top filter bar:**
- Map dropdown (required; defaults to last-used via localStorage, also reflected in URL query params for shareable/bookmarkable views).
- Agent dropdown (required; same persistence).
- Side toggle: Attack ↔ Defense (same persistence).
- Keyboard shortcut: `s` toggles side.

**Grid below:**
- CSS Grid: `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`.
- Each lineup is a single card with `grid-column: span N`, where N = its image count (1, 2, or 3). Images of the same lineup are always adjacent. Possible small gaps at row ends when a 3-wide card can't fit in the remaining columns — acceptable.
- Card chrome: subtle border + slight background tint; one-line custom-fields summary at the top (e.g. `shock dart · standing · post-plant default`).
- Image labels render **above each image** (or below — never overlay, never on top of the screenshot).
- Default sort: `created_at DESC` (newest first).
- Click an image → fullscreen overlay (esc closes).
- Click card chrome (border/gap, not the image) → `/lineup/[id]`.
- Empty state when filters match nothing.

### `/add` — Create lineup
- Map / Agent / Side selectors at top (required).
- Image input zone supporting **all three** input methods:
  - Global `paste` event listener captures clipboard images (desktop screenshot → ctrl+v / cmd+v).
  - Drag-and-drop onto the zone.
  - Tap/click → native file picker (`<input type="file" accept="image/*" multiple>`) — on phone this opens the photo library / camera roll.
- For each image (max 3): thumbnail + optional label text input + reorder handles + remove button.
- Below images: one input per `field_definitions` row (text or textarea per `input_type`).
- Save → client compress → signed upload → row insert → redirect to `/` with current filters preserved.

### `/lineup/[id]` — Edit / delete
- Same form as `/add`, pre-filled.
- Save → update row.
- Delete button (red, confirm dialog) → deletes row + removes its images from Storage → redirect to `/`.

### `/settings` — Schema & constants editor

Three sections on one page.

**Maps**
- List, drag to reorder (writes `sort_order`), inline rename, add-new input.
- Delete: blocked if any lineup references it. Show usage count and inline message: "Used by 12 lineups — reassign or remove those first."

**Agents**
- Same UX as Maps.

**Custom fields**
- List existing `field_definitions`, drag to reorder.
- Inline rename of `label` only (the `key` is immutable so JSONB references stay stable).
- Add new: `label` + `key` (auto-suggested from label as lowercase snake_case, editable) + input_type select (`text` / `textarea`).
- Delete: **hard delete.** Runs `update lineups set custom_fields = custom_fields - '<key>'` to strip the JSON key from every row, then deletes the `field_definitions` row. Confirm dialog: "This will permanently remove '<label>' data from all N lineups. Continue?"

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=     # sb_publishable_… (formerly anon)
SUPABASE_SECRET_KEY=                      # sb_secret_… (formerly service_role); server only
APP_PASSWORD=                             # typed once per device
AUTH_SECRET=                              # random 32-byte hex, HMAC key for the auth cookie
```

## Free-tier headroom

- **Supabase free tier:** 500 MB Postgres (will use <10 MB), 1 GB Storage (~1500 lineups at ~300 KB avg compressed), 5 GB egress/month, unlimited API requests.
- **Vercel Hobby:** 100 GB bandwidth/month, 100k function invocations/day. Single-user use is comfortably under.
- Compression and signed-URL caching (1-hour expiry, so reused across rapid filter changes) keep egress low.

## File structure (planned)

```
valolineups/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (protected)/
│   │   ├── page.tsx                  # / cheat sheet
│   │   ├── add/page.tsx
│   │   ├── lineup/[id]/page.tsx
│   │   └── settings/page.tsx
│   ├── api/
│   │   ├── auth/login/route.ts
│   │   ├── images/sign-upload/route.ts
│   │   └── images/sign-download/route.ts
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                           # shadcn primitives
│   ├── filter-bar.tsx
│   ├── lineup-card.tsx
│   ├── image-input.tsx
│   └── ...
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 # browser client (publishable key)
│   │   └── server.ts                 # server client (secret key)
│   ├── auth.ts                       # cookie + HMAC utils
│   └── image.ts                      # compression helper
├── middleware.ts
├── supabase/
│   ├── schema.sql                    # tables + indexes (one-shot)
│   └── seed.sql                      # initial maps, agents, fields
├── package.json
└── ...
```

## Build phases

1. **Setup.** Next.js + Tailwind + shadcn scaffold, Supabase project, run `schema.sql` + `seed.sql`, wire env vars.
2. **Auth.** Login page, login route handler, middleware, cookie utils.
3. **Add + view (MVP).** Create-lineup page (paste/drop/pick), cheat sheet with map/agent/side filters, signed-URL image rendering.
4. **Edit + delete.** Edit page reusing the add form; delete with Storage cleanup.
5. **Schema editor.** `/settings` with maps, agents, custom-fields sections.
6. **Polish.** PWA manifest for "Add to Home Screen", `s` shortcut for side toggle, fullscreen image overlay, minor animations.

## Decisions locked in

- Card-with-span layout for the cheat sheet (not flat image grid).
- Hard delete of custom fields strips the JSON key from all lineups.
- No `role` field on agents.
- Image labels render above or below the image — never as overlay.
- Default cheat sheet sort: newest first (`created_at DESC`).

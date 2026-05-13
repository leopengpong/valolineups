-- Valorant Lineups DB — schema
-- One-shot. Run once in the Supabase SQL editor against a fresh project.

create extension if not exists "pgcrypto";

create table if not exists maps (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

-- Runtime-configurable string fields shown on each lineup form.
create table if not exists field_definitions (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,                          -- e.g. "ability", immutable
  label text not null,                               -- e.g. "Ability", editable
  input_type text not null default 'text' check (input_type in ('text', 'textarea')),
  sort_order int not null default 0,
  created_at timestamptz default now()
);

create table if not exists lineups (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references maps(id) on delete restrict,
  agent_id uuid not null references agents(id) on delete restrict,
  side text not null check (side in ('attack', 'defense')),
  images jsonb not null default '[]'::jsonb,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists lineups_filter_idx on lineups (map_id, agent_id, side);
create index if not exists lineups_created_at_idx on lineups (created_at desc);

-- Auto-bump updated_at on row update.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists lineups_set_updated_at on lineups;
create trigger lineups_set_updated_at
  before update on lineups
  for each row
  execute function set_updated_at();

-- Row Level Security: enable on every app table with NO policies.
-- All DB access in this app goes through Next.js route handlers using the
-- Supabase secret key (formerly service_role), which bypasses RLS. The browser
-- only talks to Storage via signed URLs and never queries these tables
-- directly, so the publishable (anon) key should have zero DB access.
-- Result: if the publishable key leaks, the attacker still can't read or
-- write anything via the Supabase REST/Realtime APIs.
alter table maps enable row level security;
alter table agents enable row level security;
alter table field_definitions enable row level security;
alter table lineups enable row level security;

-- Storage bucket for compressed screenshots (private; all access via signed URLs).
-- storage.objects already has RLS enabled by default with no policies, which
-- means anon/authenticated keys can't touch it — exactly what we want. Signed
-- upload/download URLs work via their token, independent of RLS.
insert into storage.buckets (id, name, public)
values ('lineups', 'lineups', false)
on conflict (id) do nothing;

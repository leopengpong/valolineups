-- One-off migration: drop the `maps` and `agents` tables and switch
-- lineups from FK-keyed (map_id/agent_id uuids) to slug-keyed text.
--
-- Reference data now lives as committed JSON at lib/data/{maps,agents}.json
-- and is refreshed from valorant-api.com at build time by
-- asset_updater/sync-reference.mjs. There are no Postgres rows for maps and
-- agents anymore; lineups just store the slug as text.
--
-- Wrap in a transaction so a partial failure doesn't leave the schema
-- half-migrated.

begin;

-- 1. Add slug columns (nullable for now so the backfill can populate them).
alter table lineups
  add column if not exists map_slug text,
  add column if not exists agent_slug text;

-- 2. Backfill from the joined map/agent names using the same slug rule as
--    lib/slug.ts toSlug(): lowercase, drop "/", collapse non-alphanumeric
--    runs to "-", trim leading/trailing "-".
update lineups l
set map_slug = trim(
  both '-' from regexp_replace(
    lower(replace(m.name, '/', '')),
    '[^a-z0-9]+', '-', 'g'
  )
)
from maps m
where l.map_id = m.id
  and l.map_slug is null;

update lineups l
set agent_slug = trim(
  both '-' from regexp_replace(
    lower(replace(a.name, '/', '')),
    '[^a-z0-9]+', '-', 'g'
  )
)
from agents a
where l.agent_id = a.id
  and l.agent_slug is null;

-- 3. Lock them in.
alter table lineups
  alter column map_slug set not null,
  alter column agent_slug set not null;

-- 4. Drop the old FK columns (this also drops the inline references).
alter table lineups
  drop column if exists map_id,
  drop column if exists agent_id;

-- 5. Rebuild the filter index on the new columns.
drop index if exists lineups_filter_idx;
create index if not exists lineups_filter_idx
  on lineups (map_slug, agent_slug, side);

-- 6. Drop the now-unused reference tables.
drop table if exists maps;
drop table if exists agents;

commit;

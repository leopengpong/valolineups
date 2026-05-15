-- One-off migration: lift "ability" out of custom_fields into its own
-- text[] column on lineups, and allow multiple abilities per lineup.
--
-- Slot keys (ability1 / ability2 / ability3 / ultimate) mirror the keys in
-- lib/data/agents.json, so the icon + display name is derivable from
-- (agent_slug, ability_key) without any per-lineup denormalization.
--
-- No backfill: the legacy custom_fields.ability text was free-form and not
-- slot-mapped, so every existing row gets `abilities = '{}'` and will be
-- re-tagged manually.

begin;

-- 1. Add the new column. CHECK constraint pins values to the four legal slots;
--    empty array satisfies it.
alter table lineups
  add column if not exists abilities text[] not null default '{}'::text[];

alter table lineups
  drop constraint if exists lineups_abilities_check;
alter table lineups
  add constraint lineups_abilities_check
  check (abilities <@ array['ability1','ability2','ability3','ultimate']::text[]);

-- 2. Strip the legacy `ability` key from every row's custom_fields.
update lineups
set custom_fields = custom_fields - 'ability'
where custom_fields ? 'ability';

-- 3. Drop the ability field_definitions row; abilities are no longer a custom
--    field — they live in their own column.
delete from field_definitions where key = 'ability';

commit;

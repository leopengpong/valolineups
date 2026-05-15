-- Valorant Lineups DB — seed
-- Idempotent. Safe to re-run; existing rows by key are left alone.
--
-- Maps and agents are NOT seeded here — they're committed JSON refreshed at
-- build time by asset_updater/sync-reference.mjs. See lib/data/maps.json and
-- lib/data/agents.json.

-- Default custom fields shown on each lineup form.
-- The 3 "primary" fields shown most prominently on cheat-sheet cards
-- are hardcoded by key to: title, ability, stance.
insert into field_definitions (key, label, input_type, sort_order) values
  ('title', 'Title', 'text', 10),
  ('ability', 'Ability', 'text', 20),
  ('stance', 'Stance', 'text', 30),
  ('notes', 'Notes', 'textarea', 40)
on conflict (key) do nothing;

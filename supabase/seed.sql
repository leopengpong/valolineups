-- Valorant Lineups DB — seed
-- Idempotent. Safe to re-run; existing rows by key are left alone.
--
-- Maps and agents are NOT seeded here — they're committed JSON refreshed at
-- build time by asset_updater/sync-reference.mjs. See lib/data/maps.json and
-- lib/data/agents.json.

-- Default custom fields shown on each lineup form.
-- The 2 "primary" custom fields shown most prominently on cheat-sheet cards
-- are hardcoded by key to: title, stance. Ability is NOT a custom field —
-- it lives in its own `lineups.abilities` text[] column (see schema.sql),
-- so the lineup card renders ability icons directly from agents.json.
insert into field_definitions (key, label, input_type, sort_order) values
  ('title', 'Title', 'text', 10),
  ('stance', 'Stance', 'text', 30),
  ('notes', 'Notes', 'textarea', 40)
on conflict (key) do nothing;

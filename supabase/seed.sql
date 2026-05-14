-- Valorant Lineups DB — seed
-- Idempotent. Safe to re-run; existing rows by name/key are left alone.

-- Maps (current + past competitive pool; edit in /settings as needed).
insert into maps (name) values
  ('Ascent'),
  ('Bind'),
  ('Breeze'),
  ('Fracture'),
  ('Haven'),
  ('Icebox'),
  ('Lotus'),
  ('Pearl'),
  ('Split'),
  ('Sunset'),
  ('Abyss'),
  ('Corrode')
on conflict (name) do nothing;

-- Agents (full roster; edit in /settings as needed).
insert into agents (name) values
  ('Astra'),
  ('Breach'),
  ('Brimstone'),
  ('Chamber'),
  ('Clove'),
  ('Cypher'),
  ('Deadlock'),
  ('Fade'),
  ('Gekko'),
  ('Harbor'),
  ('Iso'),
  ('Jett'),
  ('KAY/O'),
  ('Killjoy'),
  ('Neon'),
  ('Omen'),
  ('Phoenix'),
  ('Raze'),
  ('Reyna'),
  ('Sage'),
  ('Skye'),
  ('Sova'),
  ('Tejo'),
  ('Viper'),
  ('Vyse'),
  ('Waylay'),
  ('Yoru')
on conflict (name) do nothing;

-- Default custom fields shown on each lineup form.
-- The 3 "primary" fields shown most prominently on cheat-sheet cards
-- are hardcoded by key to: title, ability, stance.
insert into field_definitions (key, label, input_type, sort_order) values
  ('title', 'Title', 'text', 10),
  ('ability', 'Ability', 'text', 20),
  ('stance', 'Stance', 'text', 30),
  ('notes', 'Notes', 'textarea', 40)
on conflict (key) do nothing;

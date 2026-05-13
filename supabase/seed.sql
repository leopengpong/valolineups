-- Valorant Lineups DB — seed
-- Idempotent. Safe to re-run; existing rows by name/key are left alone.

-- Maps (current + past competitive pool; edit in /settings as needed).
insert into maps (name, sort_order) values
  ('Ascent', 10),
  ('Bind', 20),
  ('Breeze', 30),
  ('Fracture', 40),
  ('Haven', 50),
  ('Icebox', 60),
  ('Lotus', 70),
  ('Pearl', 80),
  ('Split', 90),
  ('Sunset', 100),
  ('Abyss', 110),
  ('Corrode', 120)
on conflict (name) do nothing;

-- Agents (full roster; edit in /settings as needed).
insert into agents (name, sort_order) values
  ('Astra', 10),
  ('Breach', 20),
  ('Brimstone', 30),
  ('Chamber', 40),
  ('Clove', 50),
  ('Cypher', 60),
  ('Deadlock', 70),
  ('Fade', 80),
  ('Gekko', 90),
  ('Harbor', 100),
  ('Iso', 110),
  ('Jett', 120),
  ('KAY/O', 130),
  ('Killjoy', 140),
  ('Neon', 150),
  ('Omen', 160),
  ('Phoenix', 170),
  ('Raze', 180),
  ('Reyna', 190),
  ('Sage', 200),
  ('Skye', 210),
  ('Sova', 220),
  ('Tejo', 230),
  ('Viper', 240),
  ('Vyse', 250),
  ('Waylay', 260),
  ('Yoru', 270)
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

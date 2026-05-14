-- One-off migration: drop the now-unused `sort_order` column from `maps`
-- and `agents`. Both lists are sorted alphabetically by name at query time,
-- and there is no UI for manual reordering of either.
--
-- `field_definitions.sort_order` is intentionally NOT dropped — the lineup
-- card still uses it to order secondary custom fields.

alter table maps drop column if exists sort_order;
alter table agents drop column if exists sort_order;

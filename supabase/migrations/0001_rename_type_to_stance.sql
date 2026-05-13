-- One-off migration: rename the legacy `type` custom-field key to `stance`.
--
-- Run this once in the Supabase SQL editor if you have lineups that were
-- created back when the default custom field was named "Type" (key=`type`)
-- and you've since switched to "Stance" (key=`stance`).
--
-- Safe to re-run: a no-op once every row has been migrated. The CASE wrapper
-- below leaves rows without a `type` key untouched.

-- 1. Make sure the field_definitions row uses key='stance', not key='type'.
--    Only renames if `stance` is not already taken.
update field_definitions
set key = 'stance', label = coalesce(nullif(label, 'Type'), 'Stance')
where key = 'type'
  and not exists (select 1 from field_definitions where key = 'stance');

-- 2. Migrate each lineup's custom_fields JSONB: move the `type` value to
--    `stance`. Avoid clobbering an existing `stance` value.
update lineups
set custom_fields =
  (custom_fields - 'type')
  || jsonb_build_object(
       'stance',
       coalesce(custom_fields ->> 'stance', custom_fields ->> 'type')
     )
where custom_fields ? 'type';

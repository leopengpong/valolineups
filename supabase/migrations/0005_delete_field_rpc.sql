-- Atomic field deletion: strips the field key from all lineup custom_fields
-- in a single UPDATE, then deletes the field_definitions row.
-- Runs in a single transaction so partial failure is impossible.

create or replace function delete_field_and_strip(p_field_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_key text;
begin
  -- Look up the key; raise if not found.
  select key into v_key
  from field_definitions
  where id = p_field_id;

  if not found then
    raise exception 'field_definition not found: %', p_field_id;
  end if;

  -- Strip the key from every lineup that has it.
  update lineups
  set custom_fields = custom_fields - v_key
  where custom_fields ? v_key;

  -- Delete the field definition.
  delete from field_definitions where id = p_field_id;
end;
$$;

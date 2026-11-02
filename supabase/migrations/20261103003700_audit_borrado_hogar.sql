-- Borrar un hogar (o un libro) fallaba: al borrarse en cascada sus registros, audit_row() intentaba guardar en audit_log
-- filas que apuntan al hogar o al libro que se está borrando y la clave foránea lo rechazaba ("audit_log_household_id_fkey"),
-- así que no se podía borrar el hogar, la cuenta ni el usuario de pruebas. Si el hogar o el libro ya no existen, esa fila no
-- se audita (su historial se va con él de todos modos por el ON DELETE CASCADE). Idempotente; no cambia nada más.
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  prev jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  acc text;
  diff jsonb;
  label text;
  v_book uuid := case when rec ? 'book_id' then (rec->>'book_id')::uuid end;
  v_house uuid := case when rec ? 'household_id' then (rec->>'household_id')::uuid end;
begin
  if tg_op = 'DELETE' and (
    (v_book is not null and not exists (select 1 from public.books where id = v_book))
    or (v_house is not null and not exists (select 1 from public.households where id = v_house))
  ) then
    return old;
  end if;
  if tg_op = 'INSERT' then acc := 'crear';
  elsif tg_op = 'DELETE' then acc := 'borrar';
  elsif (prev->>'deleted_at') is null and (rec->>'deleted_at') is not null then acc := 'borrar';
  elsif (prev->>'deleted_at') is not null and (rec->>'deleted_at') is null then acc := 'restaurar';
  else acc := 'editar';
  end if;
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, jsonb_build_object('antes', prev->k, 'despues', rec->k)) into diff
    from jsonb_object_keys(rec) k
    where k not in ('updated_at') and (prev->k) is distinct from (rec->k);
    if diff is null then return new; end if;
  end if;
  label := coalesce(rec->>'descripcion', rec->>'nombre', rec->>'concepto', rec->>'titulo', rec->>'label', rec->>'keyword');
  insert into public.audit_log(book_id, household_id, tabla, row_id, accion, actor, resumen, cambios)
  values (
    v_book,
    v_house,
    tg_table_name,
    case when rec ? 'id' and (rec->>'id') ~ '^[0-9a-f-]{36}$' then (rec->>'id')::uuid end,
    acc, auth.uid(), label, diff
  );
  return coalesce(new, old);
end $$;

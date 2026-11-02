-- Índice para TODA clave foránea de una columna en public que aún no lo tenga (created_by, actor, user_id…).
-- Sin ellos, borrar una cuenta revisaba cada tabla completa (39 s para un usuario) y Supabase Auth cortaba la
-- petición: "eliminar mi cuenta" fallaba. Solo crea índices; idempotente (no repite los que ya existen).
do $$
declare r record; idx text;
begin
  for r in
    select c.conrelid::regclass::text as tabla, cl.relname as tname, a.attname as col
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and array_length(c.conkey, 1) = 1 and c.connamespace = 'public'::regnamespace
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
  loop
    idx := left(r.tname || '_' || r.col || '_fk_idx', 63);
    execute format('create index if not exists %I on %s (%I)', idx, r.tabla, r.col);
  end loop;
end $$;

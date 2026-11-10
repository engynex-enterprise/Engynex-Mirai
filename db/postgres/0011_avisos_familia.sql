-- Avisos de los movimientos de la familia: cuando alguien del hogar registra un gasto (también el pago de un fijo, una
-- suscripción, una cuota o una compra con tarjeta, que crean su gasto), un ingreso extra o una deuda o préstamo nuevo,
-- a los demás miembros del hogar les llega un aviso:
--   · en la app (campana, en vivo por el gateway: la tabla notifications ya avisa con mirai_live_notify), y
--   · por correo, WhatsApp o push: los envía la API desde family_activity (trabajo de cada 5 minutos), según
--     Ajustes › Alertas (fila "Movimientos de tu familia" de la matriz, interruptores de cada canal).
-- Para no llenar de avisos a nadie (importar un extracto crea decenas de gastos), los movimientos de la misma persona
-- en el mismo libro se juntan en un solo aviso mientras sigan llegando con menos de 10 minutos entre uno y otro; el
-- correo o WhatsApp sale cuando la persona lleva 3 minutos sin registrar nada.
-- Solo cuenta lo que registra una persona (auth.uid() o created_by): lo que hace el sistema (cron, automatizaciones
-- sin persona) no avisa. Aditiva: tabla, funciones y triggers nuevos; nada de lo que existe cambia.

create table if not exists public.family_activity (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  -- Quién recibe el aviso y quién hizo los movimientos.
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  n integer not null default 1,
  -- Una línea por movimiento, la más reciente primero (se guardan hasta 30).
  lineas text[] not null default '{}',
  href text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Cuándo la API lo tomó para enviarlo por correo, WhatsApp o push (null = todavía no).
  sent_at timestamptz
);
create index if not exists family_activity_book_idx on public.family_activity (book_id);
create index if not exists family_activity_user_idx on public.family_activity (user_id);
create index if not exists family_activity_actor_idx on public.family_activity (actor_id);
create index if not exists family_activity_pendientes_idx on public.family_activity (updated_at) where sent_at is null;
-- Solo la API (rol de servicio) y los triggers la usan: sin políticas para las personas.
alter table public.family_activity enable row level security;

-- $ 1.234.567 (pesos sin decimales, punto de miles; el espacio no se parte al final de una línea).
create or replace function public.fmt_cop(v numeric) returns text
    language sql immutable
    as $$ select '$' || chr(160) || replace(to_char(round(coalesce(v, 0)), 'FM999,999,999,999,990'), ',', '.') $$;

create or replace function public.notify_family_activity() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  actor uuid := coalesce(auth.uid(), new.created_by);
  hh uuid; quien text; linea text; que text; dest text; r record; fa public.family_activity; titulo text; app_on boolean;
begin
  if actor is null or new.deleted_at is not null then return new; end if;
  select household_id into hh from public.books where id = new.book_id and deleted_at is null;
  if hh is null or not exists (select 1 from public.household_members where household_id = hh and user_id = actor) then return new; end if;
  quien := split_part(coalesce(nullif(btrim(public.person_label(actor)), ''), 'Alguien del hogar'), ' ', 1);
  if TG_TABLE_NAME = 'expenses' then
    linea := format('Gasto: %s · %s', left(coalesce(nullif(btrim(new.descripcion), ''), 'Sin descripción'), 60), public.fmt_cop(new.valor));
    que := 'un gasto'; dest := '/gastos-todos';
  elsif TG_TABLE_NAME = 'extra_incomes' then
    linea := format('Ingreso: %s · %s', left(coalesce(nullif(btrim(new.descripcion), ''), 'Sin descripción'), 60), public.fmt_cop(new.valor));
    que := 'un ingreso'; dest := '/ingresos';
  elsif TG_TABLE_NAME = 'loans' then
    if new.kind = 'cobrar' then
      linea := format('Préstamo que hizo: %s · %s', left(coalesce(nullif(btrim(new.concepto), ''), 'Préstamo'), 60), public.fmt_cop(new.monto));
      que := 'un préstamo que hizo'; dest := '/me-deben';
    else
      linea := format('Deuda nueva: %s · %s', left(coalesce(nullif(btrim(new.concepto), ''), 'Deuda'), 60), public.fmt_cop(new.monto));
      que := 'una deuda'; dest := '/le-debo';
    end if;
  else
    return new;
  end if;

  for r in
    select m.user_id, coalesce(nr.matriz, '{}'::jsonb) as matriz, coalesce(nr.canales, '{}'::jsonb) as canales
    from public.household_members m
    left join public.notification_rules nr on nr.user_id = m.user_id and nr.book_id = new.book_id
    where m.household_id = hh and m.user_id <> actor
      -- Interruptor de la fila "Movimientos de tu familia" (Ajustes › Alertas): apagado = nada, por ningún canal.
      and coalesce(nr.notif ->> 'familia', 'true') <> 'false'
  loop
    -- Si este familiar sigue registrando (menos de 10 minutos desde el último), se suma al mismo aviso.
    select * into fa from public.family_activity
    where book_id = new.book_id and user_id = r.user_id and actor_id = actor and sent_at is null and updated_at > now() - interval '10 minutes'
    order by updated_at desc limit 1 for update;
    if found then
      update public.family_activity set n = n + 1, lineas = (array[linea] || lineas)[1:30], href = case when href = dest then href else '/gastos-todos' end, updated_at = now()
      where id = fa.id returning * into fa;
    else
      insert into public.family_activity (book_id, user_id, actor_id, lineas, href) values (new.book_id, r.user_id, actor, array[linea], dest) returning * into fa;
    end if;
    -- En la app: salvo que la persona apague la fila "Movimientos de tu familia" o el canal "En la app".
    app_on := coalesce(r.matriz -> 'familia' ->> 'app', 'true') <> 'false' and coalesce(r.canales ->> 'app', 'true') <> 'false';
    if app_on then
      titulo := case when fa.n = 1 then format('%s registró %s', quien, que) else format('%s registró %s movimientos', quien, fa.n) end;
      insert into public.notifications (user_id, book_id, kind, titulo, cuerpo, href, dedupe)
      values (r.user_id, new.book_id, 'familia', titulo, array_to_string(fa.lineas[1:5], E'\n') || case when fa.n > 5 then format(E'\n…y %s más', fa.n - 5) else '' end, fa.href, 'fam:' || fa.id)
      on conflict (user_id, dedupe) do update set titulo = excluded.titulo, cuerpo = excluded.cuerpo, href = excluded.href, read_at = null, created_at = now();
    end if;
  end loop;
  return new;
exception when others then
  -- Un aviso nunca puede impedir guardar el movimiento.
  raise warning 'notify_family_activity: %', sqlerrm;
  return new;
end $$;

revoke all on function public.notify_family_activity() from public;

drop trigger if exists family_activity_notify on public.expenses;
create trigger family_activity_notify after insert on public.expenses for each row execute function public.notify_family_activity();
drop trigger if exists family_activity_notify on public.extra_incomes;
create trigger family_activity_notify after insert on public.extra_incomes for each row execute function public.notify_family_activity();
drop trigger if exists family_activity_notify on public.loans;
create trigger family_activity_notify after insert on public.loans for each row execute function public.notify_family_activity();

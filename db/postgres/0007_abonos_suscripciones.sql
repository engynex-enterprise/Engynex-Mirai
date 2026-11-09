-- Abonos en todos los pagos, parte 2: suscripciones y enlaces con un gasto fijo.
--
-- 1. Suscripciones: un cobro se puede pagar en partes ("Ya se cobró" → "Fue un abono"). Un abono NO pasa al siguiente
--    cobro: la suscripción sigue pendiente con lo que falta. `expenses.sub_parcial` marca esos gastos para que el
--    trigger que mueve el próximo cobro los ignore y para que el Balance muestre lo abonado y lo que falta.
-- 2. Enlazar un gasto suelto con un periodo de un gasto fijo que ya tiene abonos: antes se rechazaba ("Ese periodo ya
--    está pagado"); ahora solo se rechaza si el periodo quedó pagado (hay un pago con `cierra` distinto de false).
-- Aditiva: nada cambia para quien paga de una sola vez.

alter table public.expenses add column if not exists sub_parcial boolean;
comment on column public.expenses.sub_parcial is 'true: este gasto es un abono al cobro de la suscripción (el cobro sigue pendiente y no pasa al siguiente).';

-- El trigger que mueve el próximo cobro al borrar o restaurar el gasto: un abono nunca lo mueve.
create or replace function public.expense_subscription_sync() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare s public.subscriptions; step interval;
begin
  if new.sub_proximo is null or coalesce(new.sub_parcial, false) then return new; end if;
  select * into s from public.subscriptions where id = new.subscription_id;
  if not found then return new; end if;
  step := case when s.ciclo = 'anual' then interval '1 year' else interval '1 month' end;
  if old.deleted_at is null and new.deleted_at is not null then
    update public.subscriptions set proximo = new.sub_proximo where id = s.id and proximo = (new.sub_proximo + step)::date;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.subscriptions set proximo = (new.sub_proximo + step)::date where id = s.id and proximo = new.sub_proximo;
  end if;
  return new;
end $$;

drop function if exists public.pay_subscription(uuid, date, numeric, uuid);

create or replace function public.pay_subscription(p_sub uuid, p_fecha date default null, p_valor numeric default null, p_medio uuid default null, p_parcial boolean default false) returns jsonb
    language plpgsql
    set search_path to 'public'
    as $$
declare s public.subscriptions; gid uuid; v numeric := p_valor; f date; hoy date := (now() at time zone 'America/Bogota')::date;
  nxt date; step interval; cat uuid; rate numeric; esperado numeric; abonado numeric; cobro date; parcial boolean := coalesce(p_parcial, false);
begin
  select * into s from public.subscriptions where id = p_sub and deleted_at is null for update;
  if not found then raise exception 'Suscripción no encontrada'; end if;
  if not public.is_book_member(s.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  step := case when s.ciclo = 'anual' then interval '1 year' else interval '1 month' end;
  f := coalesce(p_fecha, case when s.proximo is not null and s.proximo <= hoy then s.proximo else hoy end);
  rate := case when s.currency = 'COP' then 1 else coalesce((select (trm->>s.currency)::numeric from public.book_settings where book_id = s.book_id), 0) end;
  esperado := round(s.valor * rate / greatest(1, s.comparte));
  if v is null then v := esperado; end if;
  if v is null or v <= 0 then raise exception 'Escribe el valor del cobro'; end if;
  cobro := coalesce(s.proximo, f);
  -- Lo que ya abonaste a ESTE cobro (los gastos de abonos anteriores, que siguen vivos).
  select coalesce(sum(valor), 0) into abonado from public.expenses
    where subscription_id = s.id and sub_proximo = cobro and deleted_at is null;
  -- Con el abono se completa el cobro: deja de ser abono y la suscripción pasa al siguiente.
  if parcial and abonado + v >= esperado - 1 then parcial := false; end if;
  cat := coalesce(s.category_id, (select id from public.categories where book_id = s.book_id and nombre = 'Suscripciones' and deleted_at is null limit 1));
  insert into public.expenses(book_id, fecha, descripcion, valor, category_id, payment_method_id, provider_id, hormiga, origen, subscription_id, sub_proximo, sub_parcial)
  values (s.book_id, f, s.nombre || case when parcial then ' (abono)' else '' end, v, cat, coalesce(p_medio, s.payment_method_id), s.provider_id, false, 'manual', s.id, cobro, parcial)
  returning id into gid;
  if parcial then
    nxt := s.proximo;
  else
    nxt := (cobro + step)::date;
    update public.subscriptions set proximo = nxt where id = s.id;
  end if;
  return jsonb_build_object('expense_id', gid, 'proximo', nxt, 'anterior', s.proximo, 'valor', v,
                            'parcial', parcial, 'abonado', abonado + v, 'falta', greatest(0, esperado - abonado - v));
end $$;

revoke all on function public.pay_subscription(uuid, date, numeric, uuid, boolean) from public;
grant all on function public.pay_subscription(uuid, date, numeric, uuid, boolean) to authenticated;
grant all on function public.pay_subscription(uuid, date, numeric, uuid, boolean) to service_role;

-- Buscar los abonos de un cobro sin recorrer la tabla de gastos.
create index if not exists expenses_sub_cobro_idx on public.expenses using btree (subscription_id, sub_proximo) where (deleted_at is null and subscription_id is not null);

drop function if exists public.link_expense_fixed(uuid, uuid, text);

create or replace function public.link_expense_fixed(p_expense uuid, p_fixed uuid, p_periodo text, p_cierra boolean default true) returns jsonb
    language plpgsql
    set search_path to 'public'
    as $$
declare e public.expenses; f public.fixed_expenses; pid uuid; cierra boolean := coalesce(p_cierra, true);
begin
  select * into e from public.expenses where id = p_expense and deleted_at is null for update;
  if not found then raise exception 'Gasto no encontrado'; end if;
  select * into f from public.fixed_expenses where id = p_fixed and deleted_at is null for update;
  if not found or f.book_id <> e.book_id then raise exception 'Gasto fijo no encontrado'; end if;
  if not public.is_book_member(f.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  if e.fixed_expense_id is not null then raise exception 'Este gasto ya es el pago de un gasto fijo'; end if;
  if f.link_type is not null then raise exception 'Los aportes a metas se registran desde Gastos fijos'; end if;
  if e.origen in ('tarjeta','prestamo','aporte','compartido') then raise exception 'Este gasto ya está enlazado con otro registro'; end if;
  if coalesce(p_periodo, '') = '' then raise exception 'Falta el periodo'; end if;
  -- Pagado = hay un pago que cierra el periodo (o uno de antes sin marcar). Los abonos (cierra = false) dejan seguir.
  if exists (select 1 from public.fixed_expense_payments where fixed_expense_id = f.id and periodo = p_periodo and deleted_at is null and cierra is distinct from false) then
    raise exception 'Ese periodo ya está pagado';
  end if;
  update public.expenses set fixed_expense_id = f.id, periodo = p_periodo where id = e.id;
  insert into public.fixed_expense_payments(book_id, fixed_expense_id, periodo, fecha, valor, payment_method_id, expense_id, cierra)
  values (f.book_id, f.id, p_periodo, e.fecha, e.valor, coalesce(e.payment_method_id, f.payment_method_id), e.id, cierra)
  returning id into pid;
  -- Rango variable: se amplía con pagos fuera de rango (solo con pagos que cierran el periodo, no con abonos).
  if f.variable and coalesce(f.vmin, 0) > 0 and cierra then
    if e.valor < f.vmin then update public.fixed_expenses set vmin = e.valor where id = f.id;
    elsif e.valor > f.vmax then update public.fixed_expenses set vmax = e.valor where id = f.id;
    end if;
    update public.fixed_expenses set valor = round((vmin + vmax) / 2) where id = f.id;
  end if;
  return jsonb_build_object('payment_id', pid, 'completo', cierra);
end $$;

grant all on function public.link_expense_fixed(uuid, uuid, text, boolean) to anon;
grant all on function public.link_expense_fixed(uuid, uuid, text, boolean) to authenticated;
grant all on function public.link_expense_fixed(uuid, uuid, text, boolean) to service_role;

notify pgrst, 'reload schema';

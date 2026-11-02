-- F5 · Planes, roles, pagos y automatizaciones (docs/sinergia/mapa.md: P0-8, P0-9, P1-10, P1-12, P1-13).
-- Aditiva e idempotente: pruebas y producción comparten la base.
--   · Lo que restringe (RLS por plan) va detrás de platform_settings.premium_db, APAGADO por defecto.
--   · automation_limit v2 solo corrige el desfase con la app (un plan sin límite en la tabla plans = sin límite).
--   · Los eventos nuevos de automatización se encolan con procesado_at = 'epoch' para que la versión publicada
--     (que solo reclama procesado_at is null) no los consuma sin entenderlos. Solo se encolan si el libro tiene una
--     automatización activa con ese disparador, y esas solo las crea la versión nueva.

-- ── Interruptor ──────────────────────────────────────────────────────────────────────────────────────────────
alter table public.platform_settings add column if not exists premium_db boolean not null default false;
comment on column public.platform_settings.premium_db is 'RLS por plan (impuestos y familia) en la base. Encender solo cuando main tenga el código que lo entiende.';

-- ── ¿El plan del hogar incluye la función? ───────────────────────────────────────────────────────────────────
create or replace function public.household_can(h uuid, f text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.plans p where p.id = public.household_plan(h) and f = any(coalesce(p.funciones, '{}')))
$$;
revoke all on function public.household_can(uuid, text) from public, anon;
grant execute on function public.household_can(uuid, text) to authenticated, service_role;

-- Para las políticas: con el interruptor apagado siempre deja pasar (la versión publicada no cambia).
create or replace function public.book_plan_ok(bk uuid, f text) returns boolean
language sql stable security definer set search_path = public as $$
  select not coalesce((select premium_db from public.platform_settings where id), false)
    or public.household_can((select household_id from public.books where id = bk), f)
$$;
revoke all on function public.book_plan_ok(uuid, text) from public, anon;
grant execute on function public.book_plan_ok(uuid, text) to authenticated, service_role;

-- ── RLS por plan (restrictivas: se suman a las de rol) ───────────────────────────────────────────────────────
-- Solo escrituras: leer y borrar (borrado lógico) siguen libres para que quien baja a Gratis vea y limpie lo suyo.
do $$
declare
  t text;
  f text;
  del text;
begin
  for t, f, del in select * from (values
    ('tax_years', 'impuestos', 'deleted_at is not null'),
    ('tax_assets', 'impuestos', 'deleted_at is not null'),
    ('accountant_shares', 'impuestos', 'revoked_at is not null'),
    ('accountant_notes', 'impuestos', 'deleted_at is not null'),
    ('allowances', 'familia', 'deleted_at is not null'),
    ('allowance_movements', 'familia', 'deleted_at is not null'),
    ('shared_groups', 'familia', 'deleted_at is not null'),
    ('shared_group_expenses', 'familia', 'deleted_at is not null')
  ) as x(t, f, del) loop
    execute format('drop policy if exists %I on public.%I', 'plan crear ' || t, t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.book_plan_ok(book_id, %L))', 'plan crear ' || t, t, f);
    execute format('drop policy if exists %I on public.%I', 'plan editar ' || t, t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (true) with check (public.book_plan_ok(book_id, %L) or %s)', 'plan editar ' || t, t, f, del);
  end loop;
end $$;

-- ── P0-8: límite de automatizaciones único (app = base) ─────────────────────────────────────────────────────
-- Regla (igual a activeLimit en lib/automations/limits.ts): plans.limites.automatizaciones del plan del hogar;
-- número >= 0 = límite, sin dato = sin límite. Si el plan no está en la tabla, el de Gratis por defecto (3).
create or replace function public.plan_automation_limit(h uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case
    when p.id is null then 3
    when jsonb_typeof(p.limites -> 'automatizaciones') = 'number' and (p.limites ->> 'automatizaciones')::numeric >= 0 then floor((p.limites ->> 'automatizaciones')::numeric)::int
    else null end
  from (select 1) one left join public.plans p on p.id = public.household_plan(h)
$$;
revoke all on function public.plan_automation_limit(uuid) from public, anon;
grant execute on function public.plan_automation_limit(uuid) to authenticated, service_role;

create or replace function public.automation_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  lim int;
  n int;
begin
  if not new.activo or new.deleted_at is not null then return new; end if;
  if tg_op = 'UPDATE' and old.activo and old.deleted_at is null then return new; end if;
  lim := public.plan_automation_limit((select household_id from public.books where id = new.book_id));
  if lim is null then return new; end if;
  select count(*) into n from public.automations where book_id = new.book_id and activo and deleted_at is null and id <> new.id;
  if n >= lim then
    raise exception 'Tu plan permite % automatizaciones activas a la vez. Pausa otra o cambia de plan para tener más.', lim;
  end if;
  return new;
end $$;

-- ── P1-12: eventos nuevos (cuotas, compras con tarjeta, suscripciones y agenda) ──────────────────────────────
alter table public.automation_events drop constraint if exists automation_events_tipo_check;
alter table public.automation_events add constraint automation_events_tipo_check
  check (tipo in ('gasto', 'ingreso', 'pago_fijo', 'cuota', 'compra_tarjeta', 'suscripcion', 'recordatorio'));
create index if not exists automation_events_v2_idx on public.automation_events(book_id, created_at) where procesado_at = 'epoch'::timestamptz;

-- Lo que crea una automatización (pagar un fijo, registrar un ingreso) marca la transacción con mirai.automation=on
-- y no se encola: así una automatización nunca se dispara a sí misma ni entra en bucle.
create or replace function public.automation_enqueue() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ev text;
  kinds text[];
  d jsonb;
  v2 boolean := false;
  l public.loans;
begin
  if new.deleted_at is not null then return new; end if;
  if coalesce(current_setting('mirai.automation', true), '') = 'on' then return new; end if;
  if tg_table_name = 'expenses' then
    if coalesce(new.external_id, '') like 'auto:%' then return new; end if;
    ev := 'gasto'; kinds := array['gasto', 'hormiga'];
    d := jsonb_build_object('valor', new.valor, 'descripcion', new.descripcion, 'category_id', new.category_id, 'member_id', new.member_id,
      'fecha', new.fecha, 'hormiga', new.hormiga, 'currency', new.currency, 'origen', new.origen, 'created_by', new.created_by);
  elsif tg_table_name = 'extra_incomes' then
    ev := 'ingreso'; kinds := array['ingreso'];
    d := jsonb_build_object('valor', new.valor, 'descripcion', new.descripcion, 'category_id', new.category_id, 'member_id', new.member_id,
      'fecha', new.fecha, 'currency', new.currency, 'created_by', new.created_by);
  elsif tg_table_name = 'fixed_expense_payments' then
    ev := 'pago_fijo'; kinds := array['pago_fijo'];
    d := jsonb_build_object('valor', new.valor, 'fixed_expense_id', new.fixed_expense_id, 'periodo', new.periodo, 'fecha', new.fecha,
      'descripcion', (select nombre from public.fixed_expenses where id = new.fixed_expense_id),
      'category_id', (select category_id from public.fixed_expenses where id = new.fixed_expense_id));
  elsif tg_table_name = 'loan_payments' then
    -- Los pagos anteriores a Mirai (al crear el préstamo) y la historia importada no disparan nada.
    if coalesce(new.nota, '') = 'Pago anterior a Mirai' or new.fecha < current_date - 31 then return new; end if;
    select * into l from public.loans where id = new.loan_id;
    ev := 'cuota'; kinds := array['cuota']; v2 := true;
    d := jsonb_build_object('valor', new.valor, 'fecha', new.fecha, 'loan_id', new.loan_id, 'tipo_pago', new.tipo, 'dir', l.kind,
      'descripcion', coalesce(nullif(l.concepto, ''), (select nombre from public.contacts where id = l.contact_id), (select nombre from public.entities where id = l.entity_id), nullif(l.acreedor, ''), 'Préstamo'),
      'persona', coalesce((select nombre from public.contacts where id = l.contact_id), (select nombre from public.entities where id = l.entity_id), nullif(l.acreedor, ''), ''),
      'created_by', new.created_by);
  elsif tg_table_name = 'card_purchases' then
    if new.fecha < current_date - 31 then return new; end if;
    ev := 'compra_tarjeta'; kinds := array['compra_tarjeta']; v2 := true;
    d := jsonb_build_object('valor', new.valor, 'descripcion', new.descripcion, 'category_id', new.category_id, 'fecha', new.fecha, 'cuotas', new.cuotas,
      'card_id', new.card_id, 'tarjeta', (select nombre from public.credit_cards where id = new.card_id), 'created_by', new.created_by);
  elsif tg_table_name = 'subscriptions' then
    if tg_op = 'UPDATE' then
      -- "Ya se cobró": la fecha del próximo cobro avanza.
      if new.proximo is null or old.proximo is null or new.proximo <= old.proximo then return new; end if;
      d := jsonb_build_object('evento', 'cobrada', 'fecha', old.proximo, 'proximo', new.proximo);
    else
      d := jsonb_build_object('evento', 'nueva', 'fecha', current_date, 'proximo', new.proximo);
    end if;
    ev := 'suscripcion'; kinds := array['suscripcion']; v2 := true;
    d := d || jsonb_build_object('valor', new.valor, 'descripcion', new.nombre, 'category_id', new.category_id, 'ciclo', new.ciclo, 'created_by', new.created_by);
  elsif tg_table_name = 'calendar_events' then
    -- Las fechas del calendario fiscal (plantillas) y lo que agenda una automatización no cuentan.
    if new.template_key is not null or coalesce(new.nota, '') like 'Creado por la automatización%' then return new; end if;
    ev := 'recordatorio'; kinds := array['recordatorio']; v2 := true;
    d := jsonb_build_object('valor', coalesce(new.monto, 0), 'descripcion', new.titulo, 'fecha', new.fecha, 'tipo', new.tipo, 'created_by', new.created_by);
  else
    return new;
  end if;
  if exists (select 1 from public.automations a where a.book_id = new.book_id and a.activo and a.deleted_at is null and a.disparador = any(kinds)) then
    insert into public.automation_events(book_id, tipo, tabla, row_id, datos, procesado_at)
    values (new.book_id, ev, tg_table_name, new.id, d, case when v2 then 'epoch'::timestamptz end);
  end if;
  return new;
end $$;

drop trigger if exists trg_automation_enqueue on public.loan_payments;
create trigger trg_automation_enqueue after insert on public.loan_payments for each row execute function public.automation_enqueue();
drop trigger if exists trg_automation_enqueue on public.card_purchases;
create trigger trg_automation_enqueue after insert on public.card_purchases for each row execute function public.automation_enqueue();
drop trigger if exists trg_automation_enqueue on public.subscriptions;
create trigger trg_automation_enqueue after insert or update of proximo on public.subscriptions for each row execute function public.automation_enqueue();
drop trigger if exists trg_automation_enqueue on public.calendar_events;
create trigger trg_automation_enqueue after insert on public.calendar_events for each row execute function public.automation_enqueue();

-- ── P1-12: acciones nuevas (las llama el servidor con la clave secreta, en nombre de quien creó la automatización) ──
-- Actúa como esa persona (auth.uid() = p_user): pay_fixed_expense revisa que tenga rol para registrar y la
-- auditoría queda a su nombre.
create or replace function public.automation_as(p_user uuid) returns void
language plpgsql set search_path = public as $$
begin
  perform set_config('mirai.automation', 'on', true);
  if p_user is not null then
    perform set_config('request.jwt.claim.sub', p_user::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  end if;
end $$;
revoke all on function public.automation_as(uuid) from public, anon, authenticated;
grant execute on function public.automation_as(uuid) to service_role;

create or replace function public.automation_pay_fixed(p_user uuid, p_fixed uuid, p_periodo text, p_fecha date, p_valor numeric, p_desc_suffix text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.automation_as(p_user);
  return public.pay_fixed_expense(p_fixed, p_periodo, p_fecha, p_valor, null, coalesce(p_desc_suffix, ''));
end $$;
revoke all on function public.automation_pay_fixed(uuid, uuid, text, date, numeric, text) from public, anon, authenticated;
grant execute on function public.automation_pay_fixed(uuid, uuid, text, date, numeric, text) to service_role;

create or replace function public.automation_create_income(p_user uuid, p_book uuid, p_fecha date, p_descripcion text, p_valor numeric, p_category uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  if p_valor is null or p_valor <= 0 then raise exception 'El ingreso debe ser mayor que cero'; end if;
  if p_category is not null and not exists (select 1 from public.categories where id = p_category and book_id = p_book) then p_category := null; end if;
  perform public.automation_as(p_user);
  insert into public.extra_incomes(book_id, fecha, descripcion, valor, category_id, created_by)
  values (p_book, p_fecha, left(coalesce(nullif(trim(p_descripcion), ''), 'Ingreso automático'), 120), round(p_valor), p_category, p_user)
  returning id into rid;
  return rid;
end $$;
revoke all on function public.automation_create_income(uuid, uuid, date, text, numeric, uuid) from public, anon, authenticated;
grant execute on function public.automation_create_income(uuid, uuid, date, text, numeric, uuid) to service_role;

-- ── P0-9: pago del plan en una sola transacción e idempotente ───────────────────────────────────────────────
-- Reglas (las mismas de lib/payments/state.ts, con sus pruebas):
--   · Un aviso viejo no retrocede un estado final ("pendiente" no pisa "aprobado"; "rechazado" no pisa "aprobado";
--     "reembolsado" y "anulado" son finales).
--   · Se extiende el plan solo la primera vez que el pago queda aprobado (candado por referencia y por hogar: dos
--     notificaciones simultáneas = una sola extensión).
--   · Aprobado → reembolsado/anulado resta el periodo; si ya no queda tiempo, la suscripción pasa a vencida (sin gracia).
--   · El cupón suma un uso en el primer pago aprobado de la suscripción (Mercado Pago cobra cada mes con el mismo
--     cupón: las renovaciones no suman). En Wompi cada pago es una compra nueva y sí suma.
create or replace function public.apply_plan_payment(
  p_household uuid, p_proveedor text, p_referencia text, p_periodo text, p_monto integer, p_estado text,
  p_metodo text default null, p_pagador text default null, p_raw jsonb default '{}', p_subscription_ref text default null,
  p_plan text default 'premium', p_cupon text default null, p_nota text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  prev public.plan_payments;
  est text;
  sub_id uuid;
  pay_id uuid;
  first_ok boolean;
  revoked boolean;
  base timestamptz;
  vence timestamptz;
  step interval := case when p_periodo = 'anio' then interval '1 year' else interval '1 month' end;
  cup text;
  cup_ok boolean := false;
begin
  if p_estado not in ('pendiente', 'aprobado', 'rechazado', 'reembolsado', 'anulado') then raise exception 'Estado de pago inválido: %', p_estado; end if;
  if p_periodo not in ('mes', 'anio') then raise exception 'Periodo inválido: %', p_periodo; end if;
  perform pg_advisory_xact_lock(hashtext('plan_payment:' || p_proveedor || ':' || p_referencia));
  perform pg_advisory_xact_lock(hashtext('plan_household:' || p_household::text));

  select * into prev from public.plan_payments where proveedor = p_proveedor and referencia = p_referencia for update;
  est := case
    when prev.id is null or prev.estado = p_estado then p_estado
    when prev.estado in ('reembolsado', 'anulado') then prev.estado
    when p_estado = 'pendiente' then prev.estado
    when prev.estado = 'aprobado' and p_estado = 'rechazado' then prev.estado
    else p_estado end;
  first_ok := est = 'aprobado' and prev.estado is distinct from 'aprobado';
  revoked := est in ('reembolsado', 'anulado') and prev.estado = 'aprobado';

  sub_id := prev.subscription_id;
  if sub_id is null then
    select s.id into sub_id from public.plan_subscriptions s
    where s.household_id = p_household and s.proveedor = p_proveedor and (p_subscription_ref is null or s.proveedor_ref = p_subscription_ref)
    order by s.created_at desc limit 1;
  end if;
  if sub_id is null and est = 'aprobado' then
    insert into public.plan_subscriptions(household_id, plan, proveedor, proveedor_ref, periodo, estado)
    values (p_household, p_plan, p_proveedor, p_subscription_ref, p_periodo, 'activa') returning id into sub_id;
  end if;

  insert into public.plan_payments(household_id, subscription_id, proveedor, referencia, periodo, monto, estado, metodo, pagador, raw, paid_at, plan, cupon, nota)
  values (p_household, sub_id, p_proveedor, p_referencia, p_periodo, greatest(0, p_monto), est, p_metodo, p_pagador, coalesce(p_raw, '{}'),
    case when est = 'aprobado' then coalesce(prev.paid_at, now()) when est in ('reembolsado', 'anulado') then prev.paid_at end,
    p_plan, coalesce(p_cupon, prev.cupon), p_nota)
  on conflict (proveedor, referencia) do update set
    household_id = excluded.household_id, subscription_id = coalesce(excluded.subscription_id, plan_payments.subscription_id),
    periodo = excluded.periodo, monto = excluded.monto, estado = excluded.estado,
    metodo = coalesce(excluded.metodo, plan_payments.metodo), pagador = coalesce(excluded.pagador, plan_payments.pagador),
    raw = excluded.raw, paid_at = excluded.paid_at, plan = excluded.plan, cupon = excluded.cupon,
    nota = coalesce(excluded.nota, plan_payments.nota)
  returning id into pay_id;

  if first_ok and sub_id is not null then
    -- Desde el vencimiento más lejano del hogar: si paga antes de que se acabe, no pierde días.
    select max(s.vence_at) into base from public.plan_subscriptions s where s.household_id = p_household and s.estado in ('activa', 'cancelada', 'cortesia');
    vence := greatest(coalesce(base, now()), now()) + step;
    update public.plan_subscriptions set estado = 'activa', plan = p_plan, periodo = p_periodo, vence_at = vence where id = sub_id;
    cup := coalesce(p_cupon, prev.cupon);
    if cup is not null and (p_proveedor <> 'mercadopago' or not exists (
      select 1 from public.plan_payments x where x.subscription_id = sub_id and x.id <> pay_id and x.cupon = cup and x.paid_at is not null
    )) then
      update public.coupons set usos = usos + 1 where codigo = cup;
      cup_ok := found;
    end if;
  elsif revoked and sub_id is not null then
    update public.plan_subscriptions s set
      vence_at = s.vence_at - step,
      estado = case when s.vence_at - step <= now() then 'vencida' else s.estado end
    where s.id = sub_id and s.vence_at is not null
    returning s.vence_at into vence;
  end if;

  return jsonb_build_object('subscription_id', sub_id, 'payment_id', pay_id, 'prev_estado', prev.estado, 'estado', est,
    'first_approval', first_ok, 'revoked', revoked, 'vence_at', vence, 'cupon_contado', cup_ok);
end $$;
revoke all on function public.apply_plan_payment(uuid, text, text, text, integer, text, text, text, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_plan_payment(uuid, text, text, text, integer, text, text, text, jsonb, text, text, text, text) to service_role;

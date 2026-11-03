-- v7 · V7-C · Línea base del esquema `public` para la Postgres destino (docs/arquitectura/v7-gcp-total.md §3.7).
-- GENERADA: `node packages/db/scripts/db-destino.mjs baseline --url …` = pg_dump --schema-only --schema=public de
-- 0000_compat + history/supabase_shim + las 56 migraciones de supabase/migrations + 0002_cloud_overrides en Postgres 17.
-- No se edita a mano: los cambios nuevos van en db/postgres/0004_*.sql. Corre después de 0000_compat y 0003_auth_better.

-- Mientras se crea, sin los permisos por defecto de 0000_compat: los GRANT/REVOKE de abajo son exactamente los de la
-- línea histórica (si no, cada función quedaría ejecutable por anon). Al final del archivo se vuelven a poner.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;
--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: accept_invitation(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_invitation(p_token text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare inv public.household_invitations; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Debes iniciar sesión'; end if;
  select * into inv from public.household_invitations where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found then raise exception 'La invitación no existe o ya venció'; end if;
  -- Aceptar dos veces (o con una cuenta que ya es miembro) no repite filas: devuelve el hogar.
  if exists (select 1 from public.household_members where household_id = inv.household_id and user_id = uid) then
    if inv.accepted_at is null then perform public.join_from_invitation(inv.id, uid); end if;
    return inv.household_id;
  end if;
  if inv.accepted_at is not null then raise exception 'Esta invitación ya fue usada. Pide una nueva.'; end if;
  if inv.canceled_at is not null then raise exception 'La invitación fue cancelada. Pide una nueva.'; end if;
  if inv.expires_at <= now() then raise exception 'La invitación no existe o ya venció'; end if;
  perform public.join_from_invitation(inv.id, uid);
  return inv.household_id;
end $$;


--
-- Name: ad_reach(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ad_reach(p_desde date, p_hasta date) RETURNS TABLE(ad_id uuid, alcance bigint, vistas bigint, clics bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select d.ad_id, count(distinct d.user_id) filter (where d.vistas > 0), sum(d.vistas), sum(d.clics)
  from public.ad_user_daily d where d.dia between p_desde and p_hasta and public.is_platform_admin()
  group by d.ad_id
$$;


--
-- Name: ad_track(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ad_track(p_ad uuid, p_slot text, p_kind text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v int := (p_kind = 'vista')::int; c int := (p_kind = 'clic')::int; x int := (p_kind = 'cierre')::int;
  hoy date := (now() at time zone 'America/Bogota')::date;  -- el día de Colombia, igual que en la app
begin
  if p_kind not in ('vista', 'clic', 'cierre') or p_slot not in ('inicio', 'historia', 'consejero', 'lista', 'reportes', 'ticker', 'modal', 'accion') then return; end if;
  if not exists (select 1 from public.ads where id = p_ad and activo) then return; end if;
  insert into public.ad_events (ad_id, dia, slot, vistas, clics, cierres) values (p_ad, hoy, p_slot, v, c, x)
  on conflict (ad_id, dia, slot) do update set vistas = ad_events.vistas + v, clics = ad_events.clics + c, cierres = ad_events.cierres + x;
  if auth.uid() is not null then
    insert into public.ad_user_daily (ad_id, user_id, dia, vistas, clics, cierres) values (p_ad, auth.uid(), hoy, v, c, x)
    on conflict (ad_id, user_id, dia) do update set vistas = ad_user_daily.vistas + v, clics = ad_user_daily.clics + c, cierres = ad_user_daily.cierres + x;
  end if;
end $$;


--
-- Name: add_card_purchase(uuid, date, text, numeric, integer, uuid, boolean, uuid, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_card_purchase(p_card uuid, p_fecha date, p_descripcion text, p_valor numeric, p_cuotas integer DEFAULT 1, p_category uuid DEFAULT NULL::uuid, p_como_gasto boolean DEFAULT true, p_medio uuid DEFAULT NULL::uuid, p_external_id text DEFAULT NULL::text, p_member uuid DEFAULT NULL::uuid, p_provider uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare t public.credit_cards; gid uuid := null; pid uuid; cat uuid := p_category; medio uuid := p_medio;
  f date := coalesce(p_fecha, (now() at time zone 'America/Bogota')::date); d text := coalesce(nullif(trim(p_descripcion), ''), 'Compra con tarjeta');
begin
  select * into t from public.credit_cards where id = p_card and deleted_at is null;
  if not found then raise exception 'Tarjeta no encontrada'; end if;
  if not public.is_book_member(t.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Escribe el valor de la compra'; end if;
  if cat is null then
    select id into cat from public.categories where book_id = t.book_id and nombre = 'Otros' and deleted_at is null limit 1;
  end if;
  if coalesce(p_como_gasto, true) then
    if medio is null then
      select id into medio from public.payment_methods where book_id = t.book_id and deleted_at is null and nombre ~* 'cr[eé]dito' order by sort limit 1;
    end if;
    insert into public.expenses(book_id, fecha, descripcion, valor, category_id, origen, hormiga, payment_method_id, external_id, member_id, provider_id)
    values (t.book_id, f, d, p_valor, cat, 'tarjeta', false, medio, p_external_id, p_member, p_provider)
    returning id into gid;
  end if;
  insert into public.card_purchases(book_id, card_id, fecha, descripcion, valor, cuotas, category_id, expense_id)
  values (t.book_id, t.id, f, d, p_valor, greatest(1, coalesce(p_cuotas, 1)), cat, gid)
  returning id into pid;
  return jsonb_build_object('purchase_id', pid, 'expense_id', gid);
end $$;


--
-- Name: admin_migrations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_migrations() RETURNS TABLE(name text, applied_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ select name, applied_at from public._mirai_migrations order by name $$;


--
-- Name: ai_creditos_desde(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ai_creditos_desde(h uuid, desde timestamp with time zone) RETURNS numeric
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(sum(creditos), 0) from public.ai_usage
  where household_id = h and created_at >= desde
    and (public.is_household_member(h, 'viewer') or public.is_platform_admin() or auth.role() = 'service_role')
$$;


--
-- Name: ai_usage_rollup(date, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ai_usage_rollup(p_desde date, p_household uuid DEFAULT NULL::uuid) RETURNS TABLE(dia date, household_id uuid, plan text, feature text, fuente text, provider text, model text, de_plataforma boolean, ok boolean, llamadas bigint, input_tokens bigint, output_tokens bigint, cached_tokens bigint, tokens_evitados bigint, costo_usd numeric, costo_cop numeric, creditos numeric, duracion_ms bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select (u.created_at at time zone 'America/Bogota')::date, u.household_id, u.plan, u.feature, u.fuente, u.provider, u.model, u.de_plataforma, u.ok,
    count(*), sum(u.input_tokens), sum(u.output_tokens), sum(u.cached_tokens), sum(u.tokens_evitados), sum(u.costo_usd), sum(coalesce(u.costo_cop, 0)), sum(u.creditos), sum(u.duracion_ms)
  from public.ai_usage u
  where u.created_at >= (p_desde::timestamp at time zone 'America/Bogota')
    and (case when p_household is null then public.is_platform_admin() or auth.role() = 'service_role'
              else u.household_id = p_household and (public.is_household_member(p_household, 'viewer') or public.is_platform_admin() or auth.role() = 'service_role') end)
  group by 1, 2, 3, 4, 5, 6, 7, 8, 9
$$;


--
-- Name: api_idempotency_cleanup(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.api_idempotency_cleanup() RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with d as (delete from public.api_idempotency where expires_at < now() - interval '1 hour' returning 1)
  select count(*)::integer from d
$$;


--
-- Name: apply_household_transfer(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_household_transfer(p_household uuid, p_from uuid, p_to uuid, p_from_role text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if p_from_role not in ('admin', 'editor', 'registra', 'viewer') then raise exception 'Ese rol no existe.'; end if;
  update public.household_members set access_role = 'owner' where household_id = p_household and user_id = p_to;
  if not found then raise exception 'Esa persona ya no hace parte del hogar.'; end if;
  update public.household_members set access_role = p_from_role where household_id = p_household and user_id = p_from;
  -- Una solicitud pendiente de antes ya no aplica.
  update public.household_transfers set status = 'cancelada', resolved_at = now()
  where household_id = p_household and status = 'pendiente';
  perform public.log_account_event(p_from, 'hogar_pasado', jsonb_build_object('hogar', (select nombre from public.households where id = p_household), 'a', public.person_label(p_to)));
  perform public.log_account_event(p_to, 'hogar_recibido', jsonb_build_object('hogar', (select nombre from public.households where id = p_household), 'de', public.person_label(p_from)));
end $$;


--
-- Name: apply_plan_payment(uuid, text, text, text, integer, text, text, text, jsonb, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_plan_payment(p_household uuid, p_proveedor text, p_referencia text, p_periodo text, p_monto integer, p_estado text, p_metodo text DEFAULT NULL::text, p_pagador text DEFAULT NULL::text, p_raw jsonb DEFAULT '{}'::jsonb, p_subscription_ref text DEFAULT NULL::text, p_plan text DEFAULT 'premium'::text, p_cupon text DEFAULT NULL::text, p_nota text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    cod text DEFAULT '1995'::text NOT NULL,
    nombre text NOT NULL,
    valor numeric(18,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'COP'::text NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    saldo_base numeric(18,2),
    saldo_fecha date,
    saldo_at timestamp with time zone
);


--
-- Name: asset_cuadrar(uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.asset_cuadrar(p_asset uuid, p_saldo numeric) RETURNS public.assets
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare a public.assets;
begin
  select * into a from public.assets where id = p_asset and deleted_at is null for update;
  if not found then raise exception 'Cuenta no encontrada'; end if;
  if not public.is_book_member(a.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  if p_saldo is null then raise exception 'Escribe el saldo'; end if;
  update public.assets set valor = p_saldo, saldo_base = p_saldo, saldo_fecha = (now() at time zone 'America/Bogota')::date, saldo_at = now()
  where id = a.id returning * into a;
  return a;
end $$;


--
-- Name: audit_row(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_row() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
end $_$;


--
-- Name: automation_as(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.automation_as(p_user uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  perform set_config('mirai.automation', 'on', true);
  if p_user is not null then
    perform set_config('request.jwt.claim.sub', p_user::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  end if;
end $$;


--
-- Name: automation_create_income(uuid, uuid, date, text, numeric, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.automation_create_income(p_user uuid, p_book uuid, p_fecha date, p_descripcion text, p_valor numeric, p_category uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: automation_enqueue(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.automation_enqueue() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: automation_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.automation_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: automation_pay_fixed(uuid, uuid, text, date, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.automation_pay_fixed(p_user uuid, p_fixed uuid, p_periodo text, p_fecha date, p_valor numeric, p_desc_suffix text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.automation_as(p_user);
  return public.pay_fixed_expense(p_fixed, p_periodo, p_fecha, p_valor, null, coalesce(p_desc_suffix, ''));
end $$;


--
-- Name: book_household(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.book_household(bk uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select household_id from public.books where id = bk
$$;


--
-- Name: book_plan_ok(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.book_plan_ok(bk uuid, f text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select not coalesce((select premium_db from public.platform_settings where id), false)
    or public.household_can((select household_id from public.books where id = bk), f)
$$;


--
-- Name: cancel_household_transfer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_household_transfer(p_transfer uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare uid uuid := auth.uid(); t public.household_transfers;
begin
  select * into t from public.household_transfers where id = p_transfer;
  if not found or not (t.from_user = uid or public.member_access(t.household_id, uid) = 'owner') then raise exception 'Esa solicitud no existe.'; end if;
  if t.status <> 'pendiente' then return; end if;
  update public.household_transfers set status = 'cancelada', resolved_at = now(), resolved_by = uid where id = t.id;
  delete from public.notifications where user_id = t.to_user and dedupe = 'transfer:' || t.id and read_at is null;
end $$;


--
-- Name: cancel_my_email_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_my_email_change() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare uid uuid := auth.uid(); pend text;
begin
  if uid is null then raise exception 'Debes iniciar sesión.'; end if;
  select nullif(email_change, '') into pend from auth.users where id = uid;
  if pend is null then return false; end if;
  update auth.users set email_change = '', email_change_token_new = '', email_change_token_current = '',
    email_change_confirm_status = 0, email_change_sent_at = null where id = uid;
  delete from auth.one_time_tokens where user_id = uid and token_type in ('email_change_token_new', 'email_change_token_current');
  perform public.log_account_event(uid, 'correo_cancelado', jsonb_build_object('correo', pend));
  return true;
end $$;


--
-- Name: card_payment_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.card_payment_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.tipo <> 'total' or coalesce(array_length(new.compras, 1), 0) = 0 then return new; end if;
  if old.deleted_at is null and new.deleted_at is not null then
    update public.card_purchases set pagada = false where id = any(new.compras) and pagada;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.card_purchases set pagada = true where id = any(new.compras) and not pagada;
  end if;
  return new;
end $$;


--
-- Name: card_purchase_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.card_purchase_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.sync_enlaces_on() then return new; end if;
  if old.deleted_at is null and new.deleted_at is not null then
    update public.expenses set deleted_at = new.deleted_at where id = new.expense_id and deleted_at is null;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.expenses set deleted_at = null where id = new.expense_id and deleted_at = old.deleted_at;
  elsif new.deleted_at is null then
    update public.expenses set valor = new.valor, fecha = new.fecha, category_id = new.category_id, descripcion = new.descripcion
     where id = new.expense_id and deleted_at is null
       and (valor, fecha, category_id, descripcion) is distinct from (new.valor, new.fecha, new.category_id, new.descripcion);
  end if;
  return new;
end $$;


--
-- Name: count_orphan_households(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_orphan_households() RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select count(*) from public.households h where not exists (select 1 from public.household_members m where m.household_id = h.id)
$$;


--
-- Name: create_book(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_book(p_household uuid, p_nombre text, p_tipo text DEFAULT 'personal'::text, p_icon text DEFAULT 'book'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare bk uuid;
begin
  if not public.is_household_member(p_household, 'editor') then raise exception 'No tienes permiso en este hogar'; end if;
  insert into public.books(household_id, nombre, tipo, icon, created_by) values (p_household, p_nombre, p_tipo, p_icon, auth.uid()) returning id into bk;
  perform public.seed_book_defaults(bk);
  return bk;
end $$;


--
-- Name: create_household(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_household(p_nombre text, p_libro text DEFAULT 'Hogar'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare hh uuid; bk uuid; uid uuid := auth.uid(); nom text;
begin
  if uid is null then raise exception 'Debes iniciar sesión'; end if;
  insert into public.households(nombre, created_by) values (coalesce(nullif(trim(p_nombre),''),'Mi hogar'), uid) returning id into hh;
  insert into public.household_members(household_id, user_id, role) values (hh, uid, 'owner');
  insert into public.books(household_id, nombre, is_default, created_by) values (hh, coalesce(nullif(trim(p_libro),''),'Hogar'), true, uid) returning id into bk;
  perform public.seed_book_defaults(bk);
  select nombre into nom from public.profiles where id = uid;
  insert into public.family_members(household_id, user_id, nombre, rol, es_titular, created_by)
  values (hh, uid, coalesce(nullif(nom,''),'Yo'), 'Titular', true, uid);
  update public.profiles set last_book_id = bk where id = uid;
  return bk;
end $$;


--
-- Name: credit_card_cascade(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.credit_card_cascade() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.card_payments set deleted_at = new.deleted_at where card_id = new.id and deleted_at is null;
    if public.sync_enlaces_on() then
      update public.card_purchases set deleted_at = new.deleted_at where card_id = new.id and deleted_at is null;
    end if;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.card_payments set deleted_at = null where card_id = new.id and deleted_at = old.deleted_at;
    if public.sync_enlaces_on() then
      update public.card_purchases set deleted_at = null where card_id = new.id and deleted_at = old.deleted_at;
    end if;
  end if;
  return new;
end $$;


--
-- Name: delete_orphan_households(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_orphan_households() RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare n bigint;
begin
  with gone as (
    delete from public.households h where not exists (select 1 from public.household_members m where m.household_id = h.id) returning 1
  ) select count(*) into n from gone;
  return n;
end $$;


--
-- Name: enforce_free_limits(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_free_limits() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  lim jsonb;
  n int;
begin
  if not (select limites_db from public.platform_settings where id) then return new; end if;
  select limites into lim from public.plans where id = public.household_plan(new.household_id);
  if lim is null or lim = '{}'::jsonb then return new; end if;
  if tg_table_name = 'books' then
    if new.nombre like 'Ejemplo%' or lim->>'libros' is null then return new; end if;
    select count(*) into n from public.books where household_id = new.household_id and deleted_at is null;
    if n >= (lim->>'libros')::int then raise exception 'Tu plan incluye % libro(s) de cuentas. Cambia de plan para crear más.', lim->>'libros'; end if;
  elsif tg_table_name = 'household_members' then
    if lim->>'personas' is null then return new; end if;
    select count(*) into n from public.household_members where household_id = new.household_id;
    if n >= (lim->>'personas')::int then raise exception 'Tu plan permite % personas por hogar. Cambia de plan para invitar a más.', lim->>'personas'; end if;
  end if;
  return new;
end $$;


--
-- Name: ensure_email_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_email_identity() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'Debes iniciar sesión.'; end if;
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', u.email_confirmed_at is not null, 'phone_verified', false),
         'email', null, now(), now()
  from auth.users u
  where u.id = uid and coalesce(u.encrypted_password, '') <> '' and u.email is not null and u.email_confirmed_at is not null
    and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email')
  on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    update auth.users set raw_app_meta_data = jsonb_set(coalesce(raw_app_meta_data, '{}'::jsonb), '{providers}',
      (select coalesce(jsonb_agg(distinct p), '["email"]'::jsonb) from (
        select jsonb_array_elements_text(coalesce(raw_app_meta_data->'providers', '[]'::jsonb)) p from auth.users where id = uid
        union select 'email') x))
    where id = uid;
  end if;
  return n > 0;
end $$;


--
-- Name: expense_card_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expense_card_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.sync_enlaces_on() then return new; end if;
  if old.deleted_at is null and new.deleted_at is not null then
    update public.card_purchases set deleted_at = new.deleted_at where expense_id = new.id and deleted_at is null;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.card_purchases set deleted_at = null where expense_id = new.id and deleted_at = old.deleted_at;
  elsif new.deleted_at is null then
    update public.card_purchases set valor = new.valor, fecha = new.fecha, category_id = new.category_id, descripcion = new.descripcion
     where expense_id = new.id and deleted_at is null
       and (valor, fecha, category_id, descripcion) is distinct from (new.valor, new.fecha, new.category_id, new.descripcion);
  end if;
  return new;
end $$;


--
-- Name: expense_fixed_edit_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expense_fixed_edit_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a jsonb := new.aporte; d numeric := coalesce(new.valor, 0) - coalesce(old.valor, 0);
begin
  if not public.sync_enlaces_on() then return new; end if;
  update public.fixed_expense_payments set valor = new.valor, fecha = new.fecha
   where expense_id = new.id and deleted_at is null and (valor, fecha) is distinct from (new.valor, new.fecha);
  if a is not null then
    if a->>'t' = 'fondo' then
      if d <> 0 then update public.emergency_funds set saldo = greatest(0, saldo + d) where book_id = new.book_id; end if;
      update public.fund_movements set valor = new.valor, fecha = new.fecha
       where expense_id = new.id and tipo = 'guardar' and deleted_at is null and (valor, fecha) is distinct from (new.valor, new.fecha);
    elsif a->>'t' = 'meta' and d <> 0 then
      update public.goals set ahorrado = greatest(0, ahorrado + d) where id = (a->>'id')::uuid;
    end if;
    if d <> 0 then update public.expenses set aporte = jsonb_set(a, '{v}', to_jsonb(new.valor)) where id = new.id; end if;
  end if;
  return new;
end $$;


--
-- Name: expense_fixed_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expense_fixed_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a jsonb := new.aporte; s numeric;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.fixed_expense_payments set deleted_at = now() where expense_id = new.id and deleted_at is null;
    if a->>'t' = 'fondo' then
      update public.emergency_funds set saldo = greatest(0, saldo - (a->>'v')::numeric) where book_id = new.book_id;
      update public.fund_movements set deleted_at = now() where expense_id = new.id and tipo = 'guardar' and deleted_at is null;
    elsif a->>'t' = 'meta' then
      update public.goals set ahorrado = greatest(0, ahorrado - (a->>'v')::numeric) where id = (a->>'id')::uuid;
    end if;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.fixed_expense_payments set deleted_at = null where expense_id = new.id;
    if a->>'t' = 'fondo' then
      update public.emergency_funds set saldo = saldo + (a->>'v')::numeric where book_id = new.book_id;
      update public.fund_movements set deleted_at = null where expense_id = new.id and tipo = 'guardar';
    elsif a->>'t' = 'meta' then
      update public.goals set ahorrado = ahorrado + (a->>'v')::numeric where id = (a->>'id')::uuid;
    end if;
  end if;
  return new;
end $$;


--
-- Name: expense_fund_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expense_fund_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if coalesce(new.fondo_valor, 0) <= 0 then return new; end if;
  if old.deleted_at is null and new.deleted_at is not null then
    update public.emergency_funds set saldo = saldo + new.fondo_valor where book_id = new.book_id;
    update public.fund_movements set deleted_at = now() where expense_id = new.id and deleted_at is null;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.emergency_funds set saldo = saldo - new.fondo_valor where book_id = new.book_id;
    update public.fund_movements set deleted_at = null where expense_id = new.id;
  end if;
  return new;
end $$;


--
-- Name: expense_member_from_fixed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expense_member_from_fixed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare ids uuid[]; one uuid;
begin
  if new.fixed_expense_id is not null and new.member_id is null and new.member_ids is null then
    select f.member_ids, f.member_id into ids, one from public.fixed_expenses f where f.id = new.fixed_expense_id;
    if cardinality(ids) > 1 then new.member_ids := ids; else new.member_id := coalesce(ids[1], one); end if;
  end if;
  return new;
end $$;


--
-- Name: expense_provider_default(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expense_provider_default() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.provider_id is null and new.fixed_expense_id is not null then
    select provider_id into new.provider_id from public.fixed_expenses where id = new.fixed_expense_id;
  end if;
  return new;
end $$;


--
-- Name: expense_subscription_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expense_subscription_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare s public.subscriptions; step interval;
begin
  if new.sub_proximo is null then return new; end if;
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


--
-- Name: feedback_on_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feedback_on_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  quien text := coalesce((select nullif(nombre, '') from public.profiles where id = new.user_id), 'Alguien');
  que text := case new.tipo when 'calificacion' then 'calificó Mirai con ' || new.rating || ' de 5' when 'error' then 'reportó un error'
    when 'funcion' then 'pidió una función' when 'sugerencia' then 'dejó una sugerencia' when 'pregunta' then 'hizo una pregunta'
    when 'elogio' then 'dejó un elogio' when 'soporte' then 'abrió un caso de soporte' else 'dejó un comentario' end;
begin
  insert into public.notifications (user_id, kind, titulo, cuerpo, href, dedupe)
  select a.user_id, 'opinion', quien || ' ' || que, left(coalesce(nullif(btrim(new.mensaje), ''), 'Sin comentario.'), 200), '/admin/opiniones', 'fb-new-' || new.id
  from public.platform_admins a where a.user_id <> new.user_id
  on conflict (user_id, dedupe) do nothing;
  return new;
end $$;


--
-- Name: feedback_on_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feedback_on_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  label text := case new.estado when 'revisando' then 'la estamos revisando' when 'planeado' then 'está en nuestros planes'
    when 'hecho' then 'ya está lista' when 'descartado' then 'por ahora no la haremos' else 'cambió de estado' end;
begin
  new.updated_at := now();
  if new.respuesta is distinct from old.respuesta and coalesce(btrim(new.respuesta), '') <> '' then
    new.respondido_at := now();
    new.respondido_por := auth.uid();
  end if;
  if (new.respuesta is distinct from old.respuesta and coalesce(btrim(new.respuesta), '') <> '') or new.estado is distinct from old.estado then
    insert into public.notifications (user_id, kind, titulo, cuerpo, href, dedupe)
    values (new.user_id, 'opinion',
      case when new.respuesta is distinct from old.respuesta and coalesce(btrim(new.respuesta), '') <> '' then 'Te respondimos' else 'Tu opinión ' || label end,
      left(coalesce(nullif(btrim(new.respuesta), ''), 'Gracias por ayudarnos a mejorar Mirai.'), 200),
      '/opiniones', 'fb-' || new.id || '-' || extract(epoch from clock_timestamp())::bigint)
    on conflict (user_id, dedupe) do nothing;
  end if;
  return new;
end $$;


--
-- Name: fixed_cascade_soft(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fixed_cascade_soft() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.expenses set deleted_at = new.deleted_at where fixed_expense_id = new.id and deleted_at is null;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.expenses set deleted_at = null where fixed_expense_id = new.id and deleted_at = old.deleted_at;
  end if;
  return new;
end $$;


--
-- Name: fixed_members_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fixed_members_sync() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if new.member_ids is not null and cardinality(new.member_ids) = 0 then new.member_ids := null; end if;
  if tg_op = 'INSERT' or new.member_ids is distinct from old.member_ids then
    new.member_id := case when cardinality(new.member_ids) = 1 then new.member_ids[1] else null end;
  elsif new.member_id is distinct from old.member_id then
    -- La versión publicada solo cambia member_id: se refleja en la lista.
    new.member_ids := case when new.member_id is null then null else array[new.member_id] end;
  end if;
  return new;
end $$;


--
-- Name: fixed_provider_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fixed_provider_sync() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare pid uuid; pname text; txt text;
begin
  if tg_op = 'UPDATE' and new.provider_id is not distinct from old.provider_id and new.proveedor is not distinct from old.proveedor then
    return new;
  end if;
  -- Cambió la FK (versión nueva): el texto toma el nombre del proveedor.
  if new.provider_id is not null and (tg_op = 'INSERT' or new.provider_id is distinct from old.provider_id) then
    select nombre into pname from public.providers where id = new.provider_id and book_id = new.book_id;
    if pname is null then new.provider_id := null; else new.proveedor := pname; return new; end if;
  end if;
  -- Cambió solo el texto (versión publicada, importación o restauración antigua): busca o crea el proveedor.
  if new.link_type is not null then return new; end if;
  txt := regexp_replace(btrim(coalesce(new.proveedor, '')), '\s+', ' ', 'g');
  if txt = '' then new.provider_id := null; return new; end if;
  select id into pid from public.providers
    where book_id = new.book_id and deleted_at is null and public.provider_norm(nombre) = public.provider_norm(txt) limit 1;
  if pid is null then
    insert into public.providers (book_id, nombre, tipo, category_id)
      values (new.book_id, left(txt, 120), public.provider_tipo(txt), new.category_id)
      on conflict (book_id, public.provider_norm(nombre)) where deleted_at is null do nothing
      returning id into pid;
    if pid is null then
      select id into pid from public.providers
        where book_id = new.book_id and deleted_at is null and public.provider_norm(nombre) = public.provider_norm(txt) limit 1;
    end if;
  end if;
  new.provider_id := pid;
  return new;
end $$;


--
-- Name: fund_save(uuid, numeric, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fund_save(p_book uuid, p_valor numeric, p_fecha date, p_nota text DEFAULT ''::text) RETURNS numeric
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare s numeric;
begin
  if not public.is_book_member(p_book, 'editor') then raise exception 'Sin permiso'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'Escribe el valor'; end if;
  insert into public.emergency_funds(book_id, activo, saldo) values (p_book, true, 0) on conflict (book_id) do nothing;
  update public.emergency_funds set activo = true, saldo = saldo + p_valor where book_id = p_book returning saldo into s;
  insert into public.fund_movements(book_id, tipo, valor, fecha, nota) values (p_book, 'guardar', p_valor, p_fecha, coalesce(p_nota, ''));
  return s;
end $$;


--
-- Name: fund_use(uuid, text, numeric, date, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fund_use(p_book uuid, p_desc text, p_valor numeric, p_fecha date, p_medio uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare gid uuid; cat uuid; queda numeric; antes numeric;
begin
  if not public.is_book_member(p_book, 'editor') then raise exception 'Sin permiso'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'Escribe el valor'; end if;
  select id into cat from public.categories where book_id = p_book and lower(nombre) = 'imprevistos' and deleted_at is null limit 1;
  select saldo into antes from public.emergency_funds where book_id = p_book;
  insert into public.expenses(book_id, fecha, descripcion, category_id, valor, payment_method_id, hormiga, hormiga_src, origen)
  values (p_book, p_fecha, coalesce(nullif(trim(p_desc), ''), 'Imprevisto'), cat, p_valor, p_medio, false, 'manual', 'manual') returning id into gid;
  queda := public.use_emergency_fund(gid, p_valor);
  return jsonb_build_object('expense_id', gid, 'cubre', least(p_valor, coalesce(antes, 0)), 'resto', greatest(0, p_valor - coalesce(antes, 0)), 'saldo', queda);
end $$;


--
-- Name: goal_contribute(uuid, numeric, date, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.goal_contribute(p_goal uuid, p_valor numeric, p_fecha date DEFAULT NULL::date, p_nota text DEFAULT ''::text, p_medio uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare g public.goals; mid uuid;
begin
  select * into g from public.goals where id = p_goal and deleted_at is null for update;
  if not found then raise exception 'Meta no encontrada'; end if;
  if not public.is_book_member(g.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Escribe cuánto guardaste'; end if;
  if p_medio is not null and not exists (select 1 from public.payment_methods where id = p_medio and book_id = g.book_id) then p_medio := null; end if;
  insert into public.goal_movements(book_id, goal_id, tipo, valor, fecha, nota, payment_method_id)
  values (g.book_id, g.id, 'abono', p_valor, coalesce(p_fecha, (now() at time zone 'America/Bogota')::date), coalesce(p_nota, ''), p_medio)
  returning id into mid;
  update public.goals set ahorrado = ahorrado + p_valor where id = g.id returning * into g;
  return jsonb_build_object('id', mid, 'goal_id', g.id, 'nombre', g.nombre, 'ahorrado', g.ahorrado, 'objetivo', g.objetivo);
end $$;


--
-- Name: goal_movement_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.goal_movement_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare s numeric := case when new.tipo = 'retiro' then -1 else 1 end;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.goals set ahorrado = greatest(0, ahorrado - s * new.valor) where id = new.goal_id;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.goals set ahorrado = greatest(0, ahorrado + s * new.valor) where id = new.goal_id;
  end if;
  return new;
end $$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare i record;
begin
  insert into public.profiles(id, email, nombre, avatar_url)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'nombre', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'))
  on conflict (id) do nothing;
  insert into public.user_preferences(user_id) values (new.id) on conflict do nothing;
  -- Aceptación de términos y política (Ley 1581) enviada en el registro
  if (new.raw_user_meta_data->>'acepta_version') is not null then
    insert into public.consents(user_id, document, version)
    values (new.id, 'terminos', new.raw_user_meta_data->>'acepta_version'),
           (new.id, 'privacidad', new.raw_user_meta_data->>'acepta_version');
  end if;
  -- Invitaciones pendientes para este correo
  for i in
    select id from public.household_invitations
    where new.email is not null and lower(email) = lower(new.email) and accepted_at is null and canceled_at is null and expires_at > now()
    order by created_at desc
  loop
    begin
      perform public.join_from_invitation(i.id, new.id);
    exception when others then null; -- p. ej. el límite de personas del plan: la persona igual se registra
    end;
  end loop;
  return new;
end $$;


--
-- Name: household_can(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.household_can(h uuid, f text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.plans p where p.id = public.household_plan(h) and f = any(coalesce(p.funciones, '{}')))
$$;


--
-- Name: household_plan(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.household_plan(h uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select s.plan from public.plan_subscriptions s
      where s.household_id = h and s.estado in ('activa', 'cancelada', 'cortesia') and s.vence_at + interval '3 days' > now()
      order by s.vence_at desc limit 1),
    (select 'premium' from public.household_members m join public.platform_admins a on a.user_id = m.user_id
      where m.household_id = h and m.role = 'owner' limit 1),
    'gratis')
$$;


--
-- Name: household_subscription(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.household_subscription(h uuid) RETURNS TABLE(id uuid, plan text, periodo text, estado text, proveedor text, vence_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select s.id, s.plan, s.periodo, s.estado, s.proveedor, s.vence_at from public.plan_subscriptions s
  where s.household_id = h and public.is_household_member(h, 'viewer') and s.estado <> 'pendiente'
  order by s.vence_at desc nulls last limit 1
$$;


--
-- Name: invitation_dest_key(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invitation_dest_key(p_email text, p_phone text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select case when nullif(btrim(coalesce(p_phone, '')), '') is not null
    then 'tel:' || regexp_replace(p_phone, '\D', '', 'g')
    else 'email:' || lower(btrim(coalesce(p_email, ''))) end
$$;


--
-- Name: invitation_info(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invitation_info(p_token text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare inv public.household_invitations; r jsonb;
begin
  select * into inv from public.household_invitations where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found then return jsonb_build_object('estado', 'no_existe'); end if;
  select jsonb_build_object(
    'estado', case when inv.accepted_at is not null then 'aceptada' when inv.canceled_at is not null then 'cancelada' when inv.expires_at <= now() then 'vencida' else 'pendiente' end,
    'hogar', h.nombre,
    'invita', coalesce(nullif(btrim(p.apodo), ''), nullif(btrim(p.nombre), ''), 'Alguien'),
    'rol', coalesce(inv.access_role, inv.role),
    'nombre', inv.nombre,
    'vence', inv.expires_at,
    'ya_miembro', auth.uid() is not null and exists (select 1 from public.household_members m where m.household_id = inv.household_id and m.user_id = auth.uid())
  ) into r
  from public.households h left join public.profiles p on p.id = inv.invited_by
  where h.id = inv.household_id;
  return coalesce(r, jsonb_build_object('estado', 'no_existe'));
end $$;


--
-- Name: invitation_replace_pending(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invitation_replace_pending() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.household_invitations
  set canceled_at = now(), expires_at = least(expires_at, now()), last_result = last_result || '{"cancelada":"reemplazada"}'
  where household_id = new.household_id and accepted_at is null and canceled_at is null
    and dest_key = public.invitation_dest_key(new.email, new.phone);
  return new;
end $$;


--
-- Name: is_book_member(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_book_member(bk uuid, min_role text DEFAULT 'viewer'::text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.books b
    join public.household_members m on m.household_id = b.household_id
    where b.id = bk and m.user_id = auth.uid()
      and public.role_rank(coalesce(m.access_role, m.role)) >= public.role_rank(min_role)
  )
$$;


--
-- Name: is_household_member(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_household_member(hh uuid, min_role text DEFAULT 'viewer'::text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hh and m.user_id = auth.uid()
      and public.role_rank(coalesce(m.access_role, m.role)) >= public.role_rank(min_role)
  )
$$;


--
-- Name: is_platform_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_platform_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;


--
-- Name: join_from_invitation(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_from_invitation(p_inv uuid, p_uid uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare inv public.household_invitations; was boolean; fm uuid; nom text;
begin
  select * into inv from public.household_invitations where id = p_inv;
  if not found or p_uid is null then raise exception 'La invitación no existe o ya venció'; end if;
  was := exists (select 1 from public.household_members where household_id = inv.household_id and user_id = p_uid);
  if not was then
    insert into public.household_members(household_id, user_id, role, access_role)
    values (inv.household_id, p_uid, public.legacy_role(coalesce(inv.access_role, inv.role)), coalesce(inv.access_role, inv.role))
    on conflict (household_id, user_id) do nothing;
  end if;
  if not exists (select 1 from public.family_members where household_id = inv.household_id and user_id = p_uid and deleted_at is null) then
    if inv.family_member_id is not null then
      update public.family_members set user_id = p_uid
      where id = inv.family_member_id and household_id = inv.household_id and user_id is null and deleted_at is null
      returning id into fm;
    end if;
    if fm is null then
      select nombre into nom from public.profiles where id = p_uid;
      insert into public.family_members(household_id, user_id, nombre, rol, created_by)
      values (inv.household_id, p_uid, coalesce(nullif(btrim(inv.nombre), ''), nullif(btrim(nom), ''), 'Integrante'),
              coalesce(nullif(btrim(inv.parentesco), ''), 'Otro familiar'), inv.invited_by);
    end if;
  end if;
  update public.household_invitations set accepted_at = coalesce(accepted_at, now()), accepted_by = coalesce(accepted_by, p_uid) where id = inv.id;
  return case when was then 'already' else 'joined' end;
end $$;


--
-- Name: legacy_role(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.legacy_role(r text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select case r when 'owner' then 'owner' when 'admin' then 'editor' when 'editor' then 'editor' else 'viewer' end
$$;


--
-- Name: link_expense_fixed(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_expense_fixed(p_expense uuid, p_fixed uuid, p_periodo text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare e public.expenses; f public.fixed_expenses; pid uuid;
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
  if exists (select 1 from public.fixed_expense_payments where fixed_expense_id = f.id and periodo = p_periodo and deleted_at is null) then
    raise exception 'Ese periodo ya está pagado';
  end if;
  update public.expenses set fixed_expense_id = f.id, periodo = p_periodo where id = e.id;
  insert into public.fixed_expense_payments(book_id, fixed_expense_id, periodo, fecha, valor, payment_method_id, expense_id)
  values (f.book_id, f.id, p_periodo, e.fecha, e.valor, coalesce(e.payment_method_id, f.payment_method_id), e.id)
  returning id into pid;
  if f.variable and coalesce(f.vmin, 0) > 0 then
    if e.valor < f.vmin then update public.fixed_expenses set vmin = e.valor where id = f.id;
    elsif e.valor > f.vmax then update public.fixed_expenses set vmax = e.valor where id = f.id;
    end if;
    update public.fixed_expenses set valor = round((vmin + vmax) / 2) where id = f.id;
  end if;
  return jsonb_build_object('payment_id', pid);
end $$;


--
-- Name: link_family_member(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_family_member(p_household uuid, p_user uuid, p_family uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_household_member(p_household, 'admin') then raise exception 'Tu rol no permite cambiar las personas del hogar.'; end if;
  if public.member_access(p_household, p_user) is null then raise exception 'Esa persona no hace parte del hogar.'; end if;
  if exists (select 1 from public.family_members where household_id = p_household and user_id = p_user and deleted_at is null and id <> p_family) then
    raise exception 'Esa persona ya está vinculada con otro integrante.';
  end if;
  update public.family_members set user_id = p_user where id = p_family and household_id = p_household and deleted_at is null and (user_id is null or user_id = p_user);
  if not found then raise exception 'Ese integrante ya tiene una cuenta vinculada.'; end if;
end $$;


--
-- Name: loan_acreedor_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.loan_acreedor_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.provider_id is not null then
    select p.nombre into new.acreedor from public.providers p where p.id = new.provider_id;
  elsif tg_op = 'UPDATE' and old.provider_id is not null then
    new.acreedor := null;
  end if;
  return new;
end $$;


--
-- Name: loan_provider_check(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.loan_provider_check() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.provider_id is not null
     and not exists (select 1 from public.providers p where p.id = new.provider_id and p.book_id = new.book_id) then
    new.provider_id := null;
  end if;
  return new;
end $$;


--
-- Name: log_account_event(uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_account_event(p_user uuid, p_kind text, p_detail jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.account_events (user_id, kind, detail) values (p_user, p_kind, coalesce(p_detail, '{}'));
  if random() < 0.01 then delete from public.account_events where created_at < now() - interval '400 days'; end if;
exception when others then null;
end $$;


--
-- Name: member_access(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.member_access(p_household uuid, p_user uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(m.access_role, m.role) from public.household_members m
  where m.household_id = p_household and m.user_id = p_user
    and (auth.role() = 'service_role' or p_user = auth.uid()
         or exists (select 1 from public.household_members me where me.household_id = p_household and me.user_id = auth.uid()))
$$;


--
-- Name: mirai_app_context(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mirai_app_context() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with me as (select auth.uid() as uid),
  hh as (
    select m.household_id as id, h.nombre, m.role, m.access_role, h.created_at
    from public.household_members m
    join public.households h on h.id = m.household_id
    where m.user_id = (select uid from me)
  )
  select jsonb_build_object(
    'profile', (
      select to_jsonb(p) from (
        select id, email, nombre, avatar_url, apodo, nacimiento, last_book_id from public.profiles where id = (select uid from me)
      ) p
    ),
    'admin', exists (select 1 from public.platform_admins a where a.user_id = (select uid from me)),
    'households', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', hh.id, 'nombre', hh.nombre, 'role', hh.role, 'access_role', hh.access_role,
        'plan', (
          select to_jsonb(pl) from (
            select id, nombre, funciones, anuncios, limites, precio_mes from public.plans
            where id = coalesce(public.household_plan(hh.id), 'gratis')
          ) pl
        )
      ) order by hh.created_at)
      from hh
    ), '[]'::jsonb),
    'books', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'nombre', b.nombre, 'tipo', b.tipo, 'icon', b.icon, 'household_id', b.household_id, 'is_default', b.is_default
      ) order by b.created_at)
      from public.books b
      where b.household_id in (select id from hh) and b.deleted_at is null
    ), '[]'::jsonb)
  )
$$;


--
-- Name: mirai_live_notify(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mirai_live_notify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  perform pg_notify('mirai_live', jsonb_strip_nulls(jsonb_build_object(
    't', tg_table_name,
    'op', tg_op,
    'id', r ->> 'id',
    'b', r ->> 'book_id',
    'h', r ->> 'household_id',
    'u', r ->> 'user_id'
  ))::text);
  return null;
end;
$$;


--
-- Name: mirai_live_notify_install(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mirai_live_notify_install(enable boolean DEFAULT true) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  live_tables text[] := array[
    'book_settings', 'categories', 'income_categories', 'entities', 'payment_methods', 'keyword_rules', 'incomes',
    'extra_incomes', 'fixed_expenses', 'expenses', 'fixed_expense_payments', 'subscriptions', 'credit_cards',
    'card_purchases', 'card_payments', 'contacts', 'loans', 'loan_payments', 'assets', 'liabilities', 'investments',
    'goals', 'emergency_funds', 'fund_movements', 'calendar_events', 'shared_groups', 'shared_group_expenses',
    'allowances', 'allowance_movements', 'savings_challenges', 'tax_years', 'tax_assets', 'attachments',
    'accountant_notes', 'advisor_consultations', 'gami_badges', 'wishlist', 'net_worth_snapshots', 'automations',
    'automation_runs', 'providers', 'goal_movements', 'family_members', 'household_members', 'notifications'
  ];
  -- Cola de automatizaciones: solo INSERT (equivale al canal auto:{libro} de features/automations/runner.tsx).
  insert_only text[] := array['automation_events'];
  t text;
  n integer := 0;
begin
  foreach t in array live_tables || insert_only loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop trigger if exists mirai_live_notify on public.%I', t);
    if enable then
      if t = any(insert_only) then
        execute format('create trigger mirai_live_notify after insert on public.%I for each row execute function public.mirai_live_notify()', t);
      else
        execute format('create trigger mirai_live_notify after insert or update or delete on public.%I for each row execute function public.mirai_live_notify()', t);
      end if;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;


--
-- Name: mirai_notify_cron_active(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mirai_notify_cron_active() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ select coalesce((select cron_horario_visto > now() - interval '2 hours' from public.platform_settings where id), false) $$;


--
-- Name: mirai_schedule_notify(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mirai_schedule_notify(site_url text, cron_secret text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return 'Sin cambios: el cron vive en el programador de la nube (POST /v1/jobs/notify/tick).';
end $$;


--
-- Name: my_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_account() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'email', u.email,
    'new_email', nullif(u.email_change, ''),
    'email_change_sent_at', u.email_change_sent_at,
    'email_change_confirm_status', u.email_change_confirm_status,
    'has_password', coalesce(u.encrypted_password, '') <> '',
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'identities', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'provider', i.provider, 'email', coalesce(i.email, i.identity_data->>'email'),
        'last_sign_in_at', i.last_sign_in_at, 'created_at', i.created_at) order by i.created_at)
      from auth.identities i where i.user_id = u.id), '[]'::jsonb)
  )
  from auth.users u where u.id = auth.uid()
$$;


--
-- Name: my_sessions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_sessions() RETURNS TABLE(id uuid, created_at timestamp with time zone, last_active timestamp with time zone, user_agent text, ip text, aal text, actual boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select s.id, s.created_at,
         greatest(s.created_at, s.updated_at, (s.refreshed_at at time zone 'UTC')) as last_active,
         s.user_agent, host(s.ip), s.aal::text, s.id::text = coalesce(auth.jwt()->>'session_id', '')
  from auth.sessions s
  where s.user_id = auth.uid() and (s.not_after is null or s.not_after > now())
  order by 3 desc nulls last
  limit 30
$$;


--
-- Name: notify_claim(text, uuid, uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_claim(p_dedupe text, p_user uuid, p_household uuid, p_book uuid, p_channel text, p_kind text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_id bigint;
begin
  -- Un "enviando" de hace más de 10 minutos quedó interrumpido (se cayó la función): se libera.
  update public.notification_log set status = 'fallido', error = coalesce(error, 'Envío interrumpido')
   where dedupe = p_dedupe and status = 'enviando' and created_at < now() - interval '10 minutes';
  insert into public.notification_log (dedupe, user_id, household_id, book_id, channel, kind, status)
  values (p_dedupe, p_user, p_household, p_book, p_channel, p_kind, 'enviando')
  on conflict (dedupe) where dedupe is not null and status in ('enviando', 'enviado') do nothing
  returning id into v_id;
  return v_id;
end $$;


--
-- Name: on_auth_identity_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_auth_identity_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r record := coalesce(new, old);
begin
  begin
    perform public.log_account_event(r.user_id, case when tg_op = 'INSERT' then 'metodo_conectado' else 'metodo_quitado' end,
      jsonb_build_object('provider', r.provider, 'email', r.identity_data->>'email'));
  exception when others then null;
  end;
  return null;
end $$;


--
-- Name: on_auth_user_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_auth_user_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare n jsonb := to_jsonb(new); o jsonb := to_jsonb(old);
begin
  begin
    if new.email is distinct from old.email then
      update public.profiles set email = new.email where id = new.id;
      perform public.log_account_event(new.id, 'correo_cambiado', jsonb_build_object('antes', old.email, 'despues', new.email));
    end if;
    if n ? 'encrypted_password' and (n ->> 'encrypted_password') is distinct from (o ->> 'encrypted_password') then
      perform public.log_account_event(new.id, 'contrasena', jsonb_build_object('accion',
        case when coalesce(n ->> 'encrypted_password', '') = '' then 'quitada'
             when coalesce(o ->> 'encrypted_password', '') = '' then 'creada' else 'cambiada' end));
    end if;
    if new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null then
      perform public.log_account_event(new.id, 'inicio', '{}');
    end if;
  exception when others then null;
  end;
  return new;
end $$;


--
-- Name: pay_credit_card(uuid, numeric, date, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pay_credit_card(p_card uuid, p_valor numeric, p_fecha date DEFAULT NULL::date, p_tipo text DEFAULT 'otro'::text, p_medio uuid DEFAULT NULL::uuid, p_nota text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare t public.credit_cards; pid uuid; f date := coalesce(p_fecha, (now() at time zone 'America/Bogota')::date); ids uuid[] := '{}';
begin
  select * into t from public.credit_cards where id = p_card and deleted_at is null for update;
  if not found then raise exception 'Tarjeta no encontrada'; end if;
  if not public.is_book_member(t.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Escribe el valor que pagaste'; end if;
  if coalesce(p_tipo, '') not in ('minimo','total','otro') then raise exception 'Tipo de pago no válido'; end if;
  if p_tipo = 'total' then
    select coalesce(array_agg(id), '{}') into ids from public.card_purchases
     where card_id = t.id and deleted_at is null and not pagada and fecha <= f;
    update public.card_purchases set pagada = true where id = any(ids);
  end if;
  insert into public.card_payments(book_id, card_id, fecha, valor, tipo, payment_method_id, compras, nota)
  values (t.book_id, t.id, f, p_valor, p_tipo, p_medio, ids, coalesce(p_nota, ''))
  returning id into pid;
  return jsonb_build_object('payment_id', pid, 'compras', coalesce(array_length(ids, 1), 0));
end $$;


--
-- Name: pay_fixed_expense(uuid, text, date, numeric, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pay_fixed_expense(p_fixed uuid, p_periodo text, p_fecha date, p_valor numeric, p_medio uuid DEFAULT NULL::uuid, p_desc_suffix text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  f public.fixed_expenses; gid uuid; pid uuid; ajuste text := null; aporte jsonb := null; saldo numeric; g public.goals;
begin
  select * into f from public.fixed_expenses where id = p_fixed and deleted_at is null for update;
  if not found then raise exception 'Gasto fijo no encontrado'; end if;
  if not public.is_book_member(f.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Escribe el valor que pagaste'; end if;
  if exists (select 1 from public.fixed_expense_payments where fixed_expense_id = f.id and periodo = p_periodo and deleted_at is null) then
    raise exception 'Ese periodo ya está pagado';
  end if;

  insert into public.expenses(book_id, fecha, descripcion, category_id, valor, payment_method_id, fixed_expense_id, periodo, hormiga, origen)
  values (f.book_id, p_fecha, f.nombre || coalesce(p_desc_suffix, ''), f.category_id, p_valor, coalesce(p_medio, f.payment_method_id), f.id, p_periodo, false,
          case when f.link_type is not null then 'aporte' else 'manual' end)
  returning id into gid;
  insert into public.fixed_expense_payments(book_id, fixed_expense_id, periodo, fecha, valor, payment_method_id, expense_id)
  values (f.book_id, f.id, p_periodo, p_fecha, p_valor, coalesce(p_medio, f.payment_method_id), gid)
  returning id into pid;

  -- Rango variable: se amplía con pagos fuera de rango y el valor de referencia es el punto medio
  if f.variable and coalesce(f.vmin, 0) > 0 then
    if p_valor < f.vmin then update public.fixed_expenses set vmin = p_valor where id = f.id; ajuste := 'min';
    elsif p_valor > f.vmax then update public.fixed_expenses set vmax = p_valor where id = f.id; ajuste := 'max';
    end if;
    update public.fixed_expenses set valor = round((vmin + vmax) / 2) where id = f.id;
  end if;

  -- Aporte programado a meta o fondo
  if f.link_type = 'fondo' then
    update public.emergency_funds set saldo = saldo + p_valor, activo = true where book_id = f.book_id returning saldo into saldo;
    insert into public.fund_movements(book_id, tipo, valor, fecha, nota, expense_id) values (f.book_id, 'guardar', p_valor, p_fecha, 'Aporte programado', gid);
    aporte := jsonb_build_object('t', 'fondo', 'v', p_valor, 'saldo', saldo);
  elsif f.link_type = 'meta' and f.link_id is not null then
    update public.goals set ahorrado = ahorrado + p_valor where id = f.link_id and book_id = f.book_id returning * into g;
    if found then aporte := jsonb_build_object('t', 'meta', 'id', g.id, 'v', p_valor, 'nombre', g.nombre, 'ahorrado', g.ahorrado, 'objetivo', g.objetivo); end if;
  end if;
  if aporte is not null then update public.expenses set aporte = aporte where id = gid; end if;

  return jsonb_build_object('expense_id', gid, 'payment_id', pid, 'ajuste', ajuste, 'aporte', aporte);
end $$;


--
-- Name: pay_subscription(uuid, date, numeric, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pay_subscription(p_sub uuid, p_fecha date DEFAULT NULL::date, p_valor numeric DEFAULT NULL::numeric, p_medio uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare s public.subscriptions; gid uuid; v numeric := p_valor; f date; hoy date := (now() at time zone 'America/Bogota')::date;
  nxt date; step interval; cat uuid; rate numeric;
begin
  select * into s from public.subscriptions where id = p_sub and deleted_at is null for update;
  if not found then raise exception 'Suscripción no encontrada'; end if;
  if not public.is_book_member(s.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  step := case when s.ciclo = 'anual' then interval '1 year' else interval '1 month' end;
  f := coalesce(p_fecha, case when s.proximo is not null and s.proximo <= hoy then s.proximo else hoy end);
  if v is null then
    rate := case when s.currency = 'COP' then 1 else coalesce((select (trm->>s.currency)::numeric from public.book_settings where book_id = s.book_id), 0) end;
    v := round(s.valor * rate / greatest(1, s.comparte));
  end if;
  if v is null or v <= 0 then raise exception 'Escribe el valor del cobro'; end if;
  cat := coalesce(s.category_id, (select id from public.categories where book_id = s.book_id and nombre = 'Suscripciones' and deleted_at is null limit 1));
  insert into public.expenses(book_id, fecha, descripcion, valor, category_id, payment_method_id, provider_id, hormiga, origen, subscription_id, sub_proximo)
  values (s.book_id, f, s.nombre, v, cat, coalesce(p_medio, s.payment_method_id), s.provider_id, false, 'manual', s.id, coalesce(s.proximo, f))
  returning id into gid;
  nxt := (coalesce(s.proximo, f) + step)::date;
  update public.subscriptions set proximo = nxt where id = s.id;
  return jsonb_build_object('expense_id', gid, 'proximo', nxt, 'anterior', s.proximo, 'valor', v);
end $$;


--
-- Name: person_label(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.person_label(p_user uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(nullif(btrim(p.apodo), ''), nullif(split_part(btrim(p.nombre), ' ', 1), ''), split_part(p.email, '@', 1), 'Alguien')
  from public.profiles p where p.id = p_user
$$;


--
-- Name: plan_automation_limit(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.plan_automation_limit(h uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case
    when p.id is null then 3
    when jsonb_typeof(p.limites -> 'automatizaciones') = 'number' and (p.limites ->> 'automatizaciones')::numeric >= 0 then floor((p.limites ->> 'automatizaciones')::numeric)::int
    else null end
  from (select 1) one left join public.plans p on p.id = public.household_plan(h)
$$;


--
-- Name: profiles_lock_email(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.profiles_lock_email() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.email is distinct from old.email and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    new.email := coalesce((select u.email from auth.users u where u.id = new.id), old.email);
  end if;
  return new;
end $$;


--
-- Name: provider_method_check(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.provider_method_check() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.payment_method_id is not null
     and not exists (select 1 from public.payment_methods m where m.id = new.payment_method_id and m.book_id = new.book_id) then
    new.payment_method_id := null;
  end if;
  return new;
end $$;


--
-- Name: provider_norm(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.provider_norm(s text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$
  select btrim(regexp_replace(regexp_replace(lower(translate(coalesce(s, ''),
    'ÁÉÍÓÚÜÀÈÌÒÙáéíóúüàèìòù', 'AEIOUUAEIOUaeiouuaeiou')), '[.,]', '', 'g'), '\s+', ' ', 'g'))
$$;


--
-- Name: provider_rename_loans(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.provider_rename_loans() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.nombre is distinct from old.nombre then
    update public.loans set acreedor = new.nombre where provider_id = new.id;
  end if;
  return new;
end $$;


--
-- Name: provider_rename_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.provider_rename_sync() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.nombre is distinct from old.nombre then
    update public.fixed_expenses set proveedor = new.nombre where provider_id = new.id and proveedor is distinct from new.nombre;
  end if;
  return new;
end $$;


--
-- Name: provider_tipo(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.provider_tipo(s text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$
  select case
    when n ~ '(acueducto|alcantarillado|energia|\menel\M|\mepm\M|\mvanti\M|\mgas\M|aseo|codensa|electrific|empresas publicas|servicios publicos|\maaa\M|emcali|air-e|afinia|\messa\M|celsia)' then 'servicios'
    when n ~ '(internet|claro|movistar|\mtigo\M|\metb\M|\mwom\M|\mune\M|directv|operador|celular|telefon|fibra)' then 'telecom'
    when n ~ '(inmobiliaria|arriendo|arrendador|conjunto|administracion|propiedad horizontal|edificio|\mph\M)' then 'vivienda'
    when n ~ '(\meps\M|salud|sanitas|\msura\M|compensar|colsanitas|medic|clinica|hospital|odontolog|prepagada|nueva eps|famisanar|salud total)' then 'salud'
    when n ~ '(colegio|universidad|jardin|escuela|instituto|academia|icetex|liceo|gimnasio moderno)' then 'educacion'
    when n ~ '(transporte|transmilenio|\mmetro\M|peaje|parqueadero|gasolina|terpel|primax|\mtaxi\M|ruta escolar)' then 'transporte'
    when n ~ '(seguro|asegurador|aseguradora|allianz|mapfre|axa colpatria|liberty|soat|previsora)' then 'seguros'
    when n ~ '(netflix|spotify|disney|youtube|prime video|\mhbo\M|\mmax\M|apple|icloud|google one|microsoft|suscrip)' then 'suscripciones'
    when n ~ '(exito|carulla|jumbo|olimpica|\md1\M|\mara\M|alkosto|falabella|homecenter|tienda|supermercado|drogueria|colsubsidio|cafam)' then 'comercio'
    else 'otro' end
  from (select public.provider_norm(s) as n) x
$$;


--
-- Name: rate_limit_hit(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rate_limit_hit(p_key text, p_max integer, p_window_s integer) RETURNS TABLE(ok boolean, remaining integer, reset_ms bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  w integer := greatest(1, least(coalesce(p_window_s, 60), 86400));
  ws timestamptz := to_timestamp(floor(extract(epoch from now()) / w) * w);
  n integer;
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 300 then raise exception 'Clave de límite inválida'; end if;
  insert into public.rate_limits as r (key, window_start, count) values (p_key, ws, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into n;
  -- Limpieza ocasional de ventanas viejas.
  if random() < 0.02 then delete from public.rate_limits where window_start < now() - interval '2 days'; end if;
  return query select n <= greatest(p_max, 0), greatest(p_max - n, 0), ((extract(epoch from ws) + w - extract(epoch from now())) * 1000)::bigint;
end $$;


--
-- Name: registro_abierto(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registro_abierto() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select registro_abierto from public.platform_settings where id), true)
$$;


--
-- Name: remove_household_member(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_household_member(p_household uuid, p_user uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare actor text := public.member_access(p_household, auth.uid()); target text := public.member_access(p_household, p_user);
begin
  if target is null then return; end if;
  if p_user <> auth.uid() then
    if actor is null or public.role_rank(actor) < public.role_rank('admin') then raise exception 'Tu rol no permite quitar personas del hogar.'; end if;
    if target = 'owner' and actor <> 'owner' then raise exception 'No puedes quitar al dueño del hogar.'; end if;
  end if;
  if target = 'owner' and (select count(*) from public.household_members where household_id = p_household and coalesce(access_role, role) = 'owner') < 2 then
    raise exception 'El dueño no puede salir del hogar sin pasárselo antes a otra persona.';
  end if;
  -- Su integrante se queda (con sus gastos e ingresos asignados) como persona sin cuenta.
  update public.family_members set user_id = null where household_id = p_household and user_id = p_user;
  delete from public.household_members where household_id = p_household and user_id = p_user;
end $$;


--
-- Name: remove_my_password(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_my_password() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Debes iniciar sesión.'; end if;
  if not exists (select 1 from auth.identities where user_id = uid and provider <> 'email') then
    raise exception 'Tu contraseña es tu única forma de entrar. Conecta Google antes de quitarla.';
  end if;
  update auth.users set encrypted_password = null where id = uid;
end $$;


--
-- Name: request_household_transfer(uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_household_transfer(p_household uuid, p_user uuid, p_from_role text, p_plan_action text, p_confirm text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare uid uuid := auth.uid(); hogar text; tid uuid; target text;
begin
  if public.member_access(p_household, uid) is distinct from 'owner' then raise exception 'Solo el dueño puede pasar el hogar a otra persona.'; end if;
  if p_user = uid then raise exception 'Ya eres el dueño del hogar.'; end if;
  target := public.member_access(p_household, p_user);
  if target is null then raise exception 'Esa persona no hace parte del hogar. Invítala primero.'; end if;
  if target = 'owner' then raise exception 'Esa persona ya es dueña del hogar.'; end if;
  if coalesce(p_from_role, '') not in ('admin', 'editor', 'registra', 'viewer') then raise exception 'Elige qué rol quieres tener después.'; end if;
  if coalesce(p_plan_action, '') not in ('seguir', 'cancelar') then raise exception 'Elige qué pasa con el pago del plan.'; end if;
  select nombre into hogar from public.households where id = p_household;
  if lower(btrim(coalesce(p_confirm, ''))) <> lower(btrim(hogar)) then raise exception 'Escribe el nombre del hogar tal como aparece para confirmar.'; end if;
  update public.household_transfers set status = 'cancelada', resolved_at = now(), resolved_by = uid
  where household_id = p_household and status = 'pendiente';
  insert into public.household_transfers (household_id, from_user, to_user, from_role, plan_action)
  values (p_household, uid, p_user, p_from_role, p_plan_action) returning id into tid;
  insert into public.notifications (user_id, book_id, kind, titulo, cuerpo, href, dedupe)
  values (p_user, null, 'hogar', format('%s quiere pasarte el hogar “%s”', public.person_label(uid), hogar),
          'Serás el dueño: el plan y borrar el hogar quedarán en tus manos. Tienes 7 días para aceptar o rechazar.',
          '/ajustes?tab=cuenta', 'transfer:' || tid)
  on conflict (user_id, dedupe) do nothing;
  return tid;
end $$;


--
-- Name: respond_household_transfer(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.respond_household_transfer(p_transfer uuid, p_accept boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare uid uuid := auth.uid(); t public.household_transfers; hogar text; quien text;
begin
  select * into t from public.household_transfers where id = p_transfer for update;
  if not found or t.to_user is distinct from uid then raise exception 'Esa solicitud no existe o no es para ti.'; end if;
  update public.notifications set read_at = coalesce(read_at, now()) where user_id = uid and dedupe = 'transfer:' || t.id;
  if t.status <> 'pendiente' then return jsonb_build_object('estado', t.status, 'household_id', t.household_id); end if;
  select nombre into hogar from public.households where id = t.household_id;
  quien := public.person_label(uid);
  if t.expires_at <= now() then
    update public.household_transfers set status = 'vencida', resolved_at = now() where id = t.id;
    return jsonb_build_object('estado', 'vencida', 'household_id', t.household_id);
  end if;
  if public.member_access(t.household_id, t.from_user) is distinct from 'owner' or public.member_access(t.household_id, uid) is null then
    update public.household_transfers set status = 'cancelada', resolved_at = now() where id = t.id;
    return jsonb_build_object('estado', 'no_aplica', 'household_id', t.household_id);
  end if;
  if p_accept then
    perform public.apply_household_transfer(t.household_id, t.from_user, uid, t.from_role);
    update public.household_transfers set status = 'aceptada', resolved_at = now(), resolved_by = uid where id = t.id;
  else
    update public.household_transfers set status = 'rechazada', resolved_at = now(), resolved_by = uid where id = t.id;
  end if;
  insert into public.notifications (user_id, book_id, kind, titulo, cuerpo, href, dedupe)
  values (t.from_user, null, 'hogar',
          case when p_accept then format('%s aceptó: ahora es dueño de “%s”', quien, hogar) else format('%s no aceptó ser dueño de “%s”', quien, hogar) end,
          case when p_accept then 'Tú sigues en el hogar con el rol que escogiste.' else 'Sigues siendo el dueño del hogar.' end,
          '/ajustes?tab=hogar', 'transfer-res:' || t.id)
  on conflict (user_id, dedupe) do nothing;
  return jsonb_build_object('estado', case when p_accept then 'aceptada' else 'rechazada' end, 'household_id', t.household_id,
    'from_user', t.from_user, 'plan_action', t.plan_action);
end $$;


--
-- Name: revoke_my_session(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_my_session(p_session uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'Debes iniciar sesión.'; end if;
  if p_session::text = coalesce(auth.jwt()->>'session_id', '') then
    raise exception 'Esta es la sesión que estás usando. Para cerrarla, toca Cerrar sesión.';
  end if;
  delete from auth.sessions where id = p_session and user_id = uid;
  get diagnostics n = row_count;
  if n > 0 then perform public.log_account_event(uid, 'sesion_cerrada', '{}'); end if;
  return n > 0;
end $$;


--
-- Name: role_rank(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.role_rank(r text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  select case r when 'owner' then 50 when 'admin' then 40 when 'editor' then 30 when 'registra' then 20 when 'viewer' then 10 else 0 end
$$;


--
-- Name: seed_book_defaults(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_book_defaults(bk uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.book_settings(book_id) values (bk) on conflict do nothing;
  insert into public.emergency_funds(book_id) values (bk) on conflict do nothing;
  insert into public.gami_state(book_id) values (bk) on conflict do nothing;

  if not exists (select 1 from public.categories where book_id = bk) then
    insert into public.categories(book_id, nombre, grupo, icon, sort) values
      (bk,'Vivienda','n','house',1),(bk,'Servicios públicos','n','zap',2),(bk,'Mercado','n','shopping-cart',3),
      (bk,'Transporte','n','car',4),(bk,'Educación','n','graduation-cap',5),(bk,'Salud','n','heart-pulse',6),
      (bk,'Comisiones bancarias','n','landmark',7),(bk,'Mascotas','n','dog',8),(bk,'Imprevistos','n','siren',9),
      (bk,'Restaurantes','g','utensils',10),(bk,'Café','g','coffee',11),(bk,'Domicilios','g','bike',12),
      (bk,'Snacks','g','cookie',13),(bk,'Entretenimiento','g','film',14),(bk,'Suscripciones','g','repeat',15),
      (bk,'Ropa','g','shirt',16),(bk,'Regalos','g','gift',17),(bk,'Viajes','g','plane',18),
      (bk,'Ahorro','a','piggy-bank',19),(bk,'Inversión','a','trending-up',20),(bk,'Otros','g','circle-ellipsis',21);
  end if;
  if not exists (select 1 from public.income_categories where book_id = bk) then
    insert into public.income_categories(book_id, nombre, icon, sort) values
      (bk,'Salario','briefcase',1),(bk,'Honorarios','file-text',2),(bk,'Arriendos','house',3),
      (bk,'Negocio propio','store',4),(bk,'Intereses y rendimientos','percent',5),(bk,'Otros ingresos','coins',6);
  end if;
  if not exists (select 1 from public.entities where book_id = bk) then
    insert into public.entities(book_id, nombre, tipo) values
      (bk,'Bancolombia','Banco'),(bk,'Banco de Bogotá','Banco'),(bk,'Davivienda','Banco'),(bk,'BBVA Colombia','Banco'),
      (bk,'Banco de Occidente','Banco'),(bk,'Banco Popular','Banco'),(bk,'Scotiabank Colpatria','Banco'),
      (bk,'Banco Caja Social','Banco'),(bk,'Banco AV Villas','Banco'),(bk,'Banco Agrario','Banco'),
      (bk,'Fondo Nacional del Ahorro','Fondo'),(bk,'Nu Colombia','Fintech'),(bk,'Lulo Bank','Fintech'),
      (bk,'Nequi','Billetera'),(bk,'Daviplata','Billetera'),(bk,'Cooperativa de ahorro y crédito','Cooperativa');
  end if;
  if not exists (select 1 from public.payment_methods where book_id = bk) then
    insert into public.payment_methods(book_id, nombre, icon, sort) values
      (bk,'Efectivo','banknote',1),(bk,'Tarjeta débito','credit-card',2),(bk,'Tarjeta de crédito','credit-card',3),
      (bk,'Transferencia','arrow-left-right',4),(bk,'Nequi / Daviplata','smartphone',5);
  end if;
  if not exists (select 1 from public.calendar_events where book_id = bk) then
    insert into public.calendar_events(book_id, titulo, fecha, tipo, nota, template_key) values
      (bk,'Intereses sobre cesantías', make_date(extract(year from now())::int,1,31),'ingreso','Tu empleador te los paga a más tardar el 31 de enero.','int_cesantias'),
      (bk,'Consignación de cesantías al fondo', make_date(extract(year from now())::int,2,14),'ingreso','Plazo para que tu empleador consigne las cesantías en tu fondo.','cesantias'),
      (bk,'Prima de servicios de junio', make_date(extract(year from now())::int,6,30),'ingreso','Medio salario por semestre trabajado.','prima_jun'),
      (bk,'Prima de servicios de diciembre', make_date(extract(year from now())::int,12,20),'ingreso','Plazo legal: 20 de diciembre.','prima_dic');
  end if;
end $$;


--
-- Name: set_member_access(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_member_access(p_household uuid, p_user uuid, p_access text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare actor text := public.member_access(p_household, auth.uid()); target text := public.member_access(p_household, p_user);
begin
  if actor is null or public.role_rank(actor) < public.role_rank('admin') then raise exception 'Tu rol no permite cambiar el rol de los demás.'; end if;
  if p_access not in ('admin','editor','registra','viewer') then raise exception 'Ese rol no existe. Para que alguien sea dueño, pásale el hogar.'; end if;
  if target is null then raise exception 'Esa persona ya no hace parte del hogar.'; end if;
  if p_user = auth.uid() then raise exception 'No puedes cambiar tu propio rol.'; end if;
  if target = 'owner' and actor <> 'owner' then raise exception 'Solo el dueño puede cambiar el rol de otro dueño.'; end if;
  if public.role_rank(p_access) > public.role_rank(actor) then raise exception 'No puedes dar un rol con más permisos que el tuyo.'; end if;
  update public.household_members set access_role = p_access where household_id = p_household and user_id = p_user;
end $$;


--
-- Name: shared_expense_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.shared_expense_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.sync_enlaces_on() then return new; end if;
  if old.deleted_at is null and new.deleted_at is not null then
    update public.expenses set deleted_at = new.deleted_at where id = new.expense_id and deleted_at is null;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.expenses set deleted_at = null where id = new.expense_id and deleted_at = old.deleted_at;
  end if;
  return new;
end $$;


--
-- Name: shared_group_cascade(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.shared_group_cascade() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.sync_enlaces_on() then return new; end if;
  if old.deleted_at is null and new.deleted_at is not null then
    update public.shared_group_expenses set deleted_at = new.deleted_at where group_id = new.id and deleted_at is null;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.shared_group_expenses set deleted_at = null where group_id = new.id and deleted_at = old.deleted_at;
  end if;
  return new;
end $$;


--
-- Name: sync_enlaces_on(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_enlaces_on() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare h text := current_setting('request.headers', true);
begin
  if coalesce((select sync_enlaces from public.platform_settings where id), false) then return true; end if;
  if h is null or h = '' then return false; end if;
  return coalesce((h::jsonb)->>'x-mirai-enlaces', '') = '1';
exception when others then return false;
end $$;


--
-- Name: sync_invitation_access(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_invitation_access() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if tg_op = 'INSERT' or new.access_role is distinct from old.access_role then
    new.access_role := coalesce(new.access_role, new.role);
  elsif new.role is distinct from old.role and public.legacy_role(old.access_role) <> new.role then
    new.access_role := new.role;
  end if;
  new.role := public.legacy_role(new.access_role);
  if new.email is not null then new.email := lower(btrim(new.email)); end if;
  return new;
end $$;


--
-- Name: sync_member_access(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_member_access() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if tg_op = 'INSERT' then
    new.access_role := coalesce(new.access_role, new.role);
  elsif new.access_role is distinct from old.access_role then
    new.access_role := coalesce(new.access_role, new.role);
  elsif new.role is distinct from old.role then
    -- La versión publicada cambia `role`: si el nivel nuevo ya corresponde al rol fino, se conserva.
    if public.legacy_role(old.access_role) <> new.role then new.access_role := new.role; end if;
  end if;
  new.role := public.legacy_role(new.access_role);
  return new;
end $$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end $$;


--
-- Name: transfer_household(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transfer_household(p_household uuid, p_user uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if public.member_access(p_household, auth.uid()) is distinct from 'owner' then raise exception 'Solo el dueño puede pasar el hogar a otra persona.'; end if;
  if p_user = auth.uid() then raise exception 'Ya eres el dueño del hogar.'; end if;
  if public.member_access(p_household, p_user) is null then raise exception 'Esa persona no hace parte del hogar.'; end if;
  perform public.apply_household_transfer(p_household, auth.uid(), p_user, 'admin');
end $$;


--
-- Name: try_uuid(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.try_uuid(t text) RETURNS uuid
    LANGUAGE plpgsql IMMUTABLE
    AS $$
begin return t::uuid; exception when others then return null; end $$;


--
-- Name: unlink_expense_fixed(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unlink_expense_fixed(p_expense uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare e public.expenses;
begin
  select * into e from public.expenses where id = p_expense;
  if not found then raise exception 'Gasto no encontrado'; end if;
  if not public.is_book_member(e.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  if e.aporte is not null then raise exception 'Este pago es un aporte: deshazlo desde Gastos fijos'; end if;
  update public.fixed_expense_payments set deleted_at = now() where expense_id = e.id and deleted_at is null;
  update public.expenses set fixed_expense_id = null, periodo = null where id = e.id;
end $$;


--
-- Name: unpay_fixed_expense(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unpay_fixed_expense(p_payment uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare p public.fixed_expense_payments;
begin
  select * into p from public.fixed_expense_payments where id = p_payment and deleted_at is null;
  if not found then raise exception 'Pago no encontrado'; end if;
  if not public.is_book_member(p.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  update public.fixed_expense_payments set deleted_at = now() where id = p.id;
  if p.expense_id is not null then update public.expenses set deleted_at = now() where id = p.expense_id and deleted_at is null; end if;
end $$;


--
-- Name: use_emergency_fund(uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.use_emergency_fund(p_expense uuid, p_valor numeric) RETURNS numeric
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare e public.expenses; f public.emergency_funds; usado numeric;
begin
  select * into e from public.expenses where id = p_expense;
  if not found then raise exception 'Gasto no encontrado'; end if;
  if not public.is_book_member(e.book_id, 'editor') then raise exception 'Sin permiso'; end if;
  select * into f from public.emergency_funds where book_id = e.book_id for update;
  if not found or not f.activo then raise exception 'El fondo de emergencia no está activo'; end if;
  usado := least(p_valor, f.saldo);
  if usado <= 0 then return 0; end if;
  update public.emergency_funds set saldo = saldo - usado where book_id = e.book_id;
  update public.expenses set fondo_valor = usado where id = e.id;
  insert into public.fund_movements(book_id, tipo, valor, fecha, nota, expense_id)
  values (e.book_id, 'usar', usado, e.fecha, e.descripcion, e.id);
  return f.saldo - usado;  -- saldo restante
end $$;


--
-- Name: account_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_events (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: account_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.account_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.account_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: accountant_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accountant_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    share_id uuid NOT NULL,
    autor text NOT NULL,
    texto text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT accountant_notes_autor_check CHECK ((autor = ANY (ARRAY['titular'::text, 'contador'::text])))
);


--
-- Name: accountant_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accountant_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    label text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    perms text DEFAULT 'renta'::text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    views integer DEFAULT 0 NOT NULL,
    last_access timestamp with time zone,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT accountant_shares_perms_check CHECK ((perms = ANY (ARRAY['renta'::text, 'todo'::text])))
);


--
-- Name: ad_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ad_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    anunciante text DEFAULT ''::text NOT NULL,
    objetivo text DEFAULT 'trafico'::text NOT NULL,
    estado text DEFAULT 'borrador'::text NOT NULL,
    desde date,
    hasta date,
    modelo_cobro text DEFAULT 'cpm'::text NOT NULL,
    tarifa numeric(14,2) DEFAULT 0 NOT NULL,
    presupuesto numeric(14,2),
    planes text[] DEFAULT '{}'::text[] NOT NULL,
    dispositivos text[] DEFAULT '{movil,escritorio}'::text[] NOT NULL,
    frecuencia_max integer DEFAULT 3 NOT NULL,
    prioridad integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ad_campaigns_anunciante_check CHECK ((length(anunciante) <= 80)),
    CONSTRAINT ad_campaigns_dispositivos_check CHECK ((dispositivos <@ ARRAY['movil'::text, 'escritorio'::text])),
    CONSTRAINT ad_campaigns_estado_check CHECK ((estado = ANY (ARRAY['borrador'::text, 'activa'::text, 'pausada'::text, 'terminada'::text]))),
    CONSTRAINT ad_campaigns_frecuencia_max_check CHECK (((frecuencia_max >= 1) AND (frecuencia_max <= 50))),
    CONSTRAINT ad_campaigns_modelo_cobro_check CHECK ((modelo_cobro = ANY (ARRAY['cpm'::text, 'cpc'::text, 'fijo'::text]))),
    CONSTRAINT ad_campaigns_nombre_check CHECK (((length(nombre) >= 2) AND (length(nombre) <= 80))),
    CONSTRAINT ad_campaigns_objetivo_check CHECK ((objetivo = ANY (ARRAY['reconocimiento'::text, 'trafico'::text, 'conversion'::text]))),
    CONSTRAINT ad_campaigns_tarifa_check CHECK ((tarifa >= (0)::numeric))
);


--
-- Name: ad_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ad_events (
    ad_id uuid NOT NULL,
    dia date DEFAULT CURRENT_DATE NOT NULL,
    slot text NOT NULL,
    vistas integer DEFAULT 0 NOT NULL,
    clics integer DEFAULT 0 NOT NULL,
    cierres integer DEFAULT 0 NOT NULL
);


--
-- Name: ad_user_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ad_user_daily (
    ad_id uuid NOT NULL,
    user_id uuid NOT NULL,
    dia date DEFAULT CURRENT_DATE NOT NULL,
    vistas integer DEFAULT 0 NOT NULL,
    clics integer DEFAULT 0 NOT NULL,
    cierres integer DEFAULT 0 NOT NULL
);


--
-- Name: admin_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit (
    id bigint NOT NULL,
    actor uuid,
    accion text NOT NULL,
    objetivo text,
    detalle jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.admin_audit ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.admin_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: admin_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    texto text NOT NULL,
    autor uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_notes_texto_check CHECK (((length(texto) >= 1) AND (length(texto) <= 2000)))
);


--
-- Name: ads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    titulo text NOT NULL,
    texto text DEFAULT ''::text NOT NULL,
    imagen text,
    url text NOT NULL,
    cta text DEFAULT 'Conocer más'::text NOT NULL,
    anunciante text DEFAULT ''::text NOT NULL,
    ubicaciones text[] DEFAULT '{inicio}'::text[] NOT NULL,
    desde date,
    hasta date,
    prioridad integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    campaign_id uuid,
    formato text DEFAULT 'imagen'::text NOT NULL,
    media jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT ads_anunciante_check CHECK ((length(anunciante) <= 60)),
    CONSTRAINT ads_cta_check CHECK ((length(cta) <= 30)),
    CONSTRAINT ads_formato_check CHECK ((formato = ANY (ARRAY['imagen'::text, 'carrusel'::text, 'video'::text, 'historia'::text, 'texto'::text, 'modal'::text]))),
    CONSTRAINT ads_texto_check CHECK ((length(texto) <= 220)),
    CONSTRAINT ads_titulo_check CHECK (((length(titulo) >= 2) AND (length(titulo) <= 80))),
    CONSTRAINT ads_ubicaciones_check CHECK ((ubicaciones <@ ARRAY['inicio'::text, 'historia'::text, 'consejero'::text, 'lista'::text, 'reportes'::text, 'ticker'::text, 'modal'::text, 'accion'::text])),
    CONSTRAINT ads_url_check CHECK ((url ~ '^(https://|/)'::text))
);


--
-- Name: advisor_consultations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advisor_consultations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    tipo text NOT NULL,
    descripcion text DEFAULT ''::text NOT NULL,
    valor numeric(18,2) DEFAULT 0 NOT NULL,
    contact_id uuid,
    veredicto text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT advisor_consultations_veredicto_check CHECK ((veredicto = ANY (ARRAY['si'::text, 'cuidado'::text, 'no'::text])))
);


--
-- Name: ai_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_cache (
    key text NOT NULL,
    household_id uuid,
    feature text NOT NULL,
    result jsonb NOT NULL,
    tokens integer DEFAULT 0 NOT NULL,
    hits integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: ai_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    household_id uuid,
    book_id uuid,
    user_id uuid,
    plan text,
    feature text NOT NULL,
    fuente text DEFAULT 'ia'::text NOT NULL,
    provider text,
    model text,
    de_plataforma boolean DEFAULT false NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    cached_tokens integer DEFAULT 0 NOT NULL,
    tokens_evitados integer DEFAULT 0 NOT NULL,
    costo_usd numeric(12,6) DEFAULT 0 NOT NULL,
    costo_cop numeric(14,2),
    costo_real boolean DEFAULT false NOT NULL,
    creditos numeric(12,3) DEFAULT 0 NOT NULL,
    duracion_ms integer DEFAULT 0 NOT NULL,
    ok boolean DEFAULT true NOT NULL,
    error text,
    CONSTRAINT ai_usage_fuente_check CHECK ((fuente = ANY (ARRAY['ia'::text, 'cache'::text, 'algoritmo'::text])))
);


--
-- Name: allowance_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.allowance_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    allowance_id uuid NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    descripcion text DEFAULT ''::text NOT NULL,
    valor numeric(18,2) DEFAULT 0 NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: allowances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.allowances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    member_id uuid NOT NULL,
    mesada numeric(18,2) DEFAULT 20000 NOT NULL,
    frec text DEFAULT 'semanal'::text NOT NULL,
    meta_nombre text DEFAULT ''::text NOT NULL,
    meta_valor numeric(18,2) DEFAULT 0 NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT allowances_frec_check CHECK ((frec = ANY (ARRAY['semanal'::text, 'quincenal'::text, 'mensual'::text])))
);


--
-- Name: api_idempotency; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_idempotency (
    key text NOT NULL,
    user_id uuid,
    route text NOT NULL,
    fingerprint text NOT NULL,
    status integer,
    response jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL
);


--
-- Name: attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    ref_table text,
    ref_id uuid,
    doc_key text,
    year integer,
    path text NOT NULL,
    nombre text NOT NULL,
    mime text DEFAULT 'application/octet-stream'::text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    visible_contador boolean DEFAULT true NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    book_id uuid,
    household_id uuid,
    tabla text NOT NULL,
    row_id uuid,
    accion text NOT NULL,
    actor uuid,
    resumen text,
    cambios jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_log_accion_check CHECK ((accion = ANY (ARRAY['crear'::text, 'editar'::text, 'borrar'::text, 'restaurar'::text])))
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: automation_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    tipo text NOT NULL,
    tabla text NOT NULL,
    row_id uuid,
    datos jsonb DEFAULT '{}'::jsonb NOT NULL,
    procesado_at timestamp with time zone,
    intentos integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT automation_events_tipo_check CHECK ((tipo = ANY (ARRAY['gasto'::text, 'ingreso'::text, 'pago_fijo'::text, 'cuota'::text, 'compra_tarjeta'::text, 'suscripcion'::text, 'recordatorio'::text])))
);


--
-- Name: automation_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    automation_id uuid NOT NULL,
    clave text NOT NULL,
    disparador text DEFAULT ''::text NOT NULL,
    evento jsonb DEFAULT '{}'::jsonb NOT NULL,
    estado text DEFAULT 'ok'::text NOT NULL,
    pasos jsonb DEFAULT '[]'::jsonb NOT NULL,
    error text,
    reanudar_at timestamp with time zone,
    pendientes jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT automation_runs_clave_check CHECK (((length(clave) >= 1) AND (length(clave) <= 200))),
    CONSTRAINT automation_runs_estado_check CHECK ((estado = ANY (ARRAY['ok'::text, 'error'::text, 'omitida'::text, 'esperando'::text])))
);


--
-- Name: automations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    nombre text NOT NULL,
    descripcion text DEFAULT ''::text NOT NULL,
    icon text DEFAULT 'workflow'::text NOT NULL,
    activo boolean DEFAULT false NOT NULL,
    disparador text DEFAULT 'gasto'::text NOT NULL,
    grafo jsonb DEFAULT '{"edges": [], "nodes": []}'::jsonb NOT NULL,
    plantilla text,
    ultima_ejecucion timestamp with time zone,
    ultimo_estado text,
    ejecuciones integer DEFAULT 0 NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT automations_nombre_check CHECK (((length(nombre) >= 1) AND (length(nombre) <= 80))),
    CONSTRAINT automations_ultimo_estado_check CHECK ((ultimo_estado = ANY (ARRAY['ok'::text, 'error'::text, 'omitida'::text, 'esperando'::text])))
);


--
-- Name: backups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    tipo text DEFAULT 'auto'::text NOT NULL,
    path text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT backups_tipo_check CHECK ((tipo = ANY (ARRAY['auto'::text, 'manual'::text, 'antes_restaurar'::text, 'importado'::text])))
);


--
-- Name: book_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.book_settings (
    book_id uuid NOT NULL,
    meta text DEFAULT ''::text NOT NULL,
    umbral numeric(18,2) DEFAULT 25000 NOT NULL,
    limite numeric(18,2) DEFAULT 250000 NOT NULL,
    trm jsonb DEFAULT '{"EUR": 4450, "USD": 4100}'::jsonb NOT NULL,
    trm_auto boolean DEFAULT true NOT NULL,
    pct jsonb DEFAULT '{"a": 20, "g": 30, "n": 50}'::jsonb NOT NULL,
    emerg_meta integer DEFAULT 6 NOT NULL,
    anticipo integer DEFAULT 5 NOT NULL,
    usura numeric(8,4) DEFAULT 26 NOT NULL,
    usura_auto boolean DEFAULT true NOT NULL,
    corte_q integer DEFAULT 15 NOT NULL,
    alerta_pres integer DEFAULT 100 NOT NULL,
    estricto text DEFAULT 'equilibrado'::text NOT NULL,
    defaults jsonb DEFAULT '{"cat": "", "frec": "mensual", "medio": "", "plazo": 12, "quien": "familia", "sistema": "frances"}'::jsonb NOT NULL,
    notif jsonb DEFAULT '{"metas": true, "pagos": true, "popup": true, "cobros": true, "hormiga": true, "inversiones": true, "presupuesto": true}'::jsonb NOT NULL,
    ia jsonb DEFAULT '{"autocat": true, "hormiga": true}'::jsonb NOT NULL,
    relaciones text[] DEFAULT ARRAY['Familiar'::text, 'Amigo'::text, 'Compañero de trabajo'::text, 'Cliente'::text, 'Vecino'::text, 'Proveedor'::text, 'Otro'::text] NOT NULL,
    apps jsonb DEFAULT '[]'::jsonb NOT NULL,
    setup jsonb DEFAULT '{"skip": {}, "dismissed": false}'::jsonb NOT NULL,
    uvt jsonb DEFAULT '{}'::jsonb NOT NULL,
    smmlv jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    gami boolean DEFAULT true NOT NULL,
    nomina jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT book_settings_corte_q_check CHECK (((corte_q >= 1) AND (corte_q <= 27))),
    CONSTRAINT book_settings_estricto_check CHECK ((estricto = ANY (ARRAY['prudente'::text, 'equilibrado'::text, 'flexible'::text])))
);


--
-- Name: books; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.books (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_id uuid NOT NULL,
    nombre text NOT NULL,
    tipo text DEFAULT 'personal'::text NOT NULL,
    icon text DEFAULT 'house'::text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    sample boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT books_tipo_check CHECK ((tipo = ANY (ARRAY['personal'::text, 'negocio'::text, 'otro'::text])))
);


--
-- Name: broadcasts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.broadcasts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    titulo text NOT NULL,
    cuerpo text DEFAULT ''::text NOT NULL,
    href text,
    segmento text DEFAULT 'todos'::text NOT NULL,
    enviados integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT broadcasts_cuerpo_check CHECK ((length(cuerpo) <= 1000)),
    CONSTRAINT broadcasts_titulo_check CHECK (((length(titulo) >= 2) AND (length(titulo) <= 120)))
);


--
-- Name: calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    titulo text NOT NULL,
    fecha date NOT NULL,
    tipo text DEFAULT 'egreso'::text NOT NULL,
    monto numeric(18,2) DEFAULT 0 NOT NULL,
    nota text DEFAULT ''::text NOT NULL,
    anual boolean DEFAULT true NOT NULL,
    template_key text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    cat text,
    fuente text,
    CONSTRAINT calendar_events_cat_check CHECK ((cat = ANY (ARRAY['laboral'::text, 'dian'::text, 'local'::text, 'vehiculo'::text, 'hogar'::text, 'personal'::text]))),
    CONSTRAINT calendar_events_tipo_check CHECK ((tipo = ANY (ARRAY['ingreso'::text, 'egreso'::text])))
);


--
-- Name: card_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    card_id uuid NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    valor numeric(18,2) NOT NULL,
    tipo text DEFAULT 'otro'::text NOT NULL,
    payment_method_id uuid,
    compras uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    nota text DEFAULT ''::text NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT card_payments_tipo_check CHECK ((tipo = ANY (ARRAY['minimo'::text, 'total'::text, 'otro'::text]))),
    CONSTRAINT card_payments_valor_check CHECK ((valor > (0)::numeric))
);


--
-- Name: card_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    card_id uuid NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    descripcion text DEFAULT ''::text NOT NULL,
    valor numeric(18,2) DEFAULT 0 NOT NULL,
    cuotas integer DEFAULT 1 NOT NULL,
    category_id uuid,
    pagada boolean DEFAULT false NOT NULL,
    expense_id uuid,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT card_purchases_cuotas_check CHECK ((cuotas >= 1))
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    nombre text NOT NULL,
    grupo text DEFAULT 'g'::text NOT NULL,
    icon text DEFAULT 'tag'::text NOT NULL,
    tope numeric(18,2) DEFAULT 0 NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT categories_grupo_check CHECK ((grupo = ANY (ARRAY['n'::text, 'g'::text, 'a'::text])))
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    role text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    feedback smallint,
    adjuntos jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT chat_messages_feedback_check CHECK (((feedback IS NULL) OR (feedback = ANY (ARRAY['-1'::integer, 1])))),
    CONSTRAINT chat_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))
);


--
-- Name: chat_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    titulo text DEFAULT 'Nueva conversación'::text NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    fijado boolean DEFAULT false NOT NULL,
    archivado boolean DEFAULT false NOT NULL,
    titulo_auto boolean DEFAULT true NOT NULL,
    ultimo text DEFAULT ''::text NOT NULL
);


--
-- Name: consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    document text NOT NULL,
    version text NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    user_agent text,
    CONSTRAINT consents_document_check CHECK ((document = ANY (ARRAY['terminos'::text, 'privacidad'::text, 'datos_menores'::text, 'marketing'::text])))
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    tipo text DEFAULT 'persona'::text NOT NULL,
    nombre text NOT NULL,
    doc_tipo text DEFAULT 'CC'::text NOT NULL,
    doc text DEFAULT ''::text NOT NULL,
    telefono text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    direccion jsonb DEFAULT '{}'::jsonb NOT NULL,
    ciudad text DEFAULT ''::text NOT NULL,
    relacion text DEFAULT ''::text NOT NULL,
    notas text DEFAULT ''::text NOT NULL,
    avatar_path text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT contacts_tipo_check CHECK ((tipo = ANY (ARRAY['persona'::text, 'empresa'::text])))
);


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupons (
    codigo text NOT NULL,
    descripcion text DEFAULT ''::text NOT NULL,
    tipo text NOT NULL,
    valor integer NOT NULL,
    planes text[] DEFAULT '{}'::text[] NOT NULL,
    periodos text[] DEFAULT '{mes,anio}'::text[] NOT NULL,
    desde date,
    hasta date,
    max_usos integer,
    usos integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT coupons_codigo_check CHECK ((codigo ~ '^[A-Z0-9_-]{3,30}$'::text)),
    CONSTRAINT coupons_tipo_check CHECK ((tipo = ANY (ARRAY['porcentaje'::text, 'valor'::text]))),
    CONSTRAINT coupons_valor_check CHECK ((valor > 0))
);


--
-- Name: credit_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_cards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    nombre text NOT NULL,
    entity_id uuid,
    cupo numeric(18,2) DEFAULT 0 NOT NULL,
    corte integer DEFAULT 25 NOT NULL,
    pago integer DEFAULT 10 NOT NULL,
    tasa numeric(8,4) DEFAULT 0 NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT credit_cards_corte_check CHECK (((corte >= 1) AND (corte <= 31))),
    CONSTRAINT credit_cards_pago_check CHECK (((pago >= 1) AND (pago <= 31)))
);


--
-- Name: emergency_funds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.emergency_funds (
    book_id uuid NOT NULL,
    activo boolean DEFAULT false NOT NULL,
    saldo numeric(18,2) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    asset_id uuid
);


--
-- Name: entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    nombre text NOT NULL,
    tipo text DEFAULT 'Banco'::text NOT NULL,
    nit text DEFAULT ''::text NOT NULL,
    logo_path text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT entities_tipo_check CHECK ((tipo = ANY (ARRAY['Banco'::text, 'Cooperativa'::text, 'Fintech'::text, 'Billetera'::text, 'Fondo'::text, 'Casa de empeño'::text, 'Otro'::text])))
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    descripcion text DEFAULT ''::text NOT NULL,
    category_id uuid,
    valor numeric(18,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'COP'::text NOT NULL,
    member_id uuid,
    payment_method_id uuid,
    fixed_expense_id uuid,
    periodo text,
    hormiga boolean DEFAULT false NOT NULL,
    hormiga_src text,
    hormiga_razon text,
    fondo_valor numeric(18,2) DEFAULT 0 NOT NULL,
    origen text DEFAULT 'manual'::text NOT NULL,
    external_id text,
    nota text DEFAULT ''::text NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    cat_src text,
    aporte jsonb,
    provider_id uuid,
    member_ids uuid[],
    subscription_id uuid,
    sub_proximo date,
    deducible text,
    CONSTRAINT expenses_cat_src_check CHECK ((cat_src = ANY (ARRAY['regla'::text, 'historial'::text, 'palabras'::text, 'palabra'::text, 'ia'::text, 'manual'::text]))),
    CONSTRAINT expenses_deducible_check CHECK (((deducible IS NULL) OR (deducible = ANY (ARRAY['salud'::text, 'educacion'::text, 'vivienda'::text, 'dependiente'::text])))),
    CONSTRAINT expenses_hormiga_src_check CHECK ((hormiga_src = ANY (ARRAY['ia'::text, 'manual'::text, 'regla'::text]))),
    CONSTRAINT expenses_origen_check CHECK ((origen = ANY (ARRAY['manual'::text, 'importar'::text, 'correo'::text, 'ocr'::text, 'voz'::text, 'tarjeta'::text, 'compartido'::text, 'aporte'::text, 'prestamo'::text])))
);


--
-- Name: extra_incomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extra_incomes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    descripcion text DEFAULT ''::text NOT NULL,
    valor numeric(18,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'COP'::text NOT NULL,
    member_id uuid,
    category_id uuid,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    payment_method_id uuid,
    external_id text
);


--
-- Name: family_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.family_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_id uuid NOT NULL,
    user_id uuid,
    nombre text NOT NULL,
    rol text DEFAULT 'Titular'::text NOT NULL,
    cupo numeric(18,2) DEFAULT 0 NOT NULL,
    color text DEFAULT 'c0'::text NOT NULL,
    es_titular boolean DEFAULT false NOT NULL,
    nacimiento date,
    doc text DEFAULT ''::text NOT NULL,
    dep_de uuid,
    dep_rel text,
    estudia boolean DEFAULT false NOT NULL,
    sin_ingresos boolean DEFAULT true NOT NULL,
    discapacidad boolean DEFAULT false NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    avatar text DEFAULT ''::text NOT NULL,
    CONSTRAINT family_members_dep_rel_check CHECK ((dep_rel = ANY (ARRAY['hijo'::text, 'conyuge'::text, 'padre'::text, 'hermano'::text, 'otro'::text])))
);


--
-- Name: feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    household_id uuid,
    tipo text NOT NULL,
    rating smallint,
    mensaje text DEFAULT ''::text NOT NULL,
    pagina text,
    contexto jsonb DEFAULT '{}'::jsonb NOT NULL,
    captura text,
    estado text DEFAULT 'nuevo'::text NOT NULL,
    respuesta text,
    respondido_at timestamp with time zone,
    respondido_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT feedback_calificacion_con_nota CHECK (((tipo <> 'calificacion'::text) OR (rating IS NOT NULL))),
    CONSTRAINT feedback_estado_check CHECK ((estado = ANY (ARRAY['nuevo'::text, 'revisando'::text, 'planeado'::text, 'hecho'::text, 'descartado'::text]))),
    CONSTRAINT feedback_mensaje_check CHECK ((length(mensaje) <= 4000)),
    CONSTRAINT feedback_mensaje_minimo CHECK (((tipo = 'calificacion'::text) OR (length(btrim(mensaje)) >= 3))),
    CONSTRAINT feedback_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT feedback_respuesta_check CHECK ((length(respuesta) <= 4000)),
    CONSTRAINT feedback_tipo_check CHECK ((tipo = ANY (ARRAY['calificacion'::text, 'error'::text, 'funcion'::text, 'sugerencia'::text, 'pregunta'::text, 'otro'::text, 'elogio'::text, 'soporte'::text])))
);


--
-- Name: fixed_expense_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fixed_expense_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    fixed_expense_id uuid NOT NULL,
    periodo text NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    valor numeric(18,2) DEFAULT 0 NOT NULL,
    payment_method_id uuid,
    expense_id uuid,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: fixed_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fixed_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    nombre text NOT NULL,
    category_id uuid,
    valor numeric(18,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'COP'::text NOT NULL,
    frec text DEFAULT 'mensual'::text NOT NULL,
    dia integer DEFAULT 1 NOT NULL,
    dia2 integer,
    mes integer,
    fecha_unica date,
    inicio date,
    variable boolean DEFAULT false NOT NULL,
    vmin numeric(18,2),
    vmax numeric(18,2),
    payment_method_id uuid,
    proveedor text DEFAULT ''::text NOT NULL,
    desde text DEFAULT to_char((now() AT TIME ZONE 'America/Bogota'::text), 'YYYY-MM'::text) NOT NULL,
    link_type text,
    link_id uuid,
    logo_path text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    reparto jsonb,
    provider_id uuid,
    member_id uuid,
    member_ids uuid[],
    CONSTRAINT fixed_expenses_dia2_check CHECK (((dia2 >= 1) AND (dia2 <= 31))),
    CONSTRAINT fixed_expenses_dia_check CHECK (((dia >= 1) AND (dia <= 31))),
    CONSTRAINT fixed_expenses_frec_check CHECK ((frec = ANY (ARRAY['mensual'::text, 'quincenal'::text, 'bimestral'::text, 'trimestral'::text, 'semestral'::text, 'anual'::text, 'unico'::text]))),
    CONSTRAINT fixed_expenses_link_type_check CHECK ((link_type = ANY (ARRAY['meta'::text, 'fondo'::text]))),
    CONSTRAINT fixed_expenses_mes_check CHECK (((mes >= 1) AND (mes <= 12)))
);


--
-- Name: fund_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    tipo text NOT NULL,
    valor numeric(18,2) DEFAULT 0 NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    nota text DEFAULT ''::text NOT NULL,
    expense_id uuid,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT fund_movements_tipo_check CHECK ((tipo = ANY (ARRAY['guardar'::text, 'usar'::text])))
);


--
-- Name: gami_badges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gami_badges (
    book_id uuid NOT NULL,
    badge text NOT NULL,
    unlocked_at date DEFAULT CURRENT_DATE NOT NULL
);


--
-- Name: gami_missions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gami_missions (
    book_id uuid NOT NULL,
    semana date NOT NULL,
    mision text NOT NULL,
    done_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gami_points_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gami_points_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    user_id uuid,
    fuente text NOT NULL,
    puntos integer NOT NULL,
    ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gami_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gami_state (
    book_id uuid NOT NULL,
    max_level integer DEFAULT 1 NOT NULL,
    init_date date,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gami_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gami_visits (
    book_id uuid NOT NULL,
    user_id uuid NOT NULL,
    dia date NOT NULL
);


--
-- Name: goal_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    goal_id uuid NOT NULL,
    tipo text DEFAULT 'abono'::text NOT NULL,
    valor numeric(18,2) NOT NULL,
    fecha date DEFAULT ((now() AT TIME ZONE 'America/Bogota'::text))::date NOT NULL,
    nota text DEFAULT ''::text NOT NULL,
    payment_method_id uuid,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT goal_movements_tipo_check CHECK ((tipo = ANY (ARRAY['abono'::text, 'retiro'::text]))),
    CONSTRAINT goal_movements_valor_check CHECK ((valor > (0)::numeric))
);


--
-- Name: goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    nombre text NOT NULL,
    objetivo numeric(18,2) DEFAULT 0 NOT NULL,
    ahorrado numeric(18,2) DEFAULT 0 NOT NULL,
    fecha date,
    icon text DEFAULT 'target'::text NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    asset_id uuid
);


--
-- Name: google_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_connections (
    user_id uuid NOT NULL,
    email text,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    tokens_enc text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: google_connections_public; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.google_connections_public WITH (security_invoker='false') AS
 SELECT user_id,
    email,
    scopes,
    updated_at
   FROM public.google_connections
  WHERE (user_id = auth.uid());


--
-- Name: google_event_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_event_map (
    user_id uuid NOT NULL,
    book_id uuid NOT NULL,
    key text NOT NULL,
    event_id text NOT NULL,
    calendar_id text DEFAULT 'primary'::text NOT NULL,
    hash text NOT NULL,
    fecha date NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: household_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.household_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_id uuid NOT NULL,
    email text,
    role text DEFAULT 'editor'::text NOT NULL,
    token_hash text NOT NULL,
    invited_by uuid,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    phone text,
    access_role text,
    nombre text,
    parentesco text,
    family_member_id uuid,
    token_enc text,
    canceled_at timestamp with time zone,
    canceled_by uuid,
    accepted_by uuid,
    last_sent_at timestamp with time zone,
    sends_day date,
    sends_today integer DEFAULT 0 NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    last_result jsonb DEFAULT '{}'::jsonb NOT NULL,
    dest_key text GENERATED ALWAYS AS (public.invitation_dest_key(email, phone)) STORED,
    CONSTRAINT household_invitations_access_role_check CHECK ((access_role = ANY (ARRAY['admin'::text, 'editor'::text, 'registra'::text, 'viewer'::text]))),
    CONSTRAINT household_invitations_dest_check CHECK (((NULLIF(btrim(COALESCE(email, ''::text)), ''::text) IS NOT NULL) OR (NULLIF(btrim(COALESCE(phone, ''::text)), ''::text) IS NOT NULL))),
    CONSTRAINT household_invitations_role_check CHECK ((role = ANY (ARRAY['editor'::text, 'viewer'::text])))
);


--
-- Name: household_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.household_members (
    household_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'editor'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    access_role text,
    CONSTRAINT household_members_access_role_check CHECK ((access_role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'registra'::text, 'viewer'::text]))),
    CONSTRAINT household_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'editor'::text, 'viewer'::text])))
);


--
-- Name: household_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.household_transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_id uuid NOT NULL,
    from_user uuid NOT NULL,
    to_user uuid NOT NULL,
    from_role text DEFAULT 'admin'::text NOT NULL,
    plan_action text DEFAULT 'seguir'::text NOT NULL,
    status text DEFAULT 'pendiente'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT household_transfers_from_role_check CHECK ((from_role = ANY (ARRAY['admin'::text, 'editor'::text, 'registra'::text, 'viewer'::text]))),
    CONSTRAINT household_transfers_plan_action_check CHECK ((plan_action = ANY (ARRAY['seguir'::text, 'cancelar'::text]))),
    CONSTRAINT household_transfers_status_check CHECK ((status = ANY (ARRAY['pendiente'::text, 'aceptada'::text, 'rechazada'::text, 'cancelada'::text, 'vencida'::text])))
);


--
-- Name: households; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.households (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: income_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.income_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    nombre text NOT NULL,
    icon text DEFAULT 'coins'::text NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: incomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incomes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    concepto text NOT NULL,
    category_id uuid,
    valor numeric(18,2) DEFAULT 0 NOT NULL,
    frec text DEFAULT 'mensual'::text NOT NULL,
    dia integer DEFAULT 30 NOT NULL,
    member_id uuid,
    currency text DEFAULT 'COP'::text NOT NULL,
    bruto numeric(18,2),
    deducciones jsonb,
    activo boolean DEFAULT true NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    reparto jsonb,
    payment_method_id uuid,
    CONSTRAINT incomes_dia_check CHECK (((dia >= 1) AND (dia <= 31))),
    CONSTRAINT incomes_frec_check CHECK ((frec = ANY (ARRAY['mensual'::text, 'quincenal'::text, 'semanal'::text, 'diario'::text, 'anual'::text])))
);


--
-- Name: integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_id uuid NOT NULL,
    kind text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    secrets_enc text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: integrations_public; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.integrations_public WITH (security_invoker='false') AS
 SELECT id,
    household_id,
    kind,
    enabled,
    config,
    meta,
    updated_at
   FROM public.integrations i
  WHERE public.is_household_member(household_id, 'viewer'::text);


--
-- Name: investments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    tipo text DEFAULT 'ahorro'::text NOT NULL,
    nombre text NOT NULL,
    entity_id uuid,
    capital numeric(18,2) DEFAULT 0 NOT NULL,
    tasa numeric(10,4) DEFAULT 0 NOT NULL,
    inicio date DEFAULT CURRENT_DATE NOT NULL,
    dias integer,
    ret numeric(6,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'COP'::text NOT NULL,
    actual numeric(18,2),
    symbol text,
    cantidad numeric(28,10),
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT investments_tipo_check CHECK ((tipo = ANY (ARRAY['cdt'::text, 'ahorro'::text, 'fondo'::text, 'acciones'::text, 'cripto'::text, 'otro'::text])))
);


--
-- Name: keyword_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.keyword_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    keyword text NOT NULL,
    category_id uuid,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: liabilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.liabilities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    cod text DEFAULT '2895'::text NOT NULL,
    nombre text NOT NULL,
    valor numeric(18,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'COP'::text NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: loan_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loan_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    loan_id uuid NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    tipo text DEFAULT 'cuota'::text NOT NULL,
    valor numeric(18,2) DEFAULT 0 NOT NULL,
    modo text,
    nota text DEFAULT ''::text NOT NULL,
    expense_id uuid,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    payment_method_id uuid,
    CONSTRAINT loan_payments_modo_check CHECK ((modo = ANY (ARRAY['cuota'::text, 'plazo'::text]))),
    CONSTRAINT loan_payments_tipo_check CHECK ((tipo = ANY (ARRAY['cuota'::text, 'abono'::text])))
);


--
-- Name: loans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    kind text NOT NULL,
    contact_id uuid,
    entity_id uuid,
    concepto text DEFAULT ''::text NOT NULL,
    monto numeric(18,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'COP'::text NOT NULL,
    sistema text DEFAULT 'frances'::text NOT NULL,
    tasa numeric(10,6) DEFAULT 0 NOT NULL,
    frec text DEFAULT 'mensual'::text NOT NULL,
    plazo integer DEFAULT 12 NOT NULL,
    inicio date DEFAULT CURRENT_DATE NOT NULL,
    extra numeric(18,2) DEFAULT 0 NOT NULL,
    prenda jsonb,
    nota text DEFAULT ''::text NOT NULL,
    cerrado_at date,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    cuota_fija numeric(18,2),
    tasa_ea numeric(10,4),
    provider_id uuid,
    vence date,
    fiado boolean DEFAULT false NOT NULL,
    acreedor text,
    tipo text,
    primera date,
    CONSTRAINT loans_frec_check CHECK ((frec = ANY (ARRAY['mensual'::text, 'quincenal'::text, 'semanal'::text, 'diario'::text, 'diariohab'::text, 'unico'::text]))),
    CONSTRAINT loans_kind_check CHECK ((kind = ANY (ARRAY['cobrar'::text, 'pagar'::text]))),
    CONSTRAINT loans_plazo_check CHECK ((plazo >= 1)),
    CONSTRAINT loans_sistema_check CHECK ((sistema = ANY (ARRAY['frances'::text, 'aleman'::text, 'simple'::text, 'sin'::text, 'americano'::text, 'diario'::text, 'cuota'::text]))),
    CONSTRAINT loans_tipo_check CHECK (((tipo IS NULL) OR (tipo = ANY (ARRAY['banco'::text, 'empeno'::text, 'fiado'::text, 'persona'::text, 'cuotas'::text, 'gota'::text, 'presto'::text, 'vendi'::text, 'otro'::text]))))
);


--
-- Name: monthly_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.monthly_summaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    mes text NOT NULL,
    contenido jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: net_worth_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.net_worth_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    mes text NOT NULL,
    activos numeric(16,2) DEFAULT 0 NOT NULL,
    deudas numeric(16,2) DEFAULT 0 NOT NULL,
    patrimonio numeric(16,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT net_worth_snapshots_mes_check CHECK ((mes ~ '^\d{4}-\d{2}$'::text))
);


--
-- Name: notification_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_log (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    household_id uuid,
    channel text NOT NULL,
    kind text DEFAULT 'resumen'::text NOT NULL,
    status text NOT NULL,
    provider text,
    source text,
    destino text,
    ref text,
    error text,
    dedupe text,
    book_id uuid,
    CONSTRAINT notification_log_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'whatsapp'::text, 'telegram'::text, 'push'::text]))),
    CONSTRAINT notification_log_status_check CHECK ((status = ANY (ARRAY['enviado'::text, 'fallido'::text, 'enviando'::text])))
);


--
-- Name: notification_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.notification_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.notification_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: notification_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    book_id uuid,
    channel text NOT NULL,
    kind text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pendiente'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    error text,
    scheduled_for timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_outbox_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'whatsapp'::text, 'telegram'::text, 'push'::text]))),
    CONSTRAINT notification_outbox_status_check CHECK ((status = ANY (ARRAY['pendiente'::text, 'enviado'::text, 'error'::text])))
);


--
-- Name: notification_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_rules (
    user_id uuid NOT NULL,
    book_id uuid NOT NULL,
    matriz jsonb DEFAULT '{}'::jsonb NOT NULL,
    hora integer DEFAULT 7 NOT NULL,
    frecuencia text DEFAULT 'diario'::text NOT NULL,
    silencio jsonb DEFAULT '{"on": false, "desde": 22, "hasta": 7}'::jsonb NOT NULL,
    ocultar_montos boolean DEFAULT false NOT NULL,
    email_to text,
    whatsapp_to text,
    timezone text DEFAULT 'America/Bogota'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    canales jsonb DEFAULT '{"app": true, "popup": true}'::jsonb NOT NULL,
    last_sent jsonb DEFAULT '{}'::jsonb NOT NULL,
    notif jsonb,
    CONSTRAINT notification_rules_frecuencia_check CHECK ((frecuencia = ANY (ARRAY['diario'::text, 'semanal'::text, 'nunca'::text]))),
    CONSTRAINT notification_rules_hora_check CHECK (((hora >= 0) AND (hora <= 23)))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    book_id uuid,
    kind text NOT NULL,
    titulo text NOT NULL,
    cuerpo text DEFAULT ''::text NOT NULL,
    href text,
    dedupe text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    nombre text NOT NULL,
    icon text DEFAULT 'banknote'::text NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    asset_id uuid
);


--
-- Name: plan_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_id uuid,
    subscription_id uuid,
    proveedor text NOT NULL,
    referencia text NOT NULL,
    periodo text,
    monto integer NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    metodo text,
    pagador text,
    factura_ref text,
    raw jsonb DEFAULT '{}'::jsonb NOT NULL,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    plan text,
    cupon text,
    nota text,
    CONSTRAINT plan_payments_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobado'::text, 'rechazado'::text, 'reembolsado'::text, 'anulado'::text]))),
    CONSTRAINT plan_payments_monto_check CHECK ((monto >= 0)),
    CONSTRAINT plan_payments_periodo_check CHECK ((periodo = ANY (ARRAY['mes'::text, 'anio'::text]))),
    CONSTRAINT plan_payments_proveedor_check CHECK ((proveedor = ANY (ARRAY['mercadopago'::text, 'wompi'::text, 'manual'::text])))
);


--
-- Name: plan_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_id uuid NOT NULL,
    plan text DEFAULT 'premium'::text NOT NULL,
    periodo text DEFAULT 'mes'::text NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    proveedor text NOT NULL,
    proveedor_ref text,
    vence_at timestamp with time zone,
    nota text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT plan_subscriptions_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'activa'::text, 'cancelada'::text, 'vencida'::text, 'cortesia'::text]))),
    CONSTRAINT plan_subscriptions_periodo_check CHECK ((periodo = ANY (ARRAY['mes'::text, 'anio'::text]))),
    CONSTRAINT plan_subscriptions_proveedor_check CHECK ((proveedor = ANY (ARRAY['mercadopago'::text, 'wompi'::text, 'manual'::text])))
);


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id text NOT NULL,
    nombre text NOT NULL,
    precio_mes integer DEFAULT 0 NOT NULL,
    precio_anio integer DEFAULT 0 NOT NULL,
    limites jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    descripcion text DEFAULT ''::text NOT NULL,
    funciones text[] DEFAULT '{}'::text[] NOT NULL,
    anuncios boolean DEFAULT true NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    publico boolean DEFAULT true NOT NULL,
    destacado boolean DEFAULT false NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    ia_creditos integer,
    CONSTRAINT plans_ia_creditos_check CHECK (((ia_creditos IS NULL) OR (ia_creditos >= 0))),
    CONSTRAINT plans_id_formato CHECK ((id ~ '^[a-z0-9-]{2,30}$'::text)),
    CONSTRAINT plans_precio_anio_check CHECK ((precio_anio >= 0)),
    CONSTRAINT plans_precio_mes_check CHECK ((precio_mes >= 0))
);


--
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admins (
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_integrations (
    kind text NOT NULL,
    modo text DEFAULT 'apagada'::text NOT NULL,
    planes text[] DEFAULT '{}'::text[] NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    secrets_enc text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT platform_integrations_modo_check CHECK ((modo = ANY (ARRAY['apagada'::text, 'opcional'::text, 'por_defecto'::text, 'obligatoria'::text])))
);


--
-- Name: platform_integrations_public; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.platform_integrations_public WITH (security_invoker='false') AS
 SELECT kind,
    modo,
    planes,
    config,
    (meta - 'lastMsg'::text) AS meta
   FROM public.platform_integrations
  WHERE (modo <> 'apagada'::text);


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    id boolean DEFAULT true NOT NULL,
    limites_db boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    aviso_global text DEFAULT ''::text NOT NULL,
    aviso_tono text DEFAULT 'info'::text NOT NULL,
    registro_abierto boolean DEFAULT true NOT NULL,
    referidos_activo boolean DEFAULT true NOT NULL,
    referidos_plan text DEFAULT 'premium'::text NOT NULL,
    referidos_dias integer DEFAULT 30 NOT NULL,
    anuncios_adsense_pct integer DEFAULT 30 NOT NULL,
    anuncios_accion_cada integer DEFAULT 3 NOT NULL,
    anuncios_modal_horas integer DEFAULT 24 NOT NULL,
    anuncios_ticker boolean DEFAULT true NOT NULL,
    ia_credito_usd numeric(10,6) DEFAULT 0.001 NOT NULL,
    ia_cupos_activo boolean DEFAULT true NOT NULL,
    ia_aviso_pct integer DEFAULT 80 NOT NULL,
    ia_cache_horas integer DEFAULT 24 NOT NULL,
    ia_precios jsonb DEFAULT '{}'::jsonb NOT NULL,
    cron_horario boolean DEFAULT true NOT NULL,
    sync_enlaces boolean DEFAULT false NOT NULL,
    cron_horario_visto timestamp with time zone,
    premium_db boolean DEFAULT false NOT NULL,
    api_rollout jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT platform_settings_anuncios_accion_cada_check CHECK (((anuncios_accion_cada >= 1) AND (anuncios_accion_cada <= 50))),
    CONSTRAINT platform_settings_anuncios_adsense_pct_check CHECK (((anuncios_adsense_pct >= 0) AND (anuncios_adsense_pct <= 100))),
    CONSTRAINT platform_settings_anuncios_modal_horas_check CHECK (((anuncios_modal_horas >= 1) AND (anuncios_modal_horas <= 720))),
    CONSTRAINT platform_settings_aviso_tono_check CHECK ((aviso_tono = ANY (ARRAY['info'::text, 'warn'::text, 'ok'::text]))),
    CONSTRAINT platform_settings_ia_aviso_pct_check CHECK (((ia_aviso_pct >= 1) AND (ia_aviso_pct <= 100))),
    CONSTRAINT platform_settings_ia_cache_horas_check CHECK (((ia_cache_horas >= 0) AND (ia_cache_horas <= 720))),
    CONSTRAINT platform_settings_ia_credito_usd_check CHECK ((ia_credito_usd > (0)::numeric)),
    CONSTRAINT platform_settings_id_check CHECK (id),
    CONSTRAINT platform_settings_referidos_dias_check CHECK (((referidos_dias >= 1) AND (referidos_dias <= 365)))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    nombre text DEFAULT ''::text NOT NULL,
    avatar_url text,
    ciudad text DEFAULT ''::text NOT NULL,
    ocupacion text DEFAULT ''::text NOT NULL,
    doc_tipo text DEFAULT 'CC'::text NOT NULL,
    doc text DEFAULT ''::text NOT NULL,
    digitos text DEFAULT ''::text NOT NULL,
    riesgo text DEFAULT 'moderado'::text NOT NULL,
    direccion jsonb DEFAULT '{}'::jsonb NOT NULL,
    telefono text DEFAULT ''::text NOT NULL,
    last_book_id uuid,
    deletion_requested_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    apodo text DEFAULT ''::text NOT NULL,
    nacimiento date,
    portada text DEFAULT ''::text NOT NULL,
    trabajo text DEFAULT ''::text NOT NULL,
    cobro jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT profiles_digitos_check CHECK ((digitos ~ '^[0-9]{0,2}$'::text)),
    CONSTRAINT profiles_doc_tipo_check CHECK ((doc_tipo = ANY (ARRAY['CC'::text, 'CE'::text, 'PA'::text, 'TI'::text, 'NIT'::text, 'PPT'::text]))),
    CONSTRAINT profiles_riesgo_check CHECK ((riesgo = ANY (ARRAY['conservador'::text, 'moderado'::text, 'arriesgado'::text]))),
    CONSTRAINT profiles_trabajo_check CHECK ((trabajo = ANY (ARRAY[''::text, 'empleado'::text, 'independiente'::text, 'empresario'::text, 'pensionado'::text, 'estudiante'::text, 'hogar'::text, 'buscando'::text])))
);


--
-- Name: providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    nombre text NOT NULL,
    tipo text DEFAULT 'otro'::text NOT NULL,
    nit text DEFAULT ''::text NOT NULL,
    telefono text DEFAULT ''::text NOT NULL,
    correo text DEFAULT ''::text NOT NULL,
    sitio_web text DEFAULT ''::text NOT NULL,
    referencia text DEFAULT ''::text NOT NULL,
    notas text DEFAULT ''::text NOT NULL,
    icon text,
    brand text,
    category_id uuid,
    activo boolean DEFAULT true NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    payment_method_id uuid,
    CONSTRAINT providers_nombre_check CHECK (((length(btrim(nombre)) >= 1) AND (length(btrim(nombre)) <= 120))),
    CONSTRAINT providers_tipo_check CHECK ((tipo = ANY (ARRAY['servicios'::text, 'telecom'::text, 'vivienda'::text, 'salud'::text, 'educacion'::text, 'transporte'::text, 'seguros'::text, 'suscripciones'::text, 'comercio'::text, 'otro'::text])))
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limits (
    key text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    count integer DEFAULT 0 NOT NULL
);


--
-- Name: ref_fiscal_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ref_fiscal_templates (
    key text NOT NULL,
    data jsonb NOT NULL
);


--
-- Name: ref_holidays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ref_holidays (
    fecha date NOT NULL,
    nombre text NOT NULL
);


--
-- Name: ref_municipalities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ref_municipalities (
    code text NOT NULL,
    nombre text NOT NULL,
    departamento text NOT NULL,
    dept_code text NOT NULL,
    aliases text[] DEFAULT '{}'::text[] NOT NULL,
    barrios text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: ref_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ref_rates (
    base text NOT NULL,
    quote text NOT NULL,
    fecha date NOT NULL,
    valor numeric(28,10) NOT NULL
);


--
-- Name: ref_renta_calendar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ref_renta_calendar (
    year integer NOT NULL,
    digitos text NOT NULL,
    fecha date NOT NULL,
    regimen text DEFAULT 'general'::text NOT NULL,
    CONSTRAINT ref_renta_calendar_digitos_check CHECK ((digitos ~ '^[0-9]{2}$'::text))
);


--
-- Name: ref_renta_regimenes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ref_renta_regimenes (
    key text NOT NULL,
    nombre text NOT NULL,
    descripcion text NOT NULL,
    norma text NOT NULL,
    seccionales text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: ref_smmlv; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ref_smmlv (
    year integer NOT NULL,
    valor numeric(18,2) NOT NULL,
    fuente text
);


--
-- Name: ref_trm; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ref_trm (
    fecha date NOT NULL,
    valor numeric(18,4) NOT NULL,
    fuente text
);


--
-- Name: ref_usury_rate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ref_usury_rate (
    desde date NOT NULL,
    hasta date NOT NULL,
    modalidad text DEFAULT 'consumo'::text NOT NULL,
    tasa_ea numeric(8,4) NOT NULL
);


--
-- Name: ref_uvt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ref_uvt (
    year integer NOT NULL,
    valor numeric(18,2) NOT NULL,
    fuente text
);


--
-- Name: referral_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_codes (
    user_id uuid NOT NULL,
    codigo text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT referral_codes_codigo_check CHECK ((codigo ~ '^[A-Z0-9]{6,12}$'::text))
);


--
-- Name: referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referrer uuid NOT NULL,
    referred uuid NOT NULL,
    codigo text NOT NULL,
    estado text DEFAULT 'registrado'::text NOT NULL,
    rewarded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT referrals_estado_check CHECK ((estado = ANY (ARRAY['registrado'::text, 'recompensado'::text, 'sin_recompensa'::text])))
);


--
-- Name: savings_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.savings_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    k text NOT NULL,
    tipo text NOT NULL,
    category_id uuid,
    dias integer,
    base numeric(18,2) DEFAULT 0 NOT NULL,
    n integer,
    inicio date DEFAULT CURRENT_DATE NOT NULL,
    marcas jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: shared_group_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_group_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    group_id uuid NOT NULL,
    descripcion text DEFAULT ''::text NOT NULL,
    valor numeric(18,2) DEFAULT 0 NOT NULL,
    paga text NOT NULL,
    entre text[] DEFAULT '{}'::text[] NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    expense_id uuid,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: shared_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    nombre text NOT NULL,
    personas text[] DEFAULT '{}'::text[] NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    nombre text NOT NULL,
    valor numeric(18,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'COP'::text NOT NULL,
    ciclo text DEFAULT 'mensual'::text NOT NULL,
    proximo date,
    comparte integer DEFAULT 1 NOT NULL,
    payment_method_id uuid,
    category_id uuid,
    logo_path text,
    activa boolean DEFAULT true NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    provider_id uuid,
    CONSTRAINT subscriptions_ciclo_check CHECK ((ciclo = ANY (ARRAY['mensual'::text, 'anual'::text]))),
    CONSTRAINT subscriptions_comparte_check CHECK ((comparte >= 1))
);


--
-- Name: tax_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    asset_id uuid,
    tipo text DEFAULT 'otro'::text NOT NULL,
    nombre text NOT NULL,
    ident text DEFAULT ''::text NOT NULL,
    entidad text DEFAULT ''::text NOT NULL,
    costo numeric(18,2) DEFAULT 0 NOT NULL,
    avaluo numeric(18,2) DEFAULT 0 NOT NULL,
    valor31 numeric(18,2) DEFAULT 0 NOT NULL,
    fecha_adq date,
    member_id uuid,
    pct numeric(5,2) DEFAULT 100 NOT NULL,
    predial numeric(18,2),
    imp_veh numeric(18,2),
    soat numeric(18,2),
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT tax_assets_pct_check CHECK (((pct >= (1)::numeric) AND (pct <= (100)::numeric))),
    CONSTRAINT tax_assets_tipo_check CHECK ((tipo = ANY (ARRAY['inmueble'::text, 'vehiculo'::text, 'cuenta'::text, 'inversion'::text, 'cripto'::text, 'exterior'::text, 'cobrar'::text, 'otro'::text])))
);


--
-- Name: tax_years; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_years (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    year integer NOT NULL,
    member_id uuid NOT NULL,
    docs jsonb DEFAULT '{}'::jsonb NOT NULL,
    consig numeric(18,2) DEFAULT 0 NOT NULL,
    consumos numeric(18,2) DEFAULT 0 NOT NULL,
    ing jsonb DEFAULT '{}'::jsonb NOT NULL,
    ded jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: telegram_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_links (
    user_id uuid NOT NULL,
    chat_id text,
    link_code text,
    linked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_preferences (
    user_id uuid NOT NULL,
    theme text DEFAULT 'system'::text NOT NULL,
    font_scale text DEFAULT 'm'::text NOT NULL,
    dense boolean DEFAULT false NOT NULL,
    reduce_motion boolean DEFAULT false NOT NULL,
    sidebar_collapsed boolean DEFAULT false NOT NULL,
    home_view text DEFAULT 'inicio'::text NOT NULL,
    privacy_mode boolean DEFAULT false NOT NULL,
    privacy_blur_on_leave boolean DEFAULT false NOT NULL,
    lock_minutes integer DEFAULT 0 NOT NULL,
    nav_open jsonb DEFAULT '{}'::jsonb NOT NULL,
    chat_pos jsonb,
    calendar_prefs jsonb DEFAULT '{}'::jsonb NOT NULL,
    tour_done boolean DEFAULT false NOT NULL,
    seen_release text,
    extra jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_preferences_font_scale_check CHECK ((font_scale = ANY (ARRAY['m'::text, 'l'::text, 'xl'::text]))),
    CONSTRAINT user_preferences_theme_check CHECK ((theme = ANY (ARRAY['light'::text, 'dark'::text, 'system'::text])))
);


--
-- Name: wishlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wishlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    book_id uuid NOT NULL,
    nombre text NOT NULL,
    precio numeric(14,2) DEFAULT 0 NOT NULL,
    url text,
    prioridad smallint DEFAULT 2 NOT NULL,
    esperar_hasta date DEFAULT (CURRENT_DATE + 30) NOT NULL,
    estado text DEFAULT 'esperando'::text NOT NULL,
    nota text DEFAULT ''::text NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT wishlist_estado_check CHECK ((estado = ANY (ARRAY['esperando'::text, 'comprado'::text, 'descartado'::text]))),
    CONSTRAINT wishlist_nombre_check CHECK (((length(nombre) >= 1) AND (length(nombre) <= 120))),
    CONSTRAINT wishlist_precio_check CHECK ((precio >= (0)::numeric)),
    CONSTRAINT wishlist_prioridad_check CHECK (((prioridad >= 1) AND (prioridad <= 3)))
);


--
-- Name: account_events account_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_events
    ADD CONSTRAINT account_events_pkey PRIMARY KEY (id);


--
-- Name: accountant_notes accountant_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accountant_notes
    ADD CONSTRAINT accountant_notes_pkey PRIMARY KEY (id);


--
-- Name: accountant_shares accountant_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accountant_shares
    ADD CONSTRAINT accountant_shares_pkey PRIMARY KEY (id);


--
-- Name: accountant_shares accountant_shares_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accountant_shares
    ADD CONSTRAINT accountant_shares_token_hash_key UNIQUE (token_hash);


--
-- Name: ad_campaigns ad_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_campaigns
    ADD CONSTRAINT ad_campaigns_pkey PRIMARY KEY (id);


--
-- Name: ad_events ad_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_events
    ADD CONSTRAINT ad_events_pkey PRIMARY KEY (ad_id, dia, slot);


--
-- Name: ad_user_daily ad_user_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_user_daily
    ADD CONSTRAINT ad_user_daily_pkey PRIMARY KEY (ad_id, user_id, dia);


--
-- Name: admin_audit admin_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit
    ADD CONSTRAINT admin_audit_pkey PRIMARY KEY (id);


--
-- Name: admin_notes admin_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_notes
    ADD CONSTRAINT admin_notes_pkey PRIMARY KEY (id);


--
-- Name: ads ads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ads
    ADD CONSTRAINT ads_pkey PRIMARY KEY (id);


--
-- Name: advisor_consultations advisor_consultations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_consultations
    ADD CONSTRAINT advisor_consultations_pkey PRIMARY KEY (id);


--
-- Name: ai_cache ai_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_cache
    ADD CONSTRAINT ai_cache_pkey PRIMARY KEY (key);


--
-- Name: ai_usage ai_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_pkey PRIMARY KEY (id);


--
-- Name: allowance_movements allowance_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allowance_movements
    ADD CONSTRAINT allowance_movements_pkey PRIMARY KEY (id);


--
-- Name: allowances allowances_book_id_member_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allowances
    ADD CONSTRAINT allowances_book_id_member_id_key UNIQUE (book_id, member_id);


--
-- Name: allowances allowances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allowances
    ADD CONSTRAINT allowances_pkey PRIMARY KEY (id);


--
-- Name: api_idempotency api_idempotency_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_idempotency
    ADD CONSTRAINT api_idempotency_pkey PRIMARY KEY (key);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: attachments attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: automation_events automation_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_events
    ADD CONSTRAINT automation_events_pkey PRIMARY KEY (id);


--
-- Name: automation_runs automation_runs_automation_id_clave_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_runs
    ADD CONSTRAINT automation_runs_automation_id_clave_key UNIQUE (automation_id, clave);


--
-- Name: automation_runs automation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_runs
    ADD CONSTRAINT automation_runs_pkey PRIMARY KEY (id);


--
-- Name: automations automations_book_id_plantilla_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automations
    ADD CONSTRAINT automations_book_id_plantilla_key UNIQUE (book_id, plantilla);


--
-- Name: automations automations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automations
    ADD CONSTRAINT automations_pkey PRIMARY KEY (id);


--
-- Name: backups backups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backups
    ADD CONSTRAINT backups_pkey PRIMARY KEY (id);


--
-- Name: book_settings book_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.book_settings
    ADD CONSTRAINT book_settings_pkey PRIMARY KEY (book_id);


--
-- Name: books books_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.books
    ADD CONSTRAINT books_pkey PRIMARY KEY (id);


--
-- Name: broadcasts broadcasts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_pkey PRIMARY KEY (id);


--
-- Name: calendar_events calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);


--
-- Name: card_payments card_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_payments
    ADD CONSTRAINT card_payments_pkey PRIMARY KEY (id);


--
-- Name: card_purchases card_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_purchases
    ADD CONSTRAINT card_purchases_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_threads chat_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_pkey PRIMARY KEY (id);


--
-- Name: consents consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consents
    ADD CONSTRAINT consents_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (codigo);


--
-- Name: credit_cards credit_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_cards
    ADD CONSTRAINT credit_cards_pkey PRIMARY KEY (id);


--
-- Name: emergency_funds emergency_funds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emergency_funds
    ADD CONSTRAINT emergency_funds_pkey PRIMARY KEY (book_id);


--
-- Name: entities entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: extra_incomes extra_incomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extra_incomes
    ADD CONSTRAINT extra_incomes_pkey PRIMARY KEY (id);


--
-- Name: family_members family_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_members
    ADD CONSTRAINT family_members_pkey PRIMARY KEY (id);


--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);


--
-- Name: fixed_expense_payments fixed_expense_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_expense_payments
    ADD CONSTRAINT fixed_expense_payments_pkey PRIMARY KEY (id);


--
-- Name: fixed_expenses fixed_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_expenses
    ADD CONSTRAINT fixed_expenses_pkey PRIMARY KEY (id);


--
-- Name: fund_movements fund_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_movements
    ADD CONSTRAINT fund_movements_pkey PRIMARY KEY (id);


--
-- Name: gami_badges gami_badges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gami_badges
    ADD CONSTRAINT gami_badges_pkey PRIMARY KEY (book_id, badge);


--
-- Name: gami_missions gami_missions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gami_missions
    ADD CONSTRAINT gami_missions_pkey PRIMARY KEY (book_id, semana, mision);


--
-- Name: gami_points_ledger gami_points_ledger_book_id_fuente_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gami_points_ledger
    ADD CONSTRAINT gami_points_ledger_book_id_fuente_ref_key UNIQUE (book_id, fuente, ref);


--
-- Name: gami_points_ledger gami_points_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gami_points_ledger
    ADD CONSTRAINT gami_points_ledger_pkey PRIMARY KEY (id);


--
-- Name: gami_state gami_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gami_state
    ADD CONSTRAINT gami_state_pkey PRIMARY KEY (book_id);


--
-- Name: gami_visits gami_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gami_visits
    ADD CONSTRAINT gami_visits_pkey PRIMARY KEY (book_id, user_id, dia);


--
-- Name: goal_movements goal_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_movements
    ADD CONSTRAINT goal_movements_pkey PRIMARY KEY (id);


--
-- Name: goals goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_pkey PRIMARY KEY (id);


--
-- Name: google_connections google_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_connections
    ADD CONSTRAINT google_connections_pkey PRIMARY KEY (user_id);


--
-- Name: google_event_map google_event_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_event_map
    ADD CONSTRAINT google_event_map_pkey PRIMARY KEY (user_id, book_id, key);


--
-- Name: household_invitations household_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.household_invitations
    ADD CONSTRAINT household_invitations_pkey PRIMARY KEY (id);


--
-- Name: household_invitations household_invitations_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.household_invitations
    ADD CONSTRAINT household_invitations_token_hash_key UNIQUE (token_hash);


--
-- Name: household_members household_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.household_members
    ADD CONSTRAINT household_members_pkey PRIMARY KEY (household_id, user_id);


--
-- Name: household_transfers household_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.household_transfers
    ADD CONSTRAINT household_transfers_pkey PRIMARY KEY (id);


--
-- Name: households households_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.households
    ADD CONSTRAINT households_pkey PRIMARY KEY (id);


--
-- Name: income_categories income_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.income_categories
    ADD CONSTRAINT income_categories_pkey PRIMARY KEY (id);


--
-- Name: incomes incomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incomes
    ADD CONSTRAINT incomes_pkey PRIMARY KEY (id);


--
-- Name: integrations integrations_household_id_kind_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_household_id_kind_key UNIQUE (household_id, kind);


--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);


--
-- Name: investments investments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investments
    ADD CONSTRAINT investments_pkey PRIMARY KEY (id);


--
-- Name: keyword_rules keyword_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keyword_rules
    ADD CONSTRAINT keyword_rules_pkey PRIMARY KEY (id);


--
-- Name: liabilities liabilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liabilities
    ADD CONSTRAINT liabilities_pkey PRIMARY KEY (id);


--
-- Name: loan_payments loan_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_payments
    ADD CONSTRAINT loan_payments_pkey PRIMARY KEY (id);


--
-- Name: loans loans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_pkey PRIMARY KEY (id);


--
-- Name: monthly_summaries monthly_summaries_book_id_mes_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monthly_summaries
    ADD CONSTRAINT monthly_summaries_book_id_mes_key UNIQUE (book_id, mes);


--
-- Name: monthly_summaries monthly_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monthly_summaries
    ADD CONSTRAINT monthly_summaries_pkey PRIMARY KEY (id);


--
-- Name: net_worth_snapshots net_worth_snapshots_book_id_mes_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.net_worth_snapshots
    ADD CONSTRAINT net_worth_snapshots_book_id_mes_key UNIQUE (book_id, mes);


--
-- Name: net_worth_snapshots net_worth_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.net_worth_snapshots
    ADD CONSTRAINT net_worth_snapshots_pkey PRIMARY KEY (id);


--
-- Name: notification_log notification_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_pkey PRIMARY KEY (id);


--
-- Name: notification_outbox notification_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_outbox
    ADD CONSTRAINT notification_outbox_pkey PRIMARY KEY (id);


--
-- Name: notification_rules notification_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_rules
    ADD CONSTRAINT notification_rules_pkey PRIMARY KEY (user_id, book_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_user_id_dedupe_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_dedupe_key UNIQUE (user_id, dedupe);


--
-- Name: payment_methods payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);


--
-- Name: plan_payments plan_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_payments
    ADD CONSTRAINT plan_payments_pkey PRIMARY KEY (id);


--
-- Name: plan_payments plan_payments_proveedor_referencia_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_payments
    ADD CONSTRAINT plan_payments_proveedor_referencia_key UNIQUE (proveedor, referencia);


--
-- Name: plan_subscriptions plan_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_subscriptions
    ADD CONSTRAINT plan_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (user_id);


--
-- Name: platform_integrations platform_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_integrations
    ADD CONSTRAINT platform_integrations_pkey PRIMARY KEY (kind);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: providers providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.providers
    ADD CONSTRAINT providers_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (key, window_start);


--
-- Name: ref_fiscal_templates ref_fiscal_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_fiscal_templates
    ADD CONSTRAINT ref_fiscal_templates_pkey PRIMARY KEY (key);


--
-- Name: ref_holidays ref_holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_holidays
    ADD CONSTRAINT ref_holidays_pkey PRIMARY KEY (fecha);


--
-- Name: ref_municipalities ref_municipalities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_municipalities
    ADD CONSTRAINT ref_municipalities_pkey PRIMARY KEY (code);


--
-- Name: ref_rates ref_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_rates
    ADD CONSTRAINT ref_rates_pkey PRIMARY KEY (base, quote, fecha);


--
-- Name: ref_renta_calendar ref_renta_calendar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_renta_calendar
    ADD CONSTRAINT ref_renta_calendar_pkey PRIMARY KEY (year, regimen, digitos);


--
-- Name: ref_renta_regimenes ref_renta_regimenes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_renta_regimenes
    ADD CONSTRAINT ref_renta_regimenes_pkey PRIMARY KEY (key);


--
-- Name: ref_smmlv ref_smmlv_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_smmlv
    ADD CONSTRAINT ref_smmlv_pkey PRIMARY KEY (year);


--
-- Name: ref_trm ref_trm_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_trm
    ADD CONSTRAINT ref_trm_pkey PRIMARY KEY (fecha);


--
-- Name: ref_usury_rate ref_usury_rate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_usury_rate
    ADD CONSTRAINT ref_usury_rate_pkey PRIMARY KEY (desde, modalidad);


--
-- Name: ref_uvt ref_uvt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ref_uvt
    ADD CONSTRAINT ref_uvt_pkey PRIMARY KEY (year);


--
-- Name: referral_codes referral_codes_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_codes
    ADD CONSTRAINT referral_codes_codigo_key UNIQUE (codigo);


--
-- Name: referral_codes referral_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_codes
    ADD CONSTRAINT referral_codes_pkey PRIMARY KEY (user_id);


--
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- Name: referrals referrals_referred_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referred_key UNIQUE (referred);


--
-- Name: savings_challenges savings_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.savings_challenges
    ADD CONSTRAINT savings_challenges_pkey PRIMARY KEY (id);


--
-- Name: shared_group_expenses shared_group_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_group_expenses
    ADD CONSTRAINT shared_group_expenses_pkey PRIMARY KEY (id);


--
-- Name: shared_groups shared_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_groups
    ADD CONSTRAINT shared_groups_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: tax_assets tax_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_assets
    ADD CONSTRAINT tax_assets_pkey PRIMARY KEY (id);


--
-- Name: tax_years tax_years_book_id_year_member_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_years
    ADD CONSTRAINT tax_years_book_id_year_member_id_key UNIQUE (book_id, year, member_id);


--
-- Name: tax_years tax_years_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_years
    ADD CONSTRAINT tax_years_pkey PRIMARY KEY (id);


--
-- Name: telegram_links telegram_links_link_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_links
    ADD CONSTRAINT telegram_links_link_code_key UNIQUE (link_code);


--
-- Name: telegram_links telegram_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_links
    ADD CONSTRAINT telegram_links_pkey PRIMARY KEY (user_id);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: wishlist wishlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlist
    ADD CONSTRAINT wishlist_pkey PRIMARY KEY (id);


--
-- Name: account_events_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_events_user_idx ON public.account_events USING btree (user_id, created_at DESC);


--
-- Name: accountant_notes_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accountant_notes_book_idx ON public.accountant_notes USING btree (book_id);


--
-- Name: accountant_notes_share_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accountant_notes_share_idx ON public.accountant_notes USING btree (share_id);


--
-- Name: accountant_shares_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accountant_shares_book_idx ON public.accountant_shares USING btree (book_id);


--
-- Name: ad_user_daily_user_id_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ad_user_daily_user_id_fk_idx ON public.ad_user_daily USING btree (user_id);


--
-- Name: admin_audit_actor_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_actor_fk_idx ON public.admin_audit USING btree (actor);


--
-- Name: admin_audit_fecha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_fecha_idx ON public.admin_audit USING btree (created_at DESC);


--
-- Name: admin_notes_autor_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_notes_autor_fk_idx ON public.admin_notes USING btree (autor);


--
-- Name: admin_notes_user_id_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_notes_user_id_fk_idx ON public.admin_notes USING btree (user_id);


--
-- Name: ads_campaign_id_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ads_campaign_id_fk_idx ON public.ads USING btree (campaign_id);


--
-- Name: advisor_consultations_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX advisor_consultations_book_idx ON public.advisor_consultations USING btree (book_id);


--
-- Name: advisor_consultations_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX advisor_consultations_contact_idx ON public.advisor_consultations USING btree (contact_id) WHERE (contact_id IS NOT NULL);


--
-- Name: ai_cache_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_cache_expires_idx ON public.ai_cache USING btree (expires_at);


--
-- Name: ai_cache_household_id_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_cache_household_id_fk_idx ON public.ai_cache USING btree (household_id);


--
-- Name: ai_usage_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_book_idx ON public.ai_usage USING btree (book_id) WHERE (book_id IS NOT NULL);


--
-- Name: ai_usage_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_created_idx ON public.ai_usage USING btree (created_at DESC);


--
-- Name: ai_usage_household_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_household_idx ON public.ai_usage USING btree (household_id, created_at DESC);


--
-- Name: ai_usage_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_user_idx ON public.ai_usage USING btree (user_id, created_at DESC);


--
-- Name: allowance_movements_allowance_id_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX allowance_movements_allowance_id_fk_idx ON public.allowance_movements USING btree (allowance_id);


--
-- Name: allowance_movements_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX allowance_movements_book_idx ON public.allowance_movements USING btree (book_id);


--
-- Name: allowances_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX allowances_book_idx ON public.allowances USING btree (book_id);


--
-- Name: allowances_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX allowances_member_idx ON public.allowances USING btree (member_id) WHERE (member_id IS NOT NULL);


--
-- Name: api_idempotency_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_idempotency_expires_idx ON public.api_idempotency USING btree (expires_at);


--
-- Name: api_idempotency_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_idempotency_user_idx ON public.api_idempotency USING btree (user_id);


--
-- Name: assets_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assets_book_idx ON public.assets USING btree (book_id);


--
-- Name: attachments_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attachments_book_idx ON public.attachments USING btree (book_id);


--
-- Name: audit_log_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_actor_idx ON public.audit_log USING btree (actor, created_at DESC) WHERE (actor IS NOT NULL);


--
-- Name: audit_log_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_book_idx ON public.audit_log USING btree (book_id, created_at DESC);


--
-- Name: audit_log_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_created_idx ON public.audit_log USING btree (created_at DESC);


--
-- Name: audit_log_household_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_household_idx ON public.audit_log USING btree (household_id, created_at DESC) WHERE (household_id IS NOT NULL);


--
-- Name: automation_events_pend_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_events_pend_idx ON public.automation_events USING btree (book_id, created_at) WHERE (procesado_at IS NULL);


--
-- Name: automation_events_v2_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_events_v2_idx ON public.automation_events USING btree (book_id, created_at) WHERE (procesado_at = '1970-01-01 00:00:00+00'::timestamp with time zone);


--
-- Name: automation_runs_auto_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_runs_auto_idx ON public.automation_runs USING btree (automation_id, created_at DESC);


--
-- Name: automation_runs_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_runs_book_idx ON public.automation_runs USING btree (book_id);


--
-- Name: automation_runs_wait_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_runs_wait_idx ON public.automation_runs USING btree (reanudar_at) WHERE (estado = 'esperando'::text);


--
-- Name: automations_activas_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automations_activas_idx ON public.automations USING btree (book_id, disparador) WHERE (activo AND (deleted_at IS NULL));


--
-- Name: automations_created_by_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automations_created_by_fk_idx ON public.automations USING btree (created_by);


--
-- Name: backups_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX backups_book_idx ON public.backups USING btree (book_id);


--
-- Name: books_created_by_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX books_created_by_fk_idx ON public.books USING btree (created_by);


--
-- Name: books_household_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX books_household_idx ON public.books USING btree (household_id);


--
-- Name: broadcasts_created_by_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX broadcasts_created_by_fk_idx ON public.broadcasts USING btree (created_by);


--
-- Name: calendar_events_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_events_book_idx ON public.calendar_events USING btree (book_id);


--
-- Name: card_payments_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX card_payments_book_idx ON public.card_payments USING btree (book_id);


--
-- Name: card_payments_card_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX card_payments_card_idx ON public.card_payments USING btree (card_id, fecha) WHERE (deleted_at IS NULL);


--
-- Name: card_payments_payment_method_id_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX card_payments_payment_method_id_fk_idx ON public.card_payments USING btree (payment_method_id);


--
-- Name: card_purchases_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX card_purchases_book_idx ON public.card_purchases USING btree (book_id);


--
-- Name: card_purchases_card_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX card_purchases_card_idx ON public.card_purchases USING btree (card_id);


--
-- Name: card_purchases_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX card_purchases_category_idx ON public.card_purchases USING btree (category_id) WHERE (category_id IS NOT NULL);


--
-- Name: card_purchases_expense_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX card_purchases_expense_idx ON public.card_purchases USING btree (expense_id) WHERE (expense_id IS NOT NULL);


--
-- Name: categories_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX categories_book_idx ON public.categories USING btree (book_id);


--
-- Name: chat_messages_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_book_idx ON public.chat_messages USING btree (book_id);


--
-- Name: chat_messages_thread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_thread_idx ON public.chat_messages USING btree (thread_id, created_at) WHERE (deleted_at IS NULL);


--
-- Name: chat_threads_user_id_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_threads_user_id_fk_idx ON public.chat_threads USING btree (user_id);


--
-- Name: chat_threads_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_threads_user_idx ON public.chat_threads USING btree (book_id, user_id, updated_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: consents_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX consents_user_idx ON public.consents USING btree (user_id);


--
-- Name: contacts_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_book_idx ON public.contacts USING btree (book_id);


--
-- Name: credit_cards_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX credit_cards_book_idx ON public.credit_cards USING btree (book_id);


--
-- Name: credit_cards_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX credit_cards_entity_idx ON public.credit_cards USING btree (entity_id) WHERE (entity_id IS NOT NULL);


--
-- Name: emergency_funds_asset_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX emergency_funds_asset_idx ON public.emergency_funds USING btree (asset_id) WHERE (asset_id IS NOT NULL);


--
-- Name: entities_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entities_book_idx ON public.entities USING btree (book_id);


--
-- Name: expenses_book_fecha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_book_fecha_idx ON public.expenses USING btree (book_id, fecha DESC) WHERE (deleted_at IS NULL);


--
-- Name: expenses_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_book_idx ON public.expenses USING btree (book_id);


--
-- Name: expenses_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_category_idx ON public.expenses USING btree (category_id) WHERE (category_id IS NOT NULL);


--
-- Name: expenses_deducible_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_deducible_idx ON public.expenses USING btree (book_id, fecha) WHERE ((deducible IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: expenses_external_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX expenses_external_uidx ON public.expenses USING btree (book_id, external_id) WHERE ((external_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: expenses_fixed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_fixed_idx ON public.expenses USING btree (fixed_expense_id) WHERE (fixed_expense_id IS NOT NULL);


--
-- Name: expenses_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_member_idx ON public.expenses USING btree (member_id) WHERE (member_id IS NOT NULL);


--
-- Name: expenses_payment_method_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_payment_method_idx ON public.expenses USING btree (payment_method_id) WHERE (payment_method_id IS NOT NULL);


--
-- Name: expenses_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_provider_idx ON public.expenses USING btree (provider_id) WHERE (provider_id IS NOT NULL);


--
-- Name: expenses_subscription_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_subscription_idx ON public.expenses USING btree (subscription_id) WHERE (subscription_id IS NOT NULL);


--
-- Name: extra_incomes_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extra_incomes_book_idx ON public.extra_incomes USING btree (book_id);


--
-- Name: extra_incomes_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extra_incomes_category_idx ON public.extra_incomes USING btree (category_id) WHERE (category_id IS NOT NULL);


--
-- Name: extra_incomes_external_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX extra_incomes_external_uidx ON public.extra_incomes USING btree (book_id, external_id) WHERE ((external_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: extra_incomes_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extra_incomes_member_idx ON public.extra_incomes USING btree (member_id) WHERE (member_id IS NOT NULL);


--
-- Name: extra_incomes_payment_method_id_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extra_incomes_payment_method_id_fk_idx ON public.extra_incomes USING btree (payment_method_id);


--
-- Name: family_members_created_by_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX family_members_created_by_fk_idx ON public.family_members USING btree (created_by);


--
-- Name: family_members_dep_de_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX family_members_dep_de_idx ON public.family_members USING btree (dep_de) WHERE (dep_de IS NOT NULL);


--
-- Name: family_members_household_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX family_members_household_idx ON public.family_members USING btree (household_id);


--
-- Name: family_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX family_members_user_idx ON public.family_members USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: feedback_estado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_estado_idx ON public.feedback USING btree (estado, created_at DESC);


--
-- Name: feedback_household_id_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_household_id_fk_idx ON public.feedback USING btree (household_id);


--
-- Name: feedback_respondido_por_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_respondido_por_fk_idx ON public.feedback USING btree (respondido_por);


--
-- Name: feedback_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_user_idx ON public.feedback USING btree (user_id, created_at DESC);


--
-- Name: fixed_expense_payments_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fixed_expense_payments_book_idx ON public.fixed_expense_payments USING btree (book_id);


--
-- Name: fixed_expense_payments_expense_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fixed_expense_payments_expense_idx ON public.fixed_expense_payments USING btree (expense_id) WHERE (expense_id IS NOT NULL);


--
-- Name: fixed_expense_payments_fixed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fixed_expense_payments_fixed_idx ON public.fixed_expense_payments USING btree (fixed_expense_id);


--
-- Name: fixed_expense_payments_payment_method_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fixed_expense_payments_payment_method_idx ON public.fixed_expense_payments USING btree (payment_method_id) WHERE (payment_method_id IS NOT NULL);


--
-- Name: fixed_expenses_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fixed_expenses_book_idx ON public.fixed_expenses USING btree (book_id);


--
-- Name: fixed_expenses_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fixed_expenses_category_idx ON public.fixed_expenses USING btree (category_id) WHERE (category_id IS NOT NULL);


--
-- Name: fixed_expenses_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fixed_expenses_member_idx ON public.fixed_expenses USING btree (member_id) WHERE (member_id IS NOT NULL);


--
-- Name: fixed_expenses_payment_method_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fixed_expenses_payment_method_idx ON public.fixed_expenses USING btree (payment_method_id) WHERE (payment_method_id IS NOT NULL);


--
-- Name: fixed_expenses_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fixed_expenses_provider_idx ON public.fixed_expenses USING btree (provider_id) WHERE (provider_id IS NOT NULL);


--
-- Name: fixed_payments_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fixed_payments_uidx ON public.fixed_expense_payments USING btree (fixed_expense_id, periodo) WHERE (deleted_at IS NULL);


--
-- Name: fund_movements_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fund_movements_book_idx ON public.fund_movements USING btree (book_id);


--
-- Name: fund_movements_expense_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fund_movements_expense_idx ON public.fund_movements USING btree (expense_id) WHERE (expense_id IS NOT NULL);


--
-- Name: gami_points_ledger_user_id_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gami_points_ledger_user_id_fk_idx ON public.gami_points_ledger USING btree (user_id);


--
-- Name: gami_visits_user_id_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gami_visits_user_id_fk_idx ON public.gami_visits USING btree (user_id);


--
-- Name: goal_movements_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_movements_book_idx ON public.goal_movements USING btree (book_id);


--
-- Name: goal_movements_goal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_movements_goal_idx ON public.goal_movements USING btree (goal_id);


--
-- Name: goal_movements_payment_method_id_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_movements_payment_method_id_fk_idx ON public.goal_movements USING btree (payment_method_id);


--
-- Name: goals_asset_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goals_asset_idx ON public.goals USING btree (asset_id) WHERE (asset_id IS NOT NULL);


--
-- Name: goals_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goals_book_idx ON public.goals USING btree (book_id);


--
-- Name: google_event_map_book_id_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX google_event_map_book_id_fk_idx ON public.google_event_map USING btree (book_id);


--
-- Name: household_invitations_accepted_by_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX household_invitations_accepted_by_fk_idx ON public.household_invitations USING btree (accepted_by);


--
-- Name: household_invitations_canceled_by_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX household_invitations_canceled_by_fk_idx ON public.household_invitations USING btree (canceled_by);


--
-- Name: household_invitations_household_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX household_invitations_household_idx ON public.household_invitations USING btree (household_id, created_at DESC);


--
-- Name: household_invitations_invited_by_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX household_invitations_invited_by_fk_idx ON public.household_invitations USING btree (invited_by);


--
-- Name: household_invitations_pending_dest_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX household_invitations_pending_dest_uq ON public.household_invitations USING btree (household_id, dest_key) WHERE ((accepted_at IS NULL) AND (canceled_at IS NULL));


--
-- Name: household_invitations_pending_member_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX household_invitations_pending_member_uq ON public.household_invitations USING btree (family_member_id) WHERE ((accepted_at IS NULL) AND (canceled_at IS NULL) AND (family_member_id IS NOT NULL));


--
-- Name: household_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX household_members_user_idx ON public.household_members USING btree (user_id);


--
-- Name: household_transfers_from_user_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX household_transfers_from_user_fk_idx ON public.household_transfers USING btree (from_user);


--
-- Name: household_transfers_pending_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX household_transfers_pending_uq ON public.household_transfers USING btree (household_id) WHERE (status = 'pendiente'::text);


--
-- Name: household_transfers_resolved_by_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX household_transfers_resolved_by_fk_idx ON public.household_transfers USING btree (resolved_by);


--
-- Name: household_transfers_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX household_transfers_to_idx ON public.household_transfers USING btree (to_user, status);


--
-- Name: households_created_by_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX households_created_by_fk_idx ON public.households USING btree (created_by);


--
-- Name: income_categories_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX income_categories_book_idx ON public.income_categories USING btree (book_id);


--
-- Name: incomes_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX incomes_book_idx ON public.incomes USING btree (book_id);


--
-- Name: incomes_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX incomes_category_idx ON public.incomes USING btree (category_id) WHERE (category_id IS NOT NULL);


--
-- Name: incomes_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX incomes_member_idx ON public.incomes USING btree (member_id) WHERE (member_id IS NOT NULL);


--
-- Name: incomes_payment_method_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX incomes_payment_method_idx ON public.incomes USING btree (payment_method_id) WHERE (payment_method_id IS NOT NULL);


--
-- Name: investments_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investments_book_idx ON public.investments USING btree (book_id);


--
-- Name: investments_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investments_entity_idx ON public.investments USING btree (entity_id) WHERE (entity_id IS NOT NULL);


--
-- Name: keyword_rules_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX keyword_rules_book_idx ON public.keyword_rules USING btree (book_id);


--
-- Name: keyword_rules_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX keyword_rules_category_idx ON public.keyword_rules USING btree (category_id) WHERE (category_id IS NOT NULL);


--
-- Name: liabilities_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX liabilities_book_idx ON public.liabilities USING btree (book_id);


--
-- Name: loan_payments_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loan_payments_book_idx ON public.loan_payments USING btree (book_id);


--
-- Name: loan_payments_expense_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loan_payments_expense_idx ON public.loan_payments USING btree (expense_id) WHERE (expense_id IS NOT NULL);


--
-- Name: loan_payments_loan_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loan_payments_loan_idx ON public.loan_payments USING btree (loan_id);


--
-- Name: loan_payments_payment_method_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loan_payments_payment_method_idx ON public.loan_payments USING btree (payment_method_id) WHERE (payment_method_id IS NOT NULL);


--
-- Name: loans_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loans_book_idx ON public.loans USING btree (book_id);


--
-- Name: loans_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loans_contact_idx ON public.loans USING btree (contact_id) WHERE (contact_id IS NOT NULL);


--
-- Name: loans_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loans_entity_idx ON public.loans USING btree (entity_id) WHERE (entity_id IS NOT NULL);


--
-- Name: loans_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loans_provider_idx ON public.loans USING btree (provider_id) WHERE (provider_id IS NOT NULL);


--
-- Name: monthly_summaries_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX monthly_summaries_book_idx ON public.monthly_summaries USING btree (book_id);


--
-- Name: net_worth_snapshots_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX net_worth_snapshots_book_idx ON public.net_worth_snapshots USING btree (book_id);


--
-- Name: notification_log_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_log_created_idx ON public.notification_log USING btree (created_at DESC);


--
-- Name: notification_log_dedupe_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_log_dedupe_idx ON public.notification_log USING btree (dedupe, created_at DESC) WHERE (dedupe IS NOT NULL);


--
-- Name: notification_log_dedupe_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX notification_log_dedupe_uq ON public.notification_log USING btree (dedupe) WHERE ((dedupe IS NOT NULL) AND (status = ANY (ARRAY['enviando'::text, 'enviado'::text])));


--
-- Name: notification_log_household_id_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_log_household_id_fk_idx ON public.notification_log USING btree (household_id);


--
-- Name: notification_log_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_log_user_idx ON public.notification_log USING btree (user_id, created_at DESC);


--
-- Name: notification_outbox_book_id_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_outbox_book_id_fk_idx ON public.notification_outbox USING btree (book_id);


--
-- Name: notification_outbox_user_id_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_outbox_user_id_fk_idx ON public.notification_outbox USING btree (user_id);


--
-- Name: notification_rules_book_id_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_rules_book_id_fk_idx ON public.notification_rules USING btree (book_id);


--
-- Name: notifications_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_book_idx ON public.notifications USING btree (book_id) WHERE (book_id IS NOT NULL);


--
-- Name: notifications_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_created_idx ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: payment_methods_asset_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_methods_asset_idx ON public.payment_methods USING btree (asset_id) WHERE (asset_id IS NOT NULL);


--
-- Name: payment_methods_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_methods_book_idx ON public.payment_methods USING btree (book_id);


--
-- Name: plan_payments_household_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_payments_household_idx ON public.plan_payments USING btree (household_id, created_at DESC);


--
-- Name: plan_payments_plan_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_payments_plan_fk_idx ON public.plan_payments USING btree (plan);


--
-- Name: plan_payments_subscription_id_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_payments_subscription_id_fk_idx ON public.plan_payments USING btree (subscription_id);


--
-- Name: plan_subs_household_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_subs_household_idx ON public.plan_subscriptions USING btree (household_id, vence_at DESC);


--
-- Name: plan_subs_ref_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX plan_subs_ref_uq ON public.plan_subscriptions USING btree (proveedor, proveedor_ref) WHERE (proveedor_ref IS NOT NULL);


--
-- Name: plan_subscriptions_created_by_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_subscriptions_created_by_fk_idx ON public.plan_subscriptions USING btree (created_by);


--
-- Name: plan_subscriptions_plan_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_subscriptions_plan_fk_idx ON public.plan_subscriptions USING btree (plan);


--
-- Name: platform_integrations_updated_by_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX platform_integrations_updated_by_fk_idx ON public.platform_integrations USING btree (updated_by);


--
-- Name: providers_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX providers_book_idx ON public.providers USING btree (book_id);


--
-- Name: providers_book_norm_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX providers_book_norm_uidx ON public.providers USING btree (book_id, public.provider_norm(nombre)) WHERE (deleted_at IS NULL);


--
-- Name: providers_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX providers_category_idx ON public.providers USING btree (category_id) WHERE (category_id IS NOT NULL);


--
-- Name: providers_payment_method_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX providers_payment_method_idx ON public.providers USING btree (payment_method_id) WHERE (payment_method_id IS NOT NULL);


--
-- Name: push_subscriptions_user_id_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX push_subscriptions_user_id_fk_idx ON public.push_subscriptions USING btree (user_id);


--
-- Name: referrals_referrer_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX referrals_referrer_fk_idx ON public.referrals USING btree (referrer);


--
-- Name: savings_challenges_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX savings_challenges_book_idx ON public.savings_challenges USING btree (book_id);


--
-- Name: savings_challenges_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX savings_challenges_category_idx ON public.savings_challenges USING btree (category_id) WHERE (category_id IS NOT NULL);


--
-- Name: shared_group_expenses_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shared_group_expenses_book_idx ON public.shared_group_expenses USING btree (book_id);


--
-- Name: shared_group_expenses_expense_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shared_group_expenses_expense_idx ON public.shared_group_expenses USING btree (expense_id) WHERE (expense_id IS NOT NULL);


--
-- Name: shared_group_expenses_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shared_group_expenses_group_idx ON public.shared_group_expenses USING btree (group_id);


--
-- Name: shared_groups_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shared_groups_book_idx ON public.shared_groups USING btree (book_id);


--
-- Name: subscriptions_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_book_idx ON public.subscriptions USING btree (book_id);


--
-- Name: subscriptions_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_category_idx ON public.subscriptions USING btree (category_id) WHERE (category_id IS NOT NULL);


--
-- Name: subscriptions_payment_method_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_payment_method_idx ON public.subscriptions USING btree (payment_method_id) WHERE (payment_method_id IS NOT NULL);


--
-- Name: subscriptions_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_provider_idx ON public.subscriptions USING btree (provider_id) WHERE (provider_id IS NOT NULL);


--
-- Name: tax_assets_asset_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tax_assets_asset_idx ON public.tax_assets USING btree (asset_id) WHERE (asset_id IS NOT NULL);


--
-- Name: tax_assets_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tax_assets_book_idx ON public.tax_assets USING btree (book_id);


--
-- Name: tax_assets_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tax_assets_member_idx ON public.tax_assets USING btree (member_id) WHERE (member_id IS NOT NULL);


--
-- Name: tax_years_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tax_years_book_idx ON public.tax_years USING btree (book_id);


--
-- Name: tax_years_member_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tax_years_member_idx ON public.tax_years USING btree (member_id) WHERE (member_id IS NOT NULL);


--
-- Name: wishlist_book_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wishlist_book_idx ON public.wishlist USING btree (book_id);


--
-- Name: wishlist_created_by_fk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wishlist_created_by_fk_idx ON public.wishlist USING btree (created_by);


--
-- Name: ad_campaigns ad_campaigns_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ad_campaigns_touch BEFORE UPDATE ON public.ad_campaigns FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: ads ads_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ads_touch BEFORE UPDATE ON public.ads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: automations automations_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER automations_limit BEFORE INSERT OR UPDATE OF activo, deleted_at ON public.automations FOR EACH ROW EXECUTE FUNCTION public.automation_limit();


--
-- Name: books books_free_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER books_free_limit BEFORE INSERT ON public.books FOR EACH ROW EXECUTE FUNCTION public.enforce_free_limits();


--
-- Name: expenses expense_member_from_fixed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER expense_member_from_fixed BEFORE INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.expense_member_from_fixed();


--
-- Name: feedback feedback_on_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER feedback_on_insert AFTER INSERT ON public.feedback FOR EACH ROW EXECUTE FUNCTION public.feedback_on_insert();


--
-- Name: feedback feedback_on_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER feedback_on_update BEFORE UPDATE ON public.feedback FOR EACH ROW EXECUTE FUNCTION public.feedback_on_update();


--
-- Name: fixed_expenses fixed_members_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fixed_members_sync BEFORE INSERT OR UPDATE ON public.fixed_expenses FOR EACH ROW EXECUTE FUNCTION public.fixed_members_sync();


--
-- Name: loans loan_acreedor_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER loan_acreedor_sync BEFORE INSERT OR UPDATE OF provider_id ON public.loans FOR EACH ROW EXECUTE FUNCTION public.loan_acreedor_sync();


--
-- Name: household_members members_free_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER members_free_limit BEFORE INSERT ON public.household_members FOR EACH ROW EXECUTE FUNCTION public.enforce_free_limits();


--
-- Name: accountant_notes mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.accountant_notes FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: advisor_consultations mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.advisor_consultations FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: allowance_movements mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.allowance_movements FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: allowances mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.allowances FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: assets mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: attachments mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.attachments FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: automation_events mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT ON public.automation_events FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: automation_runs mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.automation_runs FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: automations mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.automations FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: book_settings mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.book_settings FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: calendar_events mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: card_payments mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.card_payments FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: card_purchases mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.card_purchases FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: categories mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: contacts mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: credit_cards mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.credit_cards FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: emergency_funds mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.emergency_funds FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: entities mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.entities FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: expenses mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: extra_incomes mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.extra_incomes FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: family_members mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.family_members FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: fixed_expense_payments mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.fixed_expense_payments FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: fixed_expenses mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.fixed_expenses FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: fund_movements mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.fund_movements FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: gami_badges mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.gami_badges FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: goal_movements mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.goal_movements FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: goals mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: household_members mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.household_members FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: income_categories mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.income_categories FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: incomes mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.incomes FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: investments mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.investments FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: keyword_rules mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.keyword_rules FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: liabilities mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.liabilities FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: loan_payments mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.loan_payments FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: loans mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.loans FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: net_worth_snapshots mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.net_worth_snapshots FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: notifications mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: payment_methods mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.payment_methods FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: providers mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.providers FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: savings_challenges mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.savings_challenges FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: shared_group_expenses mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.shared_group_expenses FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: shared_groups mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.shared_groups FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: subscriptions mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: tax_assets mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.tax_assets FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: tax_years mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.tax_years FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: wishlist mirai_live_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mirai_live_notify AFTER INSERT OR DELETE OR UPDATE ON public.wishlist FOR EACH ROW EXECUTE FUNCTION public.mirai_live_notify();


--
-- Name: plan_payments plan_payments_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER plan_payments_touch BEFORE UPDATE ON public.plan_payments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: plan_subscriptions plan_subs_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER plan_subs_touch BEFORE UPDATE ON public.plan_subscriptions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: plans plans_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER plans_touch BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: providers provider_rename_loans; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER provider_rename_loans AFTER UPDATE OF nombre ON public.providers FOR EACH ROW EXECUTE FUNCTION public.provider_rename_loans();


--
-- Name: accountant_shares trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.accountant_shares FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: allowance_movements trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.allowance_movements FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: allowances trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.allowances FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: assets trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: attachments trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.attachments FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: automations trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.automations FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: book_settings trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.book_settings FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: books trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: calendar_events trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: card_payments trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.card_payments FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: card_purchases trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.card_purchases FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: categories trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: contacts trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: credit_cards trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.credit_cards FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: entities trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.entities FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: expenses trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: extra_incomes trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.extra_incomes FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: family_members trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.family_members FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: fixed_expense_payments trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.fixed_expense_payments FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: fixed_expenses trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.fixed_expenses FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: fund_movements trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.fund_movements FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: goal_movements trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.goal_movements FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: goals trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: household_members trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.household_members FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: household_transfers trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.household_transfers FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: income_categories trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.income_categories FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: incomes trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.incomes FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: investments trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.investments FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: keyword_rules trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.keyword_rules FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: liabilities trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.liabilities FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: loan_payments trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.loan_payments FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: loans trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.loans FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: payment_methods trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.payment_methods FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: providers trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.providers FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: savings_challenges trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.savings_challenges FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: shared_group_expenses trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.shared_group_expenses FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: shared_groups trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.shared_groups FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: subscriptions trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: tax_assets trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.tax_assets FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: tax_years trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.tax_years FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: wishlist trg_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.wishlist FOR EACH ROW EXECUTE FUNCTION public.audit_row();


--
-- Name: calendar_events trg_automation_enqueue; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_automation_enqueue AFTER INSERT ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.automation_enqueue();


--
-- Name: card_purchases trg_automation_enqueue; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_automation_enqueue AFTER INSERT ON public.card_purchases FOR EACH ROW EXECUTE FUNCTION public.automation_enqueue();


--
-- Name: expenses trg_automation_enqueue; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_automation_enqueue AFTER INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.automation_enqueue();


--
-- Name: extra_incomes trg_automation_enqueue; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_automation_enqueue AFTER INSERT ON public.extra_incomes FOR EACH ROW EXECUTE FUNCTION public.automation_enqueue();


--
-- Name: fixed_expense_payments trg_automation_enqueue; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_automation_enqueue AFTER INSERT ON public.fixed_expense_payments FOR EACH ROW EXECUTE FUNCTION public.automation_enqueue();


--
-- Name: loan_payments trg_automation_enqueue; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_automation_enqueue AFTER INSERT ON public.loan_payments FOR EACH ROW EXECUTE FUNCTION public.automation_enqueue();


--
-- Name: subscriptions trg_automation_enqueue; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_automation_enqueue AFTER INSERT OR UPDATE OF proximo ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.automation_enqueue();


--
-- Name: card_payments trg_card_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_card_payment AFTER UPDATE OF deleted_at ON public.card_payments FOR EACH ROW EXECUTE FUNCTION public.card_payment_sync();


--
-- Name: card_purchases trg_card_purchase_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_card_purchase_sync AFTER UPDATE OF deleted_at, valor, fecha, category_id, descripcion ON public.card_purchases FOR EACH ROW WHEN ((new.expense_id IS NOT NULL)) EXECUTE FUNCTION public.card_purchase_sync();


--
-- Name: credit_cards trg_credit_card_cascade; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_credit_card_cascade AFTER UPDATE OF deleted_at ON public.credit_cards FOR EACH ROW EXECUTE FUNCTION public.credit_card_cascade();


--
-- Name: expenses trg_expense_card; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_expense_card AFTER UPDATE OF deleted_at, valor, fecha, category_id, descripcion ON public.expenses FOR EACH ROW WHEN ((new.origen = 'tarjeta'::text)) EXECUTE FUNCTION public.expense_card_sync();


--
-- Name: expenses trg_expense_fixed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_expense_fixed AFTER UPDATE OF deleted_at ON public.expenses FOR EACH ROW WHEN ((new.fixed_expense_id IS NOT NULL)) EXECUTE FUNCTION public.expense_fixed_sync();


--
-- Name: expenses trg_expense_fixed_edit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_expense_fixed_edit AFTER UPDATE OF valor, fecha ON public.expenses FOR EACH ROW WHEN (((new.fixed_expense_id IS NOT NULL) AND (new.deleted_at IS NULL) AND (old.deleted_at IS NULL) AND ((old.valor IS DISTINCT FROM new.valor) OR (old.fecha IS DISTINCT FROM new.fecha)))) EXECUTE FUNCTION public.expense_fixed_edit_sync();


--
-- Name: expenses trg_expense_fund; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_expense_fund AFTER UPDATE OF deleted_at ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.expense_fund_sync();


--
-- Name: expenses trg_expense_provider; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_expense_provider BEFORE INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.expense_provider_default();


--
-- Name: expenses trg_expense_subscription; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_expense_subscription AFTER UPDATE OF deleted_at ON public.expenses FOR EACH ROW WHEN ((new.subscription_id IS NOT NULL)) EXECUTE FUNCTION public.expense_subscription_sync();


--
-- Name: fixed_expenses trg_fixed_cascade; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fixed_cascade AFTER UPDATE OF deleted_at ON public.fixed_expenses FOR EACH ROW EXECUTE FUNCTION public.fixed_cascade_soft();


--
-- Name: goal_movements trg_goal_movement_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_goal_movement_sync AFTER UPDATE OF deleted_at ON public.goal_movements FOR EACH ROW EXECUTE FUNCTION public.goal_movement_sync();


--
-- Name: household_invitations trg_invitation_access; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invitation_access BEFORE INSERT OR UPDATE ON public.household_invitations FOR EACH ROW EXECUTE FUNCTION public.sync_invitation_access();


--
-- Name: household_invitations trg_invitation_replace; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invitation_replace BEFORE INSERT ON public.household_invitations FOR EACH ROW EXECUTE FUNCTION public.invitation_replace_pending();


--
-- Name: household_members trg_member_access; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_member_access BEFORE INSERT OR UPDATE ON public.household_members FOR EACH ROW EXECUTE FUNCTION public.sync_member_access();


--
-- Name: profiles trg_profiles_lock_email; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_lock_email BEFORE UPDATE OF email ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_lock_email();


--
-- Name: loans trg_provider_links; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_provider_links BEFORE INSERT OR UPDATE OF provider_id ON public.loans FOR EACH ROW EXECUTE FUNCTION public.loan_provider_check();


--
-- Name: providers trg_provider_links; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_provider_links BEFORE INSERT OR UPDATE OF payment_method_id ON public.providers FOR EACH ROW EXECUTE FUNCTION public.provider_method_check();


--
-- Name: providers trg_provider_rename; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_provider_rename AFTER UPDATE OF nombre ON public.providers FOR EACH ROW EXECUTE FUNCTION public.provider_rename_sync();


--
-- Name: fixed_expenses trg_provider_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_provider_sync BEFORE INSERT OR UPDATE OF proveedor, provider_id ON public.fixed_expenses FOR EACH ROW EXECUTE FUNCTION public.fixed_provider_sync();


--
-- Name: shared_group_expenses trg_shared_expense; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_shared_expense AFTER UPDATE OF deleted_at ON public.shared_group_expenses FOR EACH ROW WHEN ((new.expense_id IS NOT NULL)) EXECUTE FUNCTION public.shared_expense_sync();


--
-- Name: shared_groups trg_shared_group; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_shared_group AFTER UPDATE OF deleted_at ON public.shared_groups FOR EACH ROW EXECUTE FUNCTION public.shared_group_cascade();


--
-- Name: accountant_notes trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.accountant_notes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: accountant_shares trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.accountant_shares FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: advisor_consultations trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.advisor_consultations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: allowance_movements trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.allowance_movements FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: allowances trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.allowances FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: assets trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: attachments trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.attachments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: automation_runs trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.automation_runs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: automations trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.automations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: book_settings trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.book_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: books trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: calendar_events trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: card_payments trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.card_payments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: card_purchases trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.card_purchases FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: categories trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: chat_messages trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: chat_threads trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.chat_threads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: contacts trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: credit_cards trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.credit_cards FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: emergency_funds trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.emergency_funds FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: entities trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.entities FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: expenses trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: extra_incomes trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.extra_incomes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: family_members trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.family_members FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: fixed_expense_payments trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.fixed_expense_payments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: fixed_expenses trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.fixed_expenses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: fund_movements trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.fund_movements FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: gami_state trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.gami_state FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: goal_movements trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.goal_movements FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: goals trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: google_connections trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.google_connections FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: household_transfers trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.household_transfers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: households trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.households FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: income_categories trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.income_categories FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: incomes trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.incomes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: integrations trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: investments trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.investments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: keyword_rules trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.keyword_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: liabilities trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.liabilities FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: loan_payments trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.loan_payments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: loans trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.loans FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: monthly_summaries trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.monthly_summaries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: net_worth_snapshots trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.net_worth_snapshots FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: notification_rules trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.notification_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: payment_methods trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.payment_methods FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: profiles trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: providers trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.providers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: savings_challenges trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.savings_challenges FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: shared_group_expenses trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.shared_group_expenses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: shared_groups trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.shared_groups FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: subscriptions trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: tax_assets trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.tax_assets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: tax_years trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.tax_years FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: user_preferences trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: wishlist trg_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch BEFORE UPDATE ON public.wishlist FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: account_events account_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_events
    ADD CONSTRAINT account_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: accountant_notes accountant_notes_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accountant_notes
    ADD CONSTRAINT accountant_notes_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: accountant_notes accountant_notes_share_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accountant_notes
    ADD CONSTRAINT accountant_notes_share_id_fkey FOREIGN KEY (share_id) REFERENCES public.accountant_shares(id) ON DELETE CASCADE;


--
-- Name: accountant_shares accountant_shares_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accountant_shares
    ADD CONSTRAINT accountant_shares_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: ad_events ad_events_ad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_events
    ADD CONSTRAINT ad_events_ad_id_fkey FOREIGN KEY (ad_id) REFERENCES public.ads(id) ON DELETE CASCADE;


--
-- Name: ad_user_daily ad_user_daily_ad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_user_daily
    ADD CONSTRAINT ad_user_daily_ad_id_fkey FOREIGN KEY (ad_id) REFERENCES public.ads(id) ON DELETE CASCADE;


--
-- Name: ad_user_daily ad_user_daily_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_user_daily
    ADD CONSTRAINT ad_user_daily_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: admin_audit admin_audit_actor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit
    ADD CONSTRAINT admin_audit_actor_fkey FOREIGN KEY (actor) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: admin_notes admin_notes_autor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_notes
    ADD CONSTRAINT admin_notes_autor_fkey FOREIGN KEY (autor) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: admin_notes admin_notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_notes
    ADD CONSTRAINT admin_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: ads ads_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ads
    ADD CONSTRAINT ads_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.ad_campaigns(id) ON DELETE CASCADE;


--
-- Name: advisor_consultations advisor_consultations_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_consultations
    ADD CONSTRAINT advisor_consultations_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: advisor_consultations advisor_consultations_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advisor_consultations
    ADD CONSTRAINT advisor_consultations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: ai_cache ai_cache_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_cache
    ADD CONSTRAINT ai_cache_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;


--
-- Name: ai_usage ai_usage_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE SET NULL;


--
-- Name: ai_usage ai_usage_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;


--
-- Name: ai_usage ai_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: allowance_movements allowance_movements_allowance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allowance_movements
    ADD CONSTRAINT allowance_movements_allowance_id_fkey FOREIGN KEY (allowance_id) REFERENCES public.allowances(id) ON DELETE CASCADE;


--
-- Name: allowance_movements allowance_movements_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allowance_movements
    ADD CONSTRAINT allowance_movements_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: allowances allowances_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allowances
    ADD CONSTRAINT allowances_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: allowances allowances_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allowances
    ADD CONSTRAINT allowances_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.family_members(id) ON DELETE CASCADE;


--
-- Name: assets assets_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: attachments attachments_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: audit_log audit_log_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: audit_log audit_log_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;


--
-- Name: automation_events automation_events_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_events
    ADD CONSTRAINT automation_events_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: automation_runs automation_runs_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_runs
    ADD CONSTRAINT automation_runs_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES public.automations(id) ON DELETE CASCADE;


--
-- Name: automation_runs automation_runs_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_runs
    ADD CONSTRAINT automation_runs_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: automations automations_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automations
    ADD CONSTRAINT automations_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: automations automations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automations
    ADD CONSTRAINT automations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: backups backups_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backups
    ADD CONSTRAINT backups_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: book_settings book_settings_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.book_settings
    ADD CONSTRAINT book_settings_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: books books_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.books
    ADD CONSTRAINT books_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: books books_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.books
    ADD CONSTRAINT books_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;


--
-- Name: broadcasts broadcasts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: calendar_events calendar_events_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: card_payments card_payments_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_payments
    ADD CONSTRAINT card_payments_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: card_payments card_payments_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_payments
    ADD CONSTRAINT card_payments_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.credit_cards(id) ON DELETE CASCADE;


--
-- Name: card_payments card_payments_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_payments
    ADD CONSTRAINT card_payments_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id) ON DELETE SET NULL;


--
-- Name: card_purchases card_purchases_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_purchases
    ADD CONSTRAINT card_purchases_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: card_purchases card_purchases_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_purchases
    ADD CONSTRAINT card_purchases_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.credit_cards(id) ON DELETE CASCADE;


--
-- Name: card_purchases card_purchases_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_purchases
    ADD CONSTRAINT card_purchases_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: card_purchases card_purchases_expense_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_purchases
    ADD CONSTRAINT card_purchases_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE SET NULL;


--
-- Name: categories categories_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.chat_threads(id) ON DELETE CASCADE;


--
-- Name: chat_threads chat_threads_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: chat_threads chat_threads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: consents consents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consents
    ADD CONSTRAINT consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: credit_cards credit_cards_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_cards
    ADD CONSTRAINT credit_cards_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: credit_cards credit_cards_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_cards
    ADD CONSTRAINT credit_cards_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE SET NULL;


--
-- Name: emergency_funds emergency_funds_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emergency_funds
    ADD CONSTRAINT emergency_funds_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE SET NULL;


--
-- Name: emergency_funds emergency_funds_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.emergency_funds
    ADD CONSTRAINT emergency_funds_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: entities entities_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: expenses expenses_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: expenses expenses_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: expenses expenses_fixed_expense_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_fixed_expense_id_fkey FOREIGN KEY (fixed_expense_id) REFERENCES public.fixed_expenses(id) ON DELETE CASCADE;


--
-- Name: expenses expenses_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.family_members(id) ON DELETE SET NULL;


--
-- Name: expenses expenses_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id) ON DELETE SET NULL;


--
-- Name: expenses expenses_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE SET NULL;


--
-- Name: expenses expenses_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE SET NULL;


--
-- Name: extra_incomes extra_incomes_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extra_incomes
    ADD CONSTRAINT extra_incomes_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: extra_incomes extra_incomes_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extra_incomes
    ADD CONSTRAINT extra_incomes_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.income_categories(id) ON DELETE SET NULL;


--
-- Name: extra_incomes extra_incomes_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extra_incomes
    ADD CONSTRAINT extra_incomes_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.family_members(id) ON DELETE SET NULL;


--
-- Name: extra_incomes extra_incomes_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extra_incomes
    ADD CONSTRAINT extra_incomes_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id) ON DELETE SET NULL;


--
-- Name: family_members family_members_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_members
    ADD CONSTRAINT family_members_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: family_members family_members_dep_de_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_members
    ADD CONSTRAINT family_members_dep_de_fkey FOREIGN KEY (dep_de) REFERENCES public.family_members(id) ON DELETE SET NULL;


--
-- Name: family_members family_members_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_members
    ADD CONSTRAINT family_members_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;


--
-- Name: family_members family_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_members
    ADD CONSTRAINT family_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: feedback feedback_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE SET NULL;


--
-- Name: feedback feedback_respondido_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_respondido_por_fkey FOREIGN KEY (respondido_por) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: feedback feedback_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: fixed_expense_payments fixed_expense_payments_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_expense_payments
    ADD CONSTRAINT fixed_expense_payments_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: fixed_expense_payments fixed_expense_payments_expense_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_expense_payments
    ADD CONSTRAINT fixed_expense_payments_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE SET NULL;


--
-- Name: fixed_expense_payments fixed_expense_payments_fixed_expense_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_expense_payments
    ADD CONSTRAINT fixed_expense_payments_fixed_expense_id_fkey FOREIGN KEY (fixed_expense_id) REFERENCES public.fixed_expenses(id) ON DELETE CASCADE;


--
-- Name: fixed_expense_payments fixed_expense_payments_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_expense_payments
    ADD CONSTRAINT fixed_expense_payments_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id) ON DELETE SET NULL;


--
-- Name: fixed_expenses fixed_expenses_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_expenses
    ADD CONSTRAINT fixed_expenses_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: fixed_expenses fixed_expenses_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_expenses
    ADD CONSTRAINT fixed_expenses_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: fixed_expenses fixed_expenses_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_expenses
    ADD CONSTRAINT fixed_expenses_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.family_members(id) ON DELETE SET NULL;


--
-- Name: fixed_expenses fixed_expenses_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_expenses
    ADD CONSTRAINT fixed_expenses_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id) ON DELETE SET NULL;


--
-- Name: fixed_expenses fixed_expenses_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_expenses
    ADD CONSTRAINT fixed_expenses_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE SET NULL;


--
-- Name: fund_movements fund_movements_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_movements
    ADD CONSTRAINT fund_movements_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: fund_movements fund_movements_expense_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_movements
    ADD CONSTRAINT fund_movements_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE SET NULL;


--
-- Name: gami_badges gami_badges_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gami_badges
    ADD CONSTRAINT gami_badges_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: gami_missions gami_missions_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gami_missions
    ADD CONSTRAINT gami_missions_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: gami_points_ledger gami_points_ledger_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gami_points_ledger
    ADD CONSTRAINT gami_points_ledger_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: gami_points_ledger gami_points_ledger_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gami_points_ledger
    ADD CONSTRAINT gami_points_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: gami_state gami_state_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gami_state
    ADD CONSTRAINT gami_state_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: gami_visits gami_visits_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gami_visits
    ADD CONSTRAINT gami_visits_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: gami_visits gami_visits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gami_visits
    ADD CONSTRAINT gami_visits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: goal_movements goal_movements_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_movements
    ADD CONSTRAINT goal_movements_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: goal_movements goal_movements_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_movements
    ADD CONSTRAINT goal_movements_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;


--
-- Name: goal_movements goal_movements_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_movements
    ADD CONSTRAINT goal_movements_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id) ON DELETE SET NULL;


--
-- Name: goals goals_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE SET NULL;


--
-- Name: goals goals_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: google_connections google_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_connections
    ADD CONSTRAINT google_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: google_event_map google_event_map_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_event_map
    ADD CONSTRAINT google_event_map_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: google_event_map google_event_map_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_event_map
    ADD CONSTRAINT google_event_map_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: household_invitations household_invitations_accepted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.household_invitations
    ADD CONSTRAINT household_invitations_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: household_invitations household_invitations_canceled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.household_invitations
    ADD CONSTRAINT household_invitations_canceled_by_fkey FOREIGN KEY (canceled_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: household_invitations household_invitations_family_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.household_invitations
    ADD CONSTRAINT household_invitations_family_member_id_fkey FOREIGN KEY (family_member_id) REFERENCES public.family_members(id) ON DELETE SET NULL;


--
-- Name: household_invitations household_invitations_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.household_invitations
    ADD CONSTRAINT household_invitations_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;


--
-- Name: household_invitations household_invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.household_invitations
    ADD CONSTRAINT household_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: household_members household_members_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.household_members
    ADD CONSTRAINT household_members_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;


--
-- Name: household_members household_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.household_members
    ADD CONSTRAINT household_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: household_transfers household_transfers_from_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.household_transfers
    ADD CONSTRAINT household_transfers_from_user_fkey FOREIGN KEY (from_user) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: household_transfers household_transfers_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.household_transfers
    ADD CONSTRAINT household_transfers_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;


--
-- Name: household_transfers household_transfers_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.household_transfers
    ADD CONSTRAINT household_transfers_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: household_transfers household_transfers_to_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.household_transfers
    ADD CONSTRAINT household_transfers_to_user_fkey FOREIGN KEY (to_user) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: households households_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.households
    ADD CONSTRAINT households_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: income_categories income_categories_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.income_categories
    ADD CONSTRAINT income_categories_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: incomes incomes_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incomes
    ADD CONSTRAINT incomes_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: incomes incomes_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incomes
    ADD CONSTRAINT incomes_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.income_categories(id) ON DELETE SET NULL;


--
-- Name: incomes incomes_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incomes
    ADD CONSTRAINT incomes_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.family_members(id) ON DELETE SET NULL;


--
-- Name: incomes incomes_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incomes
    ADD CONSTRAINT incomes_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id) ON DELETE SET NULL;


--
-- Name: integrations integrations_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;


--
-- Name: investments investments_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investments
    ADD CONSTRAINT investments_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: investments investments_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investments
    ADD CONSTRAINT investments_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE SET NULL;


--
-- Name: keyword_rules keyword_rules_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keyword_rules
    ADD CONSTRAINT keyword_rules_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: keyword_rules keyword_rules_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keyword_rules
    ADD CONSTRAINT keyword_rules_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: liabilities liabilities_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.liabilities
    ADD CONSTRAINT liabilities_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: loan_payments loan_payments_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_payments
    ADD CONSTRAINT loan_payments_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: loan_payments loan_payments_expense_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_payments
    ADD CONSTRAINT loan_payments_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE SET NULL;


--
-- Name: loan_payments loan_payments_loan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_payments
    ADD CONSTRAINT loan_payments_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: loan_payments loan_payments_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_payments
    ADD CONSTRAINT loan_payments_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id) ON DELETE SET NULL;


--
-- Name: loans loans_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: loans loans_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: loans loans_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE SET NULL;


--
-- Name: loans loans_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE SET NULL;


--
-- Name: monthly_summaries monthly_summaries_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monthly_summaries
    ADD CONSTRAINT monthly_summaries_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: net_worth_snapshots net_worth_snapshots_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.net_worth_snapshots
    ADD CONSTRAINT net_worth_snapshots_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: notification_log notification_log_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE SET NULL;


--
-- Name: notification_log notification_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: notification_outbox notification_outbox_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_outbox
    ADD CONSTRAINT notification_outbox_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: notification_outbox notification_outbox_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_outbox
    ADD CONSTRAINT notification_outbox_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: notification_rules notification_rules_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_rules
    ADD CONSTRAINT notification_rules_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: notification_rules notification_rules_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_rules
    ADD CONSTRAINT notification_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: payment_methods payment_methods_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE SET NULL;


--
-- Name: payment_methods payment_methods_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: plan_payments plan_payments_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_payments
    ADD CONSTRAINT plan_payments_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE SET NULL;


--
-- Name: plan_payments plan_payments_plan_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_payments
    ADD CONSTRAINT plan_payments_plan_fkey FOREIGN KEY (plan) REFERENCES public.plans(id);


--
-- Name: plan_payments plan_payments_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_payments
    ADD CONSTRAINT plan_payments_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.plan_subscriptions(id) ON DELETE SET NULL;


--
-- Name: plan_subscriptions plan_subscriptions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_subscriptions
    ADD CONSTRAINT plan_subscriptions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: plan_subscriptions plan_subscriptions_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_subscriptions
    ADD CONSTRAINT plan_subscriptions_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;


--
-- Name: plan_subscriptions plan_subscriptions_plan_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_subscriptions
    ADD CONSTRAINT plan_subscriptions_plan_fkey FOREIGN KEY (plan) REFERENCES public.plans(id);


--
-- Name: platform_admins platform_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: platform_integrations platform_integrations_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_integrations
    ADD CONSTRAINT platform_integrations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: providers providers_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.providers
    ADD CONSTRAINT providers_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: providers providers_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.providers
    ADD CONSTRAINT providers_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: providers providers_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.providers
    ADD CONSTRAINT providers_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id) ON DELETE SET NULL;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: referral_codes referral_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_codes
    ADD CONSTRAINT referral_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: referrals referrals_referred_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referred_fkey FOREIGN KEY (referred) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: referrals referrals_referrer_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referrer_fkey FOREIGN KEY (referrer) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: savings_challenges savings_challenges_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.savings_challenges
    ADD CONSTRAINT savings_challenges_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: savings_challenges savings_challenges_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.savings_challenges
    ADD CONSTRAINT savings_challenges_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: shared_group_expenses shared_group_expenses_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_group_expenses
    ADD CONSTRAINT shared_group_expenses_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: shared_group_expenses shared_group_expenses_expense_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_group_expenses
    ADD CONSTRAINT shared_group_expenses_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE SET NULL;


--
-- Name: shared_group_expenses shared_group_expenses_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_group_expenses
    ADD CONSTRAINT shared_group_expenses_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.shared_groups(id) ON DELETE CASCADE;


--
-- Name: shared_groups shared_groups_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_groups
    ADD CONSTRAINT shared_groups_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: subscriptions subscriptions_payment_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id) ON DELETE SET NULL;


--
-- Name: subscriptions subscriptions_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE SET NULL;


--
-- Name: tax_assets tax_assets_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_assets
    ADD CONSTRAINT tax_assets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE SET NULL;


--
-- Name: tax_assets tax_assets_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_assets
    ADD CONSTRAINT tax_assets_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: tax_assets tax_assets_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_assets
    ADD CONSTRAINT tax_assets_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.family_members(id) ON DELETE SET NULL;


--
-- Name: tax_years tax_years_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_years
    ADD CONSTRAINT tax_years_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: tax_years tax_years_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_years
    ADD CONSTRAINT tax_years_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.family_members(id) ON DELETE CASCADE;


--
-- Name: telegram_links telegram_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_links
    ADD CONSTRAINT telegram_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: wishlist wishlist_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlist
    ADD CONSTRAINT wishlist_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;


--
-- Name: wishlist wishlist_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlist
    ADD CONSTRAINT wishlist_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: account_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_events ENABLE ROW LEVEL SECURITY;

--
-- Name: accountant_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accountant_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: accountant_shares; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accountant_shares ENABLE ROW LEVEL SECURITY;

--
-- Name: consents aceptar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aceptar ON public.consents FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: ad_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: ad_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ad_events ENABLE ROW LEVEL SECURITY;

--
-- Name: ad_user_daily; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ad_user_daily ENABLE ROW LEVEL SECURITY;

--
-- Name: ads admin anuncios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin anuncios" ON public.ads TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: ad_campaigns admin campañas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin campañas" ON public.ad_campaigns TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: broadcasts admin comunicados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin comunicados" ON public.broadcasts TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: coupons admin cupones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin cupones" ON public.coupons TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: platform_integrations admin integraciones globales; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin integraciones globales" ON public.platform_integrations TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: notification_log admin lee envios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin lee envios" ON public.notification_log FOR SELECT TO authenticated USING (public.is_platform_admin());


--
-- Name: ad_events admin metricas anuncios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin metricas anuncios" ON public.ad_events FOR SELECT TO authenticated USING (public.is_platform_admin());


--
-- Name: admin_notes admin notas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin notas" ON public.admin_notes TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: plan_subscriptions admin planes hogar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin planes hogar" ON public.plan_subscriptions TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: admin_audit admin ver auditoria; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin ver auditoria" ON public.admin_audit FOR SELECT TO authenticated USING (public.is_platform_admin());


--
-- Name: admin_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: ads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

--
-- Name: advisor_consultations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.advisor_consultations ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: allowance_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.allowance_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: allowances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.allowances ENABLE ROW LEVEL SECURITY;

--
-- Name: api_idempotency; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_idempotency ENABLE ROW LEVEL SECURITY;

--
-- Name: assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

--
-- Name: attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: automation_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automation_events ENABLE ROW LEVEL SECURITY;

--
-- Name: automation_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: automations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications avisos propios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "avisos propios" ON public.notifications FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: backups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

--
-- Name: book_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.book_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: books; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

--
-- Name: accountant_notes borrar accountant_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar accountant_notes" ON public.accountant_notes FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: accountant_shares borrar accountant_shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar accountant_shares" ON public.accountant_shares FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'admin'::text));


--
-- Name: advisor_consultations borrar advisor_consultations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar advisor_consultations" ON public.advisor_consultations FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: allowance_movements borrar allowance_movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar allowance_movements" ON public.allowance_movements FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: allowances borrar allowances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar allowances" ON public.allowances FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: assets borrar assets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar assets" ON public.assets FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: attachments borrar attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar attachments" ON public.attachments FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: automations borrar automations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar automations" ON public.automations FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: notifications borrar avisos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar avisos" ON public.notifications FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: calendar_events borrar calendar_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar calendar_events" ON public.calendar_events FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: card_payments borrar card_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar card_payments" ON public.card_payments FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: card_purchases borrar card_purchases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar card_purchases" ON public.card_purchases FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: categories borrar categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar categories" ON public.categories FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: contacts borrar contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar contacts" ON public.contacts FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: credit_cards borrar credit_cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar credit_cards" ON public.credit_cards FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: entities borrar entities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar entities" ON public.entities FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: expenses borrar expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar expenses" ON public.expenses FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: extra_incomes borrar extra_incomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar extra_incomes" ON public.extra_incomes FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: fixed_expense_payments borrar fixed_expense_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar fixed_expense_payments" ON public.fixed_expense_payments FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: fixed_expenses borrar fixed_expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar fixed_expenses" ON public.fixed_expenses FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: fund_movements borrar fund_movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar fund_movements" ON public.fund_movements FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: goal_movements borrar goal_movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar goal_movements" ON public.goal_movements FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: goals borrar goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar goals" ON public.goals FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: households borrar hogar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar hogar" ON public.households FOR DELETE TO authenticated USING (public.is_household_member(id, 'owner'::text));


--
-- Name: income_categories borrar income_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar income_categories" ON public.income_categories FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: incomes borrar incomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar incomes" ON public.incomes FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: investments borrar investments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar investments" ON public.investments FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: keyword_rules borrar keyword_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar keyword_rules" ON public.keyword_rules FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: liabilities borrar liabilities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar liabilities" ON public.liabilities FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: books borrar libros; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar libros" ON public.books FOR DELETE TO authenticated USING (public.is_household_member(household_id, 'owner'::text));


--
-- Name: loan_payments borrar loan_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar loan_payments" ON public.loan_payments FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: loans borrar loans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar loans" ON public.loans FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: monthly_summaries borrar monthly_summaries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar monthly_summaries" ON public.monthly_summaries FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: net_worth_snapshots borrar net_worth_snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar net_worth_snapshots" ON public.net_worth_snapshots FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: feedback borrar opinion; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar opinion" ON public.feedback FOR DELETE TO authenticated USING ((((user_id = auth.uid()) AND (estado = 'nuevo'::text)) OR public.is_platform_admin()));


--
-- Name: payment_methods borrar payment_methods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar payment_methods" ON public.payment_methods FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: plans borrar planes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar planes" ON public.plans FOR DELETE TO authenticated USING ((public.is_platform_admin() AND (id <> ALL (ARRAY['gratis'::text, 'premium'::text]))));


--
-- Name: providers borrar providers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar providers" ON public.providers FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: savings_challenges borrar savings_challenges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar savings_challenges" ON public.savings_challenges FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: shared_group_expenses borrar shared_group_expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar shared_group_expenses" ON public.shared_group_expenses FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: shared_groups borrar shared_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar shared_groups" ON public.shared_groups FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: subscriptions borrar subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar subscriptions" ON public.subscriptions FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: tax_assets borrar tax_assets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar tax_assets" ON public.tax_assets FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: tax_years borrar tax_years; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar tax_years" ON public.tax_years FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: wishlist borrar wishlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "borrar wishlist" ON public.wishlist FOR DELETE TO authenticated USING (public.is_book_member(book_id, 'editor'::text));


--
-- Name: broadcasts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

--
-- Name: card_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.card_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: card_purchases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.card_purchases ENABLE ROW LEVEL SECURITY;

--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_threads chat propio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chat propio" ON public.chat_threads TO authenticated USING (((user_id = auth.uid()) AND public.is_book_member(book_id, 'viewer'::text))) WITH CHECK (((user_id = auth.uid()) AND public.is_book_member(book_id, 'viewer'::text)));


--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: consents consentimientos propios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "consentimientos propios" ON public.consents FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: coupons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

--
-- Name: accountant_notes crear accountant_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear accountant_notes" ON public.accountant_notes FOR INSERT TO authenticated WITH CHECK ((public.is_book_member(book_id, 'editor'::text) AND (autor = 'titular'::text) AND (EXISTS ( SELECT 1
   FROM public.accountant_shares s
  WHERE ((s.id = accountant_notes.share_id) AND (s.book_id = accountant_notes.book_id))))));


--
-- Name: accountant_shares crear accountant_shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear accountant_shares" ON public.accountant_shares FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'admin'::text));


--
-- Name: advisor_consultations crear advisor_consultations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear advisor_consultations" ON public.advisor_consultations FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: allowance_movements crear allowance_movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear allowance_movements" ON public.allowance_movements FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: allowances crear allowances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear allowances" ON public.allowances FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: assets crear assets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear assets" ON public.assets FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: attachments crear attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear attachments" ON public.attachments FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: automations crear automations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear automations" ON public.automations FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: calendar_events crear calendar_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear calendar_events" ON public.calendar_events FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: card_payments crear card_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear card_payments" ON public.card_payments FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: card_purchases crear card_purchases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear card_purchases" ON public.card_purchases FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: categories crear categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear categories" ON public.categories FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: contacts crear contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: credit_cards crear credit_cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear credit_cards" ON public.credit_cards FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: entities crear entities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear entities" ON public.entities FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: expenses crear expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: extra_incomes crear extra_incomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear extra_incomes" ON public.extra_incomes FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: fixed_expense_payments crear fixed_expense_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear fixed_expense_payments" ON public.fixed_expense_payments FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: fixed_expenses crear fixed_expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear fixed_expenses" ON public.fixed_expenses FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: fund_movements crear fund_movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear fund_movements" ON public.fund_movements FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: goal_movements crear goal_movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear goal_movements" ON public.goal_movements FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: goals crear goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear goals" ON public.goals FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: income_categories crear income_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear income_categories" ON public.income_categories FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: incomes crear incomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear incomes" ON public.incomes FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: investments crear investments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear investments" ON public.investments FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: keyword_rules crear keyword_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear keyword_rules" ON public.keyword_rules FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: liabilities crear liabilities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear liabilities" ON public.liabilities FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: books crear libros; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear libros" ON public.books FOR INSERT TO authenticated WITH CHECK (public.is_household_member(household_id, 'editor'::text));


--
-- Name: loan_payments crear loan_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear loan_payments" ON public.loan_payments FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: loans crear loans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear loans" ON public.loans FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: monthly_summaries crear monthly_summaries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear monthly_summaries" ON public.monthly_summaries FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: net_worth_snapshots crear net_worth_snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear net_worth_snapshots" ON public.net_worth_snapshots FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: payment_methods crear payment_methods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear payment_methods" ON public.payment_methods FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: plans crear planes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear planes" ON public.plans FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());


--
-- Name: providers crear providers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear providers" ON public.providers FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: savings_challenges crear savings_challenges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear savings_challenges" ON public.savings_challenges FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: shared_group_expenses crear shared_group_expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear shared_group_expenses" ON public.shared_group_expenses FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: shared_groups crear shared_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear shared_groups" ON public.shared_groups FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: subscriptions crear subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear subscriptions" ON public.subscriptions FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: tax_assets crear tax_assets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear tax_assets" ON public.tax_assets FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: tax_years crear tax_years; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear tax_years" ON public.tax_years FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: wishlist crear wishlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "crear wishlist" ON public.wishlist FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: credit_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;

--
-- Name: accountant_notes editar accountant_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar accountant_notes" ON public.accountant_notes FOR UPDATE TO authenticated USING ((public.is_book_member(book_id, 'editor'::text) AND (autor = 'titular'::text))) WITH CHECK ((public.is_book_member(book_id, 'editor'::text) AND (autor = 'titular'::text) AND (EXISTS ( SELECT 1
   FROM public.accountant_shares s
  WHERE ((s.id = accountant_notes.share_id) AND (s.book_id = accountant_notes.book_id))))));


--
-- Name: accountant_shares editar accountant_shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar accountant_shares" ON public.accountant_shares FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'admin'::text)) WITH CHECK (public.is_book_member(book_id, 'admin'::text));


--
-- Name: advisor_consultations editar advisor_consultations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar advisor_consultations" ON public.advisor_consultations FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: platform_settings editar ajustes plataforma; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar ajustes plataforma" ON public.platform_settings FOR UPDATE TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: allowance_movements editar allowance_movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar allowance_movements" ON public.allowance_movements FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: allowances editar allowances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar allowances" ON public.allowances FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: assets editar assets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar assets" ON public.assets FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: attachments editar attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar attachments" ON public.attachments FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: automation_runs editar automation_runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar automation_runs" ON public.automation_runs FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: automations editar automations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar automations" ON public.automations FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: calendar_events editar calendar_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar calendar_events" ON public.calendar_events FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: card_payments editar card_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar card_payments" ON public.card_payments FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: card_purchases editar card_purchases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar card_purchases" ON public.card_purchases FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: categories editar categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar categories" ON public.categories FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: contacts editar contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar contacts" ON public.contacts FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: credit_cards editar credit_cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar credit_cards" ON public.credit_cards FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: entities editar entities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar entities" ON public.entities FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: expenses editar expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar expenses" ON public.expenses FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: extra_incomes editar extra_incomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar extra_incomes" ON public.extra_incomes FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: family_members editar familia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar familia" ON public.family_members TO authenticated USING (public.is_household_member(household_id, 'editor'::text)) WITH CHECK (public.is_household_member(household_id, 'editor'::text));


--
-- Name: fixed_expense_payments editar fixed_expense_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar fixed_expense_payments" ON public.fixed_expense_payments FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: fixed_expenses editar fixed_expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar fixed_expenses" ON public.fixed_expenses FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: fund_movements editar fund_movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar fund_movements" ON public.fund_movements FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: goal_movements editar goal_movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar goal_movements" ON public.goal_movements FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: goals editar goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar goals" ON public.goals FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: households editar hogar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar hogar" ON public.households FOR UPDATE TO authenticated USING (public.is_household_member(id, 'owner'::text));


--
-- Name: income_categories editar income_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar income_categories" ON public.income_categories FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: incomes editar incomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar incomes" ON public.incomes FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: investments editar investments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar investments" ON public.investments FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: keyword_rules editar keyword_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar keyword_rules" ON public.keyword_rules FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: liabilities editar liabilities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar liabilities" ON public.liabilities FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: books editar libros; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar libros" ON public.books FOR UPDATE TO authenticated USING (public.is_household_member(household_id, 'editor'::text));


--
-- Name: loan_payments editar loan_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar loan_payments" ON public.loan_payments FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: loans editar loans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar loans" ON public.loans FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: monthly_summaries editar monthly_summaries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar monthly_summaries" ON public.monthly_summaries FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: net_worth_snapshots editar net_worth_snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar net_worth_snapshots" ON public.net_worth_snapshots FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: payment_methods editar payment_methods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar payment_methods" ON public.payment_methods FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: plans editar planes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar planes" ON public.plans FOR UPDATE TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: providers editar providers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar providers" ON public.providers FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: savings_challenges editar savings_challenges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar savings_challenges" ON public.savings_challenges FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: shared_group_expenses editar shared_group_expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar shared_group_expenses" ON public.shared_group_expenses FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: shared_groups editar shared_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar shared_groups" ON public.shared_groups FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: subscriptions editar subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar subscriptions" ON public.subscriptions FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: tax_assets editar tax_assets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar tax_assets" ON public.tax_assets FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: tax_years editar tax_years; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar tax_years" ON public.tax_years FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: wishlist editar wishlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editar wishlist" ON public.wishlist FOR UPDATE TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: emergency_funds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.emergency_funds ENABLE ROW LEVEL SECURITY;

--
-- Name: entities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback enviar opinion; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "enviar opinion" ON public.feedback FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (estado = 'nuevo'::text) AND (respuesta IS NULL) AND (respondido_at IS NULL) AND (respondido_por IS NULL) AND ((household_id IS NULL) OR public.is_household_member(household_id, 'viewer'::text))));


--
-- Name: book_settings escribir book_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "escribir book_settings" ON public.book_settings TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: emergency_funds escribir emergency_funds; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "escribir emergency_funds" ON public.emergency_funds TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: gami_badges escribir gami_badges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "escribir gami_badges" ON public.gami_badges FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: gami_missions escribir gami_missions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "escribir gami_missions" ON public.gami_missions FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: gami_points_ledger escribir gami_points_ledger; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "escribir gami_points_ledger" ON public.gami_points_ledger FOR INSERT TO authenticated WITH CHECK (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: gami_state escribir gami_state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "escribir gami_state" ON public.gami_state TO authenticated USING (public.is_book_member(book_id, 'editor'::text)) WITH CHECK (public.is_book_member(book_id, 'editor'::text));


--
-- Name: expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: extra_incomes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extra_incomes ENABLE ROW LEVEL SECURITY;

--
-- Name: family_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: fixed_expense_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fixed_expense_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: fixed_expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fixed_expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: fund_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fund_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: gami_badges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gami_badges ENABLE ROW LEVEL SECURITY;

--
-- Name: gami_missions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gami_missions ENABLE ROW LEVEL SECURITY;

--
-- Name: gami_points_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gami_points_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: gami_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gami_state ENABLE ROW LEVEL SECURITY;

--
-- Name: gami_visits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gami_visits ENABLE ROW LEVEL SECURITY;

--
-- Name: household_members gestionar miembros; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gestionar miembros" ON public.household_members FOR UPDATE TO authenticated USING (public.is_household_member(household_id, 'owner'::text));


--
-- Name: goal_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goal_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: goals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

--
-- Name: google_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: google_event_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_event_map ENABLE ROW LEVEL SECURITY;

--
-- Name: household_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.household_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: household_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;

--
-- Name: household_transfers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.household_transfers ENABLE ROW LEVEL SECURITY;

--
-- Name: households; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

--
-- Name: income_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.income_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: incomes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;

--
-- Name: integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: investments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;

--
-- Name: household_invitations invitaciones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitaciones ON public.household_invitations TO authenticated USING (public.is_household_member(household_id, 'admin'::text)) WITH CHECK (public.is_household_member(household_id, 'admin'::text));


--
-- Name: keyword_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.keyword_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: accountant_notes leer accountant_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer accountant_notes" ON public.accountant_notes FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: accountant_shares leer accountant_shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer accountant_shares" ON public.accountant_shares FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: advisor_consultations leer advisor_consultations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer advisor_consultations" ON public.advisor_consultations FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: platform_settings leer ajustes plataforma; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer ajustes plataforma" ON public.platform_settings FOR SELECT TO authenticated USING (true);


--
-- Name: allowance_movements leer allowance_movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer allowance_movements" ON public.allowance_movements FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: allowances leer allowances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer allowances" ON public.allowances FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: assets leer assets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer assets" ON public.assets FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: attachments leer attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer attachments" ON public.attachments FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: automation_events leer automation_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer automation_events" ON public.automation_events FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: automation_runs leer automation_runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer automation_runs" ON public.automation_runs FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: automations leer automations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer automations" ON public.automations FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: book_settings leer book_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer book_settings" ON public.book_settings FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: calendar_events leer calendar_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer calendar_events" ON public.calendar_events FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: card_payments leer card_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer card_payments" ON public.card_payments FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: card_purchases leer card_purchases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer card_purchases" ON public.card_purchases FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: categories leer categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer categories" ON public.categories FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: contacts leer contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer contacts" ON public.contacts FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: credit_cards leer credit_cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer credit_cards" ON public.credit_cards FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: emergency_funds leer emergency_funds; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer emergency_funds" ON public.emergency_funds FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: entities leer entities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer entities" ON public.entities FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: expenses leer expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer expenses" ON public.expenses FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: extra_incomes leer extra_incomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer extra_incomes" ON public.extra_incomes FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: fixed_expense_payments leer fixed_expense_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer fixed_expense_payments" ON public.fixed_expense_payments FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: fixed_expenses leer fixed_expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer fixed_expenses" ON public.fixed_expenses FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: fund_movements leer fund_movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer fund_movements" ON public.fund_movements FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: gami_badges leer gami_badges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer gami_badges" ON public.gami_badges FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: gami_missions leer gami_missions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer gami_missions" ON public.gami_missions FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: gami_points_ledger leer gami_points_ledger; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer gami_points_ledger" ON public.gami_points_ledger FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: gami_state leer gami_state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer gami_state" ON public.gami_state FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: goal_movements leer goal_movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer goal_movements" ON public.goal_movements FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: goals leer goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer goals" ON public.goals FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: income_categories leer income_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer income_categories" ON public.income_categories FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: incomes leer incomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer incomes" ON public.incomes FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: investments leer investments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer investments" ON public.investments FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: keyword_rules leer keyword_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer keyword_rules" ON public.keyword_rules FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: liabilities leer liabilities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer liabilities" ON public.liabilities FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: loan_payments leer loan_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer loan_payments" ON public.loan_payments FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: loans leer loans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer loans" ON public.loans FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: monthly_summaries leer monthly_summaries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer monthly_summaries" ON public.monthly_summaries FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: net_worth_snapshots leer net_worth_snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer net_worth_snapshots" ON public.net_worth_snapshots FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: payment_methods leer payment_methods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer payment_methods" ON public.payment_methods FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: providers leer providers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer providers" ON public.providers FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: ref_fiscal_templates leer ref_fiscal_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer ref_fiscal_templates" ON public.ref_fiscal_templates FOR SELECT TO anon, authenticated USING (true);


--
-- Name: ref_holidays leer ref_holidays; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer ref_holidays" ON public.ref_holidays FOR SELECT TO anon, authenticated USING (true);


--
-- Name: ref_municipalities leer ref_municipalities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer ref_municipalities" ON public.ref_municipalities FOR SELECT TO anon, authenticated USING (true);


--
-- Name: ref_rates leer ref_rates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer ref_rates" ON public.ref_rates FOR SELECT TO anon, authenticated USING (true);


--
-- Name: ref_renta_calendar leer ref_renta_calendar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer ref_renta_calendar" ON public.ref_renta_calendar FOR SELECT TO anon, authenticated USING (true);


--
-- Name: ref_renta_regimenes leer ref_renta_regimenes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer ref_renta_regimenes" ON public.ref_renta_regimenes FOR SELECT TO anon, authenticated USING (true);


--
-- Name: ref_smmlv leer ref_smmlv; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer ref_smmlv" ON public.ref_smmlv FOR SELECT TO anon, authenticated USING (true);


--
-- Name: ref_trm leer ref_trm; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer ref_trm" ON public.ref_trm FOR SELECT TO anon, authenticated USING (true);


--
-- Name: ref_usury_rate leer ref_usury_rate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer ref_usury_rate" ON public.ref_usury_rate FOR SELECT TO anon, authenticated USING (true);


--
-- Name: ref_uvt leer ref_uvt; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer ref_uvt" ON public.ref_uvt FOR SELECT TO anon, authenticated USING (true);


--
-- Name: savings_challenges leer savings_challenges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer savings_challenges" ON public.savings_challenges FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: shared_group_expenses leer shared_group_expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer shared_group_expenses" ON public.shared_group_expenses FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: shared_groups leer shared_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer shared_groups" ON public.shared_groups FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: subscriptions leer subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer subscriptions" ON public.subscriptions FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: tax_assets leer tax_assets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer tax_assets" ON public.tax_assets FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: tax_years leer tax_years; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer tax_years" ON public.tax_years FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: wishlist leer wishlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leer wishlist" ON public.wishlist FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'viewer'::text));


--
-- Name: liabilities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.liabilities ENABLE ROW LEVEL SECURITY;

--
-- Name: loan_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: loans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications marcar leidos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "marcar leidos" ON public.notifications FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: chat_messages mensajes propios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mensajes propios" ON public.chat_messages TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.chat_threads t
  WHERE ((t.id = chat_messages.thread_id) AND (t.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.chat_threads t
  WHERE ((t.id = chat_messages.thread_id) AND (t.user_id = auth.uid())))));


--
-- Name: account_events mi actividad; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mi actividad" ON public.account_events FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: ad_user_daily mis vistas de anuncios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mis vistas de anuncios" ON public.ad_user_daily FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_platform_admin()));


--
-- Name: monthly_summaries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.monthly_summaries ENABLE ROW LEVEL SECURITY;

--
-- Name: net_worth_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.net_worth_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_outbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_methods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles perfil de compañeros de hogar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "perfil de compañeros de hogar" ON public.profiles FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.household_members a
     JOIN public.household_members b ON ((a.household_id = b.household_id)))
  WHERE ((a.user_id = auth.uid()) AND (b.user_id = profiles.id)))));


--
-- Name: profiles perfil propio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "perfil propio" ON public.profiles TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: accountant_notes plan crear accountant_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plan crear accountant_notes" ON public.accountant_notes AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.book_plan_ok(book_id, 'impuestos'::text));


--
-- Name: accountant_shares plan crear accountant_shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plan crear accountant_shares" ON public.accountant_shares AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.book_plan_ok(book_id, 'impuestos'::text));


--
-- Name: allowance_movements plan crear allowance_movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plan crear allowance_movements" ON public.allowance_movements AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.book_plan_ok(book_id, 'familia'::text));


--
-- Name: allowances plan crear allowances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plan crear allowances" ON public.allowances AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.book_plan_ok(book_id, 'familia'::text));


--
-- Name: shared_group_expenses plan crear shared_group_expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plan crear shared_group_expenses" ON public.shared_group_expenses AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.book_plan_ok(book_id, 'familia'::text));


--
-- Name: shared_groups plan crear shared_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plan crear shared_groups" ON public.shared_groups AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.book_plan_ok(book_id, 'familia'::text));


--
-- Name: tax_assets plan crear tax_assets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plan crear tax_assets" ON public.tax_assets AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.book_plan_ok(book_id, 'impuestos'::text));


--
-- Name: tax_years plan crear tax_years; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plan crear tax_years" ON public.tax_years AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.book_plan_ok(book_id, 'impuestos'::text));


--
-- Name: accountant_notes plan editar accountant_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plan editar accountant_notes" ON public.accountant_notes AS RESTRICTIVE FOR UPDATE TO authenticated USING (true) WITH CHECK ((public.book_plan_ok(book_id, 'impuestos'::text) OR (deleted_at IS NOT NULL)));


--
-- Name: accountant_shares plan editar accountant_shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plan editar accountant_shares" ON public.accountant_shares AS RESTRICTIVE FOR UPDATE TO authenticated USING (true) WITH CHECK ((public.book_plan_ok(book_id, 'impuestos'::text) OR (revoked_at IS NOT NULL)));


--
-- Name: allowance_movements plan editar allowance_movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plan editar allowance_movements" ON public.allowance_movements AS RESTRICTIVE FOR UPDATE TO authenticated USING (true) WITH CHECK ((public.book_plan_ok(book_id, 'familia'::text) OR (deleted_at IS NOT NULL)));


--
-- Name: allowances plan editar allowances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plan editar allowances" ON public.allowances AS RESTRICTIVE FOR UPDATE TO authenticated USING (true) WITH CHECK ((public.book_plan_ok(book_id, 'familia'::text) OR (deleted_at IS NOT NULL)));


--
-- Name: shared_group_expenses plan editar shared_group_expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plan editar shared_group_expenses" ON public.shared_group_expenses AS RESTRICTIVE FOR UPDATE TO authenticated USING (true) WITH CHECK ((public.book_plan_ok(book_id, 'familia'::text) OR (deleted_at IS NOT NULL)));


--
-- Name: shared_groups plan editar shared_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plan editar shared_groups" ON public.shared_groups AS RESTRICTIVE FOR UPDATE TO authenticated USING (true) WITH CHECK ((public.book_plan_ok(book_id, 'familia'::text) OR (deleted_at IS NOT NULL)));


--
-- Name: tax_assets plan editar tax_assets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plan editar tax_assets" ON public.tax_assets AS RESTRICTIVE FOR UPDATE TO authenticated USING (true) WITH CHECK ((public.book_plan_ok(book_id, 'impuestos'::text) OR (deleted_at IS NOT NULL)));


--
-- Name: tax_years plan editar tax_years; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plan editar tax_years" ON public.tax_years AS RESTRICTIVE FOR UPDATE TO authenticated USING (true) WITH CHECK ((public.book_plan_ok(book_id, 'impuestos'::text) OR (deleted_at IS NOT NULL)));


--
-- Name: plan_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plan_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: plan_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plan_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: user_preferences preferencias propias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "preferencias propias" ON public.user_preferences TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses propios borrar expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "propios borrar expenses" ON public.expenses FOR DELETE TO authenticated USING (((created_by = auth.uid()) AND public.is_book_member(book_id, 'registra'::text)));


--
-- Name: extra_incomes propios borrar extra_incomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "propios borrar extra_incomes" ON public.extra_incomes FOR DELETE TO authenticated USING (((created_by = auth.uid()) AND public.is_book_member(book_id, 'registra'::text)));


--
-- Name: incomes propios borrar incomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "propios borrar incomes" ON public.incomes FOR DELETE TO authenticated USING (((created_by = auth.uid()) AND public.is_book_member(book_id, 'registra'::text)));


--
-- Name: expenses propios crear expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "propios crear expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND public.is_book_member(book_id, 'registra'::text)));


--
-- Name: extra_incomes propios crear extra_incomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "propios crear extra_incomes" ON public.extra_incomes FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND public.is_book_member(book_id, 'registra'::text)));


--
-- Name: incomes propios crear incomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "propios crear incomes" ON public.incomes FOR INSERT TO authenticated WITH CHECK (((created_by = auth.uid()) AND public.is_book_member(book_id, 'registra'::text)));


--
-- Name: expenses propios editar expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "propios editar expenses" ON public.expenses FOR UPDATE TO authenticated USING (((created_by = auth.uid()) AND public.is_book_member(book_id, 'registra'::text))) WITH CHECK (((created_by = auth.uid()) AND public.is_book_member(book_id, 'registra'::text)));


--
-- Name: extra_incomes propios editar extra_incomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "propios editar extra_incomes" ON public.extra_incomes FOR UPDATE TO authenticated USING (((created_by = auth.uid()) AND public.is_book_member(book_id, 'registra'::text))) WITH CHECK (((created_by = auth.uid()) AND public.is_book_member(book_id, 'registra'::text)));


--
-- Name: incomes propios editar incomes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "propios editar incomes" ON public.incomes FOR UPDATE TO authenticated USING (((created_by = auth.uid()) AND public.is_book_member(book_id, 'registra'::text))) WITH CHECK (((created_by = auth.uid()) AND public.is_book_member(book_id, 'registra'::text)));


--
-- Name: providers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions push propio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "push propio" ON public.push_subscriptions TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: household_members quitar miembros; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "quitar miembros" ON public.household_members FOR DELETE TO authenticated USING ((public.is_household_member(household_id, 'owner'::text) OR (user_id = auth.uid())));


--
-- Name: rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: ref_fiscal_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ref_fiscal_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: ref_holidays; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ref_holidays ENABLE ROW LEVEL SECURITY;

--
-- Name: ref_municipalities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ref_municipalities ENABLE ROW LEVEL SECURITY;

--
-- Name: ref_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ref_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: ref_renta_calendar; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ref_renta_calendar ENABLE ROW LEVEL SECURITY;

--
-- Name: ref_renta_regimenes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ref_renta_regimenes ENABLE ROW LEVEL SECURITY;

--
-- Name: ref_smmlv; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ref_smmlv ENABLE ROW LEVEL SECURITY;

--
-- Name: ref_trm; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ref_trm ENABLE ROW LEVEL SECURITY;

--
-- Name: ref_usury_rate; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ref_usury_rate ENABLE ROW LEVEL SECURITY;

--
-- Name: ref_uvt; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ref_uvt ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: referrals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_rules reglas propias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "reglas propias" ON public.notification_rules TO authenticated USING ((user_id = auth.uid())) WITH CHECK (((user_id = auth.uid()) AND public.is_book_member(book_id, 'viewer'::text)));


--
-- Name: feedback responder opiniones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "responder opiniones" ON public.feedback FOR UPDATE TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: platform_admins saber si soy admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "saber si soy admin" ON public.platform_admins FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: savings_challenges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.savings_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_group_expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shared_group_expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shared_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_years; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_years ENABLE ROW LEVEL SECURITY;

--
-- Name: telegram_links telegram propio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "telegram propio" ON public.telegram_links FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: telegram_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;

--
-- Name: user_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: google_event_map ve sus eventos de google; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ve sus eventos de google" ON public.google_event_map FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: ads ver anuncios vigentes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ver anuncios vigentes" ON public.ads FOR SELECT TO authenticated USING (((activo AND ((desde IS NULL) OR (desde <= CURRENT_DATE)) AND ((hasta IS NULL) OR (hasta >= CURRENT_DATE))) OR public.is_platform_admin()));


--
-- Name: ad_campaigns ver campañas activas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ver campañas activas" ON public.ad_campaigns FOR SELECT TO authenticated USING (((estado = 'activa'::text) OR public.is_platform_admin()));


--
-- Name: family_members ver familia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ver familia" ON public.family_members FOR SELECT TO authenticated USING (public.is_household_member(household_id, 'viewer'::text));


--
-- Name: audit_log ver historial; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ver historial" ON public.audit_log FOR SELECT TO authenticated USING ((((book_id IS NOT NULL) AND public.is_book_member(book_id, 'viewer'::text)) OR ((household_id IS NOT NULL) AND public.is_household_member(household_id, 'viewer'::text))));


--
-- Name: households ver hogar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ver hogar" ON public.households FOR SELECT TO authenticated USING (public.is_household_member(id, 'viewer'::text));


--
-- Name: books ver libros; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ver libros" ON public.books FOR SELECT TO authenticated USING (public.is_household_member(household_id, 'viewer'::text));


--
-- Name: referral_codes ver mi codigo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ver mi codigo" ON public.referral_codes FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_platform_admin()));


--
-- Name: household_members ver miembros; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ver miembros" ON public.household_members FOR SELECT TO authenticated USING (public.is_household_member(household_id, 'viewer'::text));


--
-- Name: referrals ver mis referidos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ver mis referidos" ON public.referrals FOR SELECT TO authenticated USING (((referrer = auth.uid()) OR (referred = auth.uid()) OR public.is_platform_admin()));


--
-- Name: feedback ver opiniones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ver opiniones" ON public.feedback FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_platform_admin()));


--
-- Name: plan_payments ver pagos del plan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ver pagos del plan" ON public.plan_payments FOR SELECT TO authenticated USING ((public.is_household_member(household_id, 'owner'::text) OR public.is_platform_admin()));


--
-- Name: plan_subscriptions ver plan del hogar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ver plan del hogar" ON public.plan_subscriptions FOR SELECT TO authenticated USING ((public.is_household_member(household_id, 'viewer'::text) OR public.is_platform_admin()));


--
-- Name: plans ver planes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ver planes" ON public.plans FOR SELECT TO anon, authenticated USING (true);


--
-- Name: backups ver respaldos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ver respaldos" ON public.backups FOR SELECT TO authenticated USING (public.is_book_member(book_id, 'admin'::text));


--
-- Name: household_transfers ver traspasos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ver traspasos" ON public.household_transfers FOR SELECT TO authenticated USING (((from_user = auth.uid()) OR (to_user = auth.uid()) OR public.is_household_member(household_id, 'admin'::text)));


--
-- Name: ai_usage ver uso de ia del hogar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ver uso de ia del hogar" ON public.ai_usage FOR SELECT TO authenticated USING ((public.is_household_member(household_id, 'viewer'::text) OR public.is_platform_admin()));


--
-- Name: gami_visits visitas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY visitas ON public.gami_visits TO authenticated USING (((user_id = auth.uid()) AND public.is_book_member(book_id, 'viewer'::text))) WITH CHECK (((user_id = auth.uid()) AND public.is_book_member(book_id, 'viewer'::text)));


--
-- Name: wishlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION accept_invitation(p_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.accept_invitation(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.accept_invitation(p_token text) TO authenticated;
GRANT ALL ON FUNCTION public.accept_invitation(p_token text) TO service_role;


--
-- Name: FUNCTION ad_reach(p_desde date, p_hasta date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ad_reach(p_desde date, p_hasta date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ad_reach(p_desde date, p_hasta date) TO authenticated;
GRANT ALL ON FUNCTION public.ad_reach(p_desde date, p_hasta date) TO service_role;


--
-- Name: FUNCTION ad_track(p_ad uuid, p_slot text, p_kind text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ad_track(p_ad uuid, p_slot text, p_kind text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ad_track(p_ad uuid, p_slot text, p_kind text) TO authenticated;
GRANT ALL ON FUNCTION public.ad_track(p_ad uuid, p_slot text, p_kind text) TO service_role;


--
-- Name: FUNCTION add_card_purchase(p_card uuid, p_fecha date, p_descripcion text, p_valor numeric, p_cuotas integer, p_category uuid, p_como_gasto boolean, p_medio uuid, p_external_id text, p_member uuid, p_provider uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.add_card_purchase(p_card uuid, p_fecha date, p_descripcion text, p_valor numeric, p_cuotas integer, p_category uuid, p_como_gasto boolean, p_medio uuid, p_external_id text, p_member uuid, p_provider uuid) TO anon;
GRANT ALL ON FUNCTION public.add_card_purchase(p_card uuid, p_fecha date, p_descripcion text, p_valor numeric, p_cuotas integer, p_category uuid, p_como_gasto boolean, p_medio uuid, p_external_id text, p_member uuid, p_provider uuid) TO authenticated;
GRANT ALL ON FUNCTION public.add_card_purchase(p_card uuid, p_fecha date, p_descripcion text, p_valor numeric, p_cuotas integer, p_category uuid, p_como_gasto boolean, p_medio uuid, p_external_id text, p_member uuid, p_provider uuid) TO service_role;


--
-- Name: FUNCTION admin_migrations(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_migrations() FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_migrations() TO service_role;


--
-- Name: FUNCTION ai_creditos_desde(h uuid, desde timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ai_creditos_desde(h uuid, desde timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ai_creditos_desde(h uuid, desde timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.ai_creditos_desde(h uuid, desde timestamp with time zone) TO service_role;


--
-- Name: FUNCTION ai_usage_rollup(p_desde date, p_household uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ai_usage_rollup(p_desde date, p_household uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ai_usage_rollup(p_desde date, p_household uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ai_usage_rollup(p_desde date, p_household uuid) TO service_role;


--
-- Name: FUNCTION api_idempotency_cleanup(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.api_idempotency_cleanup() FROM PUBLIC;
GRANT ALL ON FUNCTION public.api_idempotency_cleanup() TO service_role;


--
-- Name: FUNCTION apply_household_transfer(p_household uuid, p_from uuid, p_to uuid, p_from_role text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_household_transfer(p_household uuid, p_from uuid, p_to uuid, p_from_role text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_household_transfer(p_household uuid, p_from uuid, p_to uuid, p_from_role text) TO service_role;


--
-- Name: FUNCTION apply_plan_payment(p_household uuid, p_proveedor text, p_referencia text, p_periodo text, p_monto integer, p_estado text, p_metodo text, p_pagador text, p_raw jsonb, p_subscription_ref text, p_plan text, p_cupon text, p_nota text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_plan_payment(p_household uuid, p_proveedor text, p_referencia text, p_periodo text, p_monto integer, p_estado text, p_metodo text, p_pagador text, p_raw jsonb, p_subscription_ref text, p_plan text, p_cupon text, p_nota text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_plan_payment(p_household uuid, p_proveedor text, p_referencia text, p_periodo text, p_monto integer, p_estado text, p_metodo text, p_pagador text, p_raw jsonb, p_subscription_ref text, p_plan text, p_cupon text, p_nota text) TO service_role;


--
-- Name: TABLE assets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.assets TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.assets TO authenticated;
GRANT ALL ON TABLE public.assets TO service_role;


--
-- Name: FUNCTION asset_cuadrar(p_asset uuid, p_saldo numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.asset_cuadrar(p_asset uuid, p_saldo numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.asset_cuadrar(p_asset uuid, p_saldo numeric) TO authenticated;
GRANT ALL ON FUNCTION public.asset_cuadrar(p_asset uuid, p_saldo numeric) TO service_role;


--
-- Name: FUNCTION audit_row(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.audit_row() TO anon;
GRANT ALL ON FUNCTION public.audit_row() TO authenticated;
GRANT ALL ON FUNCTION public.audit_row() TO service_role;


--
-- Name: FUNCTION automation_as(p_user uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.automation_as(p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.automation_as(p_user uuid) TO service_role;


--
-- Name: FUNCTION automation_create_income(p_user uuid, p_book uuid, p_fecha date, p_descripcion text, p_valor numeric, p_category uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.automation_create_income(p_user uuid, p_book uuid, p_fecha date, p_descripcion text, p_valor numeric, p_category uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.automation_create_income(p_user uuid, p_book uuid, p_fecha date, p_descripcion text, p_valor numeric, p_category uuid) TO service_role;


--
-- Name: FUNCTION automation_enqueue(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.automation_enqueue() TO anon;
GRANT ALL ON FUNCTION public.automation_enqueue() TO authenticated;
GRANT ALL ON FUNCTION public.automation_enqueue() TO service_role;


--
-- Name: FUNCTION automation_limit(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.automation_limit() TO anon;
GRANT ALL ON FUNCTION public.automation_limit() TO authenticated;
GRANT ALL ON FUNCTION public.automation_limit() TO service_role;


--
-- Name: FUNCTION automation_pay_fixed(p_user uuid, p_fixed uuid, p_periodo text, p_fecha date, p_valor numeric, p_desc_suffix text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.automation_pay_fixed(p_user uuid, p_fixed uuid, p_periodo text, p_fecha date, p_valor numeric, p_desc_suffix text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.automation_pay_fixed(p_user uuid, p_fixed uuid, p_periodo text, p_fecha date, p_valor numeric, p_desc_suffix text) TO service_role;


--
-- Name: FUNCTION book_household(bk uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.book_household(bk uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.book_household(bk uuid) TO service_role;


--
-- Name: FUNCTION book_plan_ok(bk uuid, f text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.book_plan_ok(bk uuid, f text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.book_plan_ok(bk uuid, f text) TO authenticated;
GRANT ALL ON FUNCTION public.book_plan_ok(bk uuid, f text) TO service_role;


--
-- Name: FUNCTION cancel_household_transfer(p_transfer uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_household_transfer(p_transfer uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_household_transfer(p_transfer uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_household_transfer(p_transfer uuid) TO service_role;


--
-- Name: FUNCTION cancel_my_email_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_my_email_change() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_my_email_change() TO authenticated;
GRANT ALL ON FUNCTION public.cancel_my_email_change() TO service_role;


--
-- Name: FUNCTION card_payment_sync(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.card_payment_sync() TO anon;
GRANT ALL ON FUNCTION public.card_payment_sync() TO authenticated;
GRANT ALL ON FUNCTION public.card_payment_sync() TO service_role;


--
-- Name: FUNCTION card_purchase_sync(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.card_purchase_sync() TO anon;
GRANT ALL ON FUNCTION public.card_purchase_sync() TO authenticated;
GRANT ALL ON FUNCTION public.card_purchase_sync() TO service_role;


--
-- Name: FUNCTION count_orphan_households(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.count_orphan_households() FROM PUBLIC;
GRANT ALL ON FUNCTION public.count_orphan_households() TO service_role;


--
-- Name: FUNCTION create_book(p_household uuid, p_nombre text, p_tipo text, p_icon text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_book(p_household uuid, p_nombre text, p_tipo text, p_icon text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_book(p_household uuid, p_nombre text, p_tipo text, p_icon text) TO authenticated;
GRANT ALL ON FUNCTION public.create_book(p_household uuid, p_nombre text, p_tipo text, p_icon text) TO service_role;


--
-- Name: FUNCTION create_household(p_nombre text, p_libro text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_household(p_nombre text, p_libro text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_household(p_nombre text, p_libro text) TO authenticated;
GRANT ALL ON FUNCTION public.create_household(p_nombre text, p_libro text) TO service_role;


--
-- Name: FUNCTION credit_card_cascade(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.credit_card_cascade() TO anon;
GRANT ALL ON FUNCTION public.credit_card_cascade() TO authenticated;
GRANT ALL ON FUNCTION public.credit_card_cascade() TO service_role;


--
-- Name: FUNCTION delete_orphan_households(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_orphan_households() FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_orphan_households() TO service_role;


--
-- Name: FUNCTION enforce_free_limits(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_free_limits() TO anon;
GRANT ALL ON FUNCTION public.enforce_free_limits() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_free_limits() TO service_role;


--
-- Name: FUNCTION ensure_email_identity(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ensure_email_identity() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_email_identity() TO authenticated;
GRANT ALL ON FUNCTION public.ensure_email_identity() TO service_role;


--
-- Name: FUNCTION expense_card_sync(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.expense_card_sync() TO anon;
GRANT ALL ON FUNCTION public.expense_card_sync() TO authenticated;
GRANT ALL ON FUNCTION public.expense_card_sync() TO service_role;


--
-- Name: FUNCTION expense_fixed_edit_sync(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.expense_fixed_edit_sync() TO anon;
GRANT ALL ON FUNCTION public.expense_fixed_edit_sync() TO authenticated;
GRANT ALL ON FUNCTION public.expense_fixed_edit_sync() TO service_role;


--
-- Name: FUNCTION expense_fixed_sync(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.expense_fixed_sync() TO anon;
GRANT ALL ON FUNCTION public.expense_fixed_sync() TO authenticated;
GRANT ALL ON FUNCTION public.expense_fixed_sync() TO service_role;


--
-- Name: FUNCTION expense_fund_sync(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.expense_fund_sync() TO anon;
GRANT ALL ON FUNCTION public.expense_fund_sync() TO authenticated;
GRANT ALL ON FUNCTION public.expense_fund_sync() TO service_role;


--
-- Name: FUNCTION expense_member_from_fixed(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.expense_member_from_fixed() TO anon;
GRANT ALL ON FUNCTION public.expense_member_from_fixed() TO authenticated;
GRANT ALL ON FUNCTION public.expense_member_from_fixed() TO service_role;


--
-- Name: FUNCTION expense_provider_default(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.expense_provider_default() TO anon;
GRANT ALL ON FUNCTION public.expense_provider_default() TO authenticated;
GRANT ALL ON FUNCTION public.expense_provider_default() TO service_role;


--
-- Name: FUNCTION expense_subscription_sync(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.expense_subscription_sync() TO anon;
GRANT ALL ON FUNCTION public.expense_subscription_sync() TO authenticated;
GRANT ALL ON FUNCTION public.expense_subscription_sync() TO service_role;


--
-- Name: FUNCTION feedback_on_insert(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.feedback_on_insert() TO anon;
GRANT ALL ON FUNCTION public.feedback_on_insert() TO authenticated;
GRANT ALL ON FUNCTION public.feedback_on_insert() TO service_role;


--
-- Name: FUNCTION feedback_on_update(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.feedback_on_update() TO anon;
GRANT ALL ON FUNCTION public.feedback_on_update() TO authenticated;
GRANT ALL ON FUNCTION public.feedback_on_update() TO service_role;


--
-- Name: FUNCTION fixed_cascade_soft(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fixed_cascade_soft() TO anon;
GRANT ALL ON FUNCTION public.fixed_cascade_soft() TO authenticated;
GRANT ALL ON FUNCTION public.fixed_cascade_soft() TO service_role;


--
-- Name: FUNCTION fixed_members_sync(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fixed_members_sync() TO anon;
GRANT ALL ON FUNCTION public.fixed_members_sync() TO authenticated;
GRANT ALL ON FUNCTION public.fixed_members_sync() TO service_role;


--
-- Name: FUNCTION fixed_provider_sync(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fixed_provider_sync() TO anon;
GRANT ALL ON FUNCTION public.fixed_provider_sync() TO authenticated;
GRANT ALL ON FUNCTION public.fixed_provider_sync() TO service_role;


--
-- Name: FUNCTION fund_save(p_book uuid, p_valor numeric, p_fecha date, p_nota text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fund_save(p_book uuid, p_valor numeric, p_fecha date, p_nota text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fund_save(p_book uuid, p_valor numeric, p_fecha date, p_nota text) TO authenticated;
GRANT ALL ON FUNCTION public.fund_save(p_book uuid, p_valor numeric, p_fecha date, p_nota text) TO service_role;


--
-- Name: FUNCTION fund_use(p_book uuid, p_desc text, p_valor numeric, p_fecha date, p_medio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fund_use(p_book uuid, p_desc text, p_valor numeric, p_fecha date, p_medio uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fund_use(p_book uuid, p_desc text, p_valor numeric, p_fecha date, p_medio uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fund_use(p_book uuid, p_desc text, p_valor numeric, p_fecha date, p_medio uuid) TO service_role;


--
-- Name: FUNCTION goal_contribute(p_goal uuid, p_valor numeric, p_fecha date, p_nota text, p_medio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.goal_contribute(p_goal uuid, p_valor numeric, p_fecha date, p_nota text, p_medio uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.goal_contribute(p_goal uuid, p_valor numeric, p_fecha date, p_nota text, p_medio uuid) TO authenticated;
GRANT ALL ON FUNCTION public.goal_contribute(p_goal uuid, p_valor numeric, p_fecha date, p_nota text, p_medio uuid) TO service_role;


--
-- Name: FUNCTION goal_movement_sync(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.goal_movement_sync() FROM PUBLIC;
GRANT ALL ON FUNCTION public.goal_movement_sync() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION household_can(h uuid, f text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.household_can(h uuid, f text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.household_can(h uuid, f text) TO authenticated;
GRANT ALL ON FUNCTION public.household_can(h uuid, f text) TO service_role;


--
-- Name: FUNCTION household_plan(h uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.household_plan(h uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.household_plan(h uuid) TO authenticated;
GRANT ALL ON FUNCTION public.household_plan(h uuid) TO service_role;


--
-- Name: FUNCTION household_subscription(h uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.household_subscription(h uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.household_subscription(h uuid) TO authenticated;
GRANT ALL ON FUNCTION public.household_subscription(h uuid) TO service_role;


--
-- Name: FUNCTION invitation_dest_key(p_email text, p_phone text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.invitation_dest_key(p_email text, p_phone text) TO anon;
GRANT ALL ON FUNCTION public.invitation_dest_key(p_email text, p_phone text) TO authenticated;
GRANT ALL ON FUNCTION public.invitation_dest_key(p_email text, p_phone text) TO service_role;


--
-- Name: FUNCTION invitation_info(p_token text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.invitation_info(p_token text) TO anon;
GRANT ALL ON FUNCTION public.invitation_info(p_token text) TO authenticated;
GRANT ALL ON FUNCTION public.invitation_info(p_token text) TO service_role;


--
-- Name: FUNCTION invitation_replace_pending(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.invitation_replace_pending() TO anon;
GRANT ALL ON FUNCTION public.invitation_replace_pending() TO authenticated;
GRANT ALL ON FUNCTION public.invitation_replace_pending() TO service_role;


--
-- Name: FUNCTION is_book_member(bk uuid, min_role text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_book_member(bk uuid, min_role text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_book_member(bk uuid, min_role text) TO authenticated;
GRANT ALL ON FUNCTION public.is_book_member(bk uuid, min_role text) TO service_role;


--
-- Name: FUNCTION is_household_member(hh uuid, min_role text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_household_member(hh uuid, min_role text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_household_member(hh uuid, min_role text) TO authenticated;
GRANT ALL ON FUNCTION public.is_household_member(hh uuid, min_role text) TO service_role;


--
-- Name: FUNCTION is_platform_admin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_platform_admin() TO service_role;


--
-- Name: FUNCTION join_from_invitation(p_inv uuid, p_uid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.join_from_invitation(p_inv uuid, p_uid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_from_invitation(p_inv uuid, p_uid uuid) TO service_role;


--
-- Name: FUNCTION legacy_role(r text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.legacy_role(r text) TO anon;
GRANT ALL ON FUNCTION public.legacy_role(r text) TO authenticated;
GRANT ALL ON FUNCTION public.legacy_role(r text) TO service_role;


--
-- Name: FUNCTION link_expense_fixed(p_expense uuid, p_fixed uuid, p_periodo text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.link_expense_fixed(p_expense uuid, p_fixed uuid, p_periodo text) TO anon;
GRANT ALL ON FUNCTION public.link_expense_fixed(p_expense uuid, p_fixed uuid, p_periodo text) TO authenticated;
GRANT ALL ON FUNCTION public.link_expense_fixed(p_expense uuid, p_fixed uuid, p_periodo text) TO service_role;


--
-- Name: FUNCTION link_family_member(p_household uuid, p_user uuid, p_family uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.link_family_member(p_household uuid, p_user uuid, p_family uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.link_family_member(p_household uuid, p_user uuid, p_family uuid) TO authenticated;
GRANT ALL ON FUNCTION public.link_family_member(p_household uuid, p_user uuid, p_family uuid) TO service_role;


--
-- Name: FUNCTION loan_acreedor_sync(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.loan_acreedor_sync() TO anon;
GRANT ALL ON FUNCTION public.loan_acreedor_sync() TO authenticated;
GRANT ALL ON FUNCTION public.loan_acreedor_sync() TO service_role;


--
-- Name: FUNCTION loan_provider_check(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.loan_provider_check() TO anon;
GRANT ALL ON FUNCTION public.loan_provider_check() TO authenticated;
GRANT ALL ON FUNCTION public.loan_provider_check() TO service_role;


--
-- Name: FUNCTION log_account_event(p_user uuid, p_kind text, p_detail jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.log_account_event(p_user uuid, p_kind text, p_detail jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_account_event(p_user uuid, p_kind text, p_detail jsonb) TO service_role;


--
-- Name: FUNCTION member_access(p_household uuid, p_user uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.member_access(p_household uuid, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.member_access(p_household uuid, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.member_access(p_household uuid, p_user uuid) TO service_role;


--
-- Name: FUNCTION mirai_app_context(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mirai_app_context() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mirai_app_context() TO authenticated;
GRANT ALL ON FUNCTION public.mirai_app_context() TO service_role;


--
-- Name: FUNCTION mirai_live_notify(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mirai_live_notify() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mirai_live_notify() TO service_role;


--
-- Name: FUNCTION mirai_live_notify_install(enable boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mirai_live_notify_install(enable boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mirai_live_notify_install(enable boolean) TO service_role;


--
-- Name: FUNCTION mirai_notify_cron_active(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mirai_notify_cron_active() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mirai_notify_cron_active() TO service_role;


--
-- Name: FUNCTION mirai_schedule_notify(site_url text, cron_secret text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mirai_schedule_notify(site_url text, cron_secret text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mirai_schedule_notify(site_url text, cron_secret text) TO service_role;


--
-- Name: FUNCTION my_account(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.my_account() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_account() TO authenticated;
GRANT ALL ON FUNCTION public.my_account() TO service_role;


--
-- Name: FUNCTION my_sessions(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.my_sessions() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_sessions() TO authenticated;
GRANT ALL ON FUNCTION public.my_sessions() TO service_role;


--
-- Name: FUNCTION notify_claim(p_dedupe text, p_user uuid, p_household uuid, p_book uuid, p_channel text, p_kind text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_claim(p_dedupe text, p_user uuid, p_household uuid, p_book uuid, p_channel text, p_kind text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_claim(p_dedupe text, p_user uuid, p_household uuid, p_book uuid, p_channel text, p_kind text) TO service_role;


--
-- Name: FUNCTION on_auth_identity_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.on_auth_identity_change() FROM PUBLIC;
GRANT ALL ON FUNCTION public.on_auth_identity_change() TO service_role;


--
-- Name: FUNCTION on_auth_user_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.on_auth_user_change() FROM PUBLIC;
GRANT ALL ON FUNCTION public.on_auth_user_change() TO service_role;


--
-- Name: FUNCTION pay_credit_card(p_card uuid, p_valor numeric, p_fecha date, p_tipo text, p_medio uuid, p_nota text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pay_credit_card(p_card uuid, p_valor numeric, p_fecha date, p_tipo text, p_medio uuid, p_nota text) TO anon;
GRANT ALL ON FUNCTION public.pay_credit_card(p_card uuid, p_valor numeric, p_fecha date, p_tipo text, p_medio uuid, p_nota text) TO authenticated;
GRANT ALL ON FUNCTION public.pay_credit_card(p_card uuid, p_valor numeric, p_fecha date, p_tipo text, p_medio uuid, p_nota text) TO service_role;


--
-- Name: FUNCTION pay_fixed_expense(p_fixed uuid, p_periodo text, p_fecha date, p_valor numeric, p_medio uuid, p_desc_suffix text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pay_fixed_expense(p_fixed uuid, p_periodo text, p_fecha date, p_valor numeric, p_medio uuid, p_desc_suffix text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pay_fixed_expense(p_fixed uuid, p_periodo text, p_fecha date, p_valor numeric, p_medio uuid, p_desc_suffix text) TO authenticated;
GRANT ALL ON FUNCTION public.pay_fixed_expense(p_fixed uuid, p_periodo text, p_fecha date, p_valor numeric, p_medio uuid, p_desc_suffix text) TO service_role;


--
-- Name: FUNCTION pay_subscription(p_sub uuid, p_fecha date, p_valor numeric, p_medio uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pay_subscription(p_sub uuid, p_fecha date, p_valor numeric, p_medio uuid) TO anon;
GRANT ALL ON FUNCTION public.pay_subscription(p_sub uuid, p_fecha date, p_valor numeric, p_medio uuid) TO authenticated;
GRANT ALL ON FUNCTION public.pay_subscription(p_sub uuid, p_fecha date, p_valor numeric, p_medio uuid) TO service_role;


--
-- Name: FUNCTION person_label(p_user uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.person_label(p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.person_label(p_user uuid) TO service_role;


--
-- Name: FUNCTION plan_automation_limit(h uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.plan_automation_limit(h uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.plan_automation_limit(h uuid) TO authenticated;
GRANT ALL ON FUNCTION public.plan_automation_limit(h uuid) TO service_role;


--
-- Name: FUNCTION profiles_lock_email(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.profiles_lock_email() FROM PUBLIC;
GRANT ALL ON FUNCTION public.profiles_lock_email() TO service_role;


--
-- Name: FUNCTION provider_method_check(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.provider_method_check() TO anon;
GRANT ALL ON FUNCTION public.provider_method_check() TO authenticated;
GRANT ALL ON FUNCTION public.provider_method_check() TO service_role;


--
-- Name: FUNCTION provider_norm(s text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.provider_norm(s text) TO anon;
GRANT ALL ON FUNCTION public.provider_norm(s text) TO authenticated;
GRANT ALL ON FUNCTION public.provider_norm(s text) TO service_role;


--
-- Name: FUNCTION provider_rename_loans(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.provider_rename_loans() TO anon;
GRANT ALL ON FUNCTION public.provider_rename_loans() TO authenticated;
GRANT ALL ON FUNCTION public.provider_rename_loans() TO service_role;


--
-- Name: FUNCTION provider_rename_sync(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.provider_rename_sync() TO anon;
GRANT ALL ON FUNCTION public.provider_rename_sync() TO authenticated;
GRANT ALL ON FUNCTION public.provider_rename_sync() TO service_role;


--
-- Name: FUNCTION provider_tipo(s text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.provider_tipo(s text) TO anon;
GRANT ALL ON FUNCTION public.provider_tipo(s text) TO authenticated;
GRANT ALL ON FUNCTION public.provider_tipo(s text) TO service_role;


--
-- Name: FUNCTION rate_limit_hit(p_key text, p_max integer, p_window_s integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rate_limit_hit(p_key text, p_max integer, p_window_s integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rate_limit_hit(p_key text, p_max integer, p_window_s integer) TO service_role;


--
-- Name: FUNCTION registro_abierto(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.registro_abierto() TO anon;
GRANT ALL ON FUNCTION public.registro_abierto() TO authenticated;
GRANT ALL ON FUNCTION public.registro_abierto() TO service_role;


--
-- Name: FUNCTION remove_household_member(p_household uuid, p_user uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.remove_household_member(p_household uuid, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.remove_household_member(p_household uuid, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.remove_household_member(p_household uuid, p_user uuid) TO service_role;


--
-- Name: FUNCTION remove_my_password(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.remove_my_password() FROM PUBLIC;
GRANT ALL ON FUNCTION public.remove_my_password() TO authenticated;
GRANT ALL ON FUNCTION public.remove_my_password() TO service_role;


--
-- Name: FUNCTION request_household_transfer(p_household uuid, p_user uuid, p_from_role text, p_plan_action text, p_confirm text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.request_household_transfer(p_household uuid, p_user uuid, p_from_role text, p_plan_action text, p_confirm text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_household_transfer(p_household uuid, p_user uuid, p_from_role text, p_plan_action text, p_confirm text) TO authenticated;
GRANT ALL ON FUNCTION public.request_household_transfer(p_household uuid, p_user uuid, p_from_role text, p_plan_action text, p_confirm text) TO service_role;


--
-- Name: FUNCTION respond_household_transfer(p_transfer uuid, p_accept boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.respond_household_transfer(p_transfer uuid, p_accept boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.respond_household_transfer(p_transfer uuid, p_accept boolean) TO authenticated;
GRANT ALL ON FUNCTION public.respond_household_transfer(p_transfer uuid, p_accept boolean) TO service_role;


--
-- Name: FUNCTION revoke_my_session(p_session uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.revoke_my_session(p_session uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revoke_my_session(p_session uuid) TO authenticated;
GRANT ALL ON FUNCTION public.revoke_my_session(p_session uuid) TO service_role;


--
-- Name: FUNCTION role_rank(r text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.role_rank(r text) TO anon;
GRANT ALL ON FUNCTION public.role_rank(r text) TO authenticated;
GRANT ALL ON FUNCTION public.role_rank(r text) TO service_role;


--
-- Name: FUNCTION seed_book_defaults(bk uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.seed_book_defaults(bk uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.seed_book_defaults(bk uuid) TO service_role;


--
-- Name: FUNCTION set_member_access(p_household uuid, p_user uuid, p_access text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_member_access(p_household uuid, p_user uuid, p_access text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_member_access(p_household uuid, p_user uuid, p_access text) TO authenticated;
GRANT ALL ON FUNCTION public.set_member_access(p_household uuid, p_user uuid, p_access text) TO service_role;


--
-- Name: FUNCTION shared_expense_sync(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.shared_expense_sync() TO anon;
GRANT ALL ON FUNCTION public.shared_expense_sync() TO authenticated;
GRANT ALL ON FUNCTION public.shared_expense_sync() TO service_role;


--
-- Name: FUNCTION shared_group_cascade(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.shared_group_cascade() TO anon;
GRANT ALL ON FUNCTION public.shared_group_cascade() TO authenticated;
GRANT ALL ON FUNCTION public.shared_group_cascade() TO service_role;


--
-- Name: FUNCTION sync_enlaces_on(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_enlaces_on() TO anon;
GRANT ALL ON FUNCTION public.sync_enlaces_on() TO authenticated;
GRANT ALL ON FUNCTION public.sync_enlaces_on() TO service_role;


--
-- Name: FUNCTION sync_invitation_access(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_invitation_access() TO anon;
GRANT ALL ON FUNCTION public.sync_invitation_access() TO authenticated;
GRANT ALL ON FUNCTION public.sync_invitation_access() TO service_role;


--
-- Name: FUNCTION sync_member_access(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_member_access() TO anon;
GRANT ALL ON FUNCTION public.sync_member_access() TO authenticated;
GRANT ALL ON FUNCTION public.sync_member_access() TO service_role;


--
-- Name: FUNCTION touch_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.touch_updated_at() TO anon;
GRANT ALL ON FUNCTION public.touch_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.touch_updated_at() TO service_role;


--
-- Name: FUNCTION transfer_household(p_household uuid, p_user uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.transfer_household(p_household uuid, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.transfer_household(p_household uuid, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.transfer_household(p_household uuid, p_user uuid) TO service_role;


--
-- Name: FUNCTION try_uuid(t text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.try_uuid(t text) TO anon;
GRANT ALL ON FUNCTION public.try_uuid(t text) TO authenticated;
GRANT ALL ON FUNCTION public.try_uuid(t text) TO service_role;


--
-- Name: FUNCTION unlink_expense_fixed(p_expense uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.unlink_expense_fixed(p_expense uuid) TO anon;
GRANT ALL ON FUNCTION public.unlink_expense_fixed(p_expense uuid) TO authenticated;
GRANT ALL ON FUNCTION public.unlink_expense_fixed(p_expense uuid) TO service_role;


--
-- Name: FUNCTION unpay_fixed_expense(p_payment uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.unpay_fixed_expense(p_payment uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.unpay_fixed_expense(p_payment uuid) TO authenticated;
GRANT ALL ON FUNCTION public.unpay_fixed_expense(p_payment uuid) TO service_role;


--
-- Name: FUNCTION use_emergency_fund(p_expense uuid, p_valor numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.use_emergency_fund(p_expense uuid, p_valor numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.use_emergency_fund(p_expense uuid, p_valor numeric) TO authenticated;
GRANT ALL ON FUNCTION public.use_emergency_fund(p_expense uuid, p_valor numeric) TO service_role;


--
-- Name: TABLE account_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.account_events TO anon;
GRANT SELECT,MAINTAIN ON TABLE public.account_events TO authenticated;
GRANT ALL ON TABLE public.account_events TO service_role;


--
-- Name: SEQUENCE account_events_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.account_events_id_seq TO anon;
GRANT ALL ON SEQUENCE public.account_events_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.account_events_id_seq TO service_role;


--
-- Name: TABLE accountant_notes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.accountant_notes TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.accountant_notes TO authenticated;
GRANT ALL ON TABLE public.accountant_notes TO service_role;


--
-- Name: TABLE accountant_shares; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.accountant_shares TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.accountant_shares TO authenticated;
GRANT ALL ON TABLE public.accountant_shares TO service_role;


--
-- Name: TABLE ad_campaigns; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ad_campaigns TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ad_campaigns TO authenticated;
GRANT ALL ON TABLE public.ad_campaigns TO service_role;


--
-- Name: TABLE ad_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ad_events TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ad_events TO authenticated;
GRANT ALL ON TABLE public.ad_events TO service_role;


--
-- Name: TABLE ad_user_daily; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ad_user_daily TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ad_user_daily TO authenticated;
GRANT ALL ON TABLE public.ad_user_daily TO service_role;


--
-- Name: TABLE admin_audit; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.admin_audit TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.admin_audit TO authenticated;
GRANT ALL ON TABLE public.admin_audit TO service_role;


--
-- Name: SEQUENCE admin_audit_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.admin_audit_id_seq TO anon;
GRANT ALL ON SEQUENCE public.admin_audit_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.admin_audit_id_seq TO service_role;


--
-- Name: TABLE admin_notes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.admin_notes TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.admin_notes TO authenticated;
GRANT ALL ON TABLE public.admin_notes TO service_role;


--
-- Name: TABLE ads; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ads TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ads TO authenticated;
GRANT ALL ON TABLE public.ads TO service_role;


--
-- Name: TABLE advisor_consultations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.advisor_consultations TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.advisor_consultations TO authenticated;
GRANT ALL ON TABLE public.advisor_consultations TO service_role;


--
-- Name: TABLE ai_cache; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ai_cache TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ai_cache TO authenticated;
GRANT ALL ON TABLE public.ai_cache TO service_role;


--
-- Name: TABLE ai_usage; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ai_usage TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ai_usage TO authenticated;
GRANT ALL ON TABLE public.ai_usage TO service_role;


--
-- Name: TABLE allowance_movements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.allowance_movements TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.allowance_movements TO authenticated;
GRANT ALL ON TABLE public.allowance_movements TO service_role;


--
-- Name: TABLE allowances; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.allowances TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.allowances TO authenticated;
GRANT ALL ON TABLE public.allowances TO service_role;


--
-- Name: TABLE api_idempotency; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.api_idempotency TO service_role;


--
-- Name: TABLE attachments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.attachments TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.attachments TO authenticated;
GRANT ALL ON TABLE public.attachments TO service_role;


--
-- Name: TABLE audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.audit_log TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.audit_log TO authenticated;
GRANT ALL ON TABLE public.audit_log TO service_role;


--
-- Name: SEQUENCE audit_log_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.audit_log_id_seq TO anon;
GRANT ALL ON SEQUENCE public.audit_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.audit_log_id_seq TO service_role;


--
-- Name: TABLE automation_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.automation_events TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.automation_events TO authenticated;
GRANT ALL ON TABLE public.automation_events TO service_role;


--
-- Name: TABLE automation_runs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.automation_runs TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.automation_runs TO authenticated;
GRANT ALL ON TABLE public.automation_runs TO service_role;


--
-- Name: TABLE automations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.automations TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.automations TO authenticated;
GRANT ALL ON TABLE public.automations TO service_role;


--
-- Name: TABLE backups; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.backups TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.backups TO authenticated;
GRANT ALL ON TABLE public.backups TO service_role;


--
-- Name: TABLE book_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.book_settings TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.book_settings TO authenticated;
GRANT ALL ON TABLE public.book_settings TO service_role;


--
-- Name: TABLE books; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.books TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.books TO authenticated;
GRANT ALL ON TABLE public.books TO service_role;


--
-- Name: TABLE broadcasts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.broadcasts TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.broadcasts TO authenticated;
GRANT ALL ON TABLE public.broadcasts TO service_role;


--
-- Name: TABLE calendar_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.calendar_events TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.calendar_events TO authenticated;
GRANT ALL ON TABLE public.calendar_events TO service_role;


--
-- Name: TABLE card_payments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.card_payments TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.card_payments TO authenticated;
GRANT ALL ON TABLE public.card_payments TO service_role;


--
-- Name: TABLE card_purchases; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.card_purchases TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.card_purchases TO authenticated;
GRANT ALL ON TABLE public.card_purchases TO service_role;


--
-- Name: TABLE categories; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.categories TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.categories TO authenticated;
GRANT ALL ON TABLE public.categories TO service_role;


--
-- Name: TABLE chat_messages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.chat_messages TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.chat_messages TO authenticated;
GRANT ALL ON TABLE public.chat_messages TO service_role;


--
-- Name: TABLE chat_threads; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.chat_threads TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.chat_threads TO authenticated;
GRANT ALL ON TABLE public.chat_threads TO service_role;


--
-- Name: TABLE consents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.consents TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.consents TO authenticated;
GRANT ALL ON TABLE public.consents TO service_role;


--
-- Name: TABLE contacts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.contacts TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.contacts TO authenticated;
GRANT ALL ON TABLE public.contacts TO service_role;


--
-- Name: TABLE coupons; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.coupons TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.coupons TO authenticated;
GRANT ALL ON TABLE public.coupons TO service_role;


--
-- Name: TABLE credit_cards; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.credit_cards TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.credit_cards TO authenticated;
GRANT ALL ON TABLE public.credit_cards TO service_role;


--
-- Name: TABLE emergency_funds; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.emergency_funds TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.emergency_funds TO authenticated;
GRANT ALL ON TABLE public.emergency_funds TO service_role;


--
-- Name: TABLE entities; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.entities TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.entities TO authenticated;
GRANT ALL ON TABLE public.entities TO service_role;


--
-- Name: TABLE expenses; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.expenses TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.expenses TO authenticated;
GRANT ALL ON TABLE public.expenses TO service_role;


--
-- Name: TABLE extra_incomes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.extra_incomes TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.extra_incomes TO authenticated;
GRANT ALL ON TABLE public.extra_incomes TO service_role;


--
-- Name: TABLE family_members; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.family_members TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.family_members TO authenticated;
GRANT ALL ON TABLE public.family_members TO service_role;


--
-- Name: TABLE feedback; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.feedback TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.feedback TO authenticated;
GRANT ALL ON TABLE public.feedback TO service_role;


--
-- Name: TABLE fixed_expense_payments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.fixed_expense_payments TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.fixed_expense_payments TO authenticated;
GRANT ALL ON TABLE public.fixed_expense_payments TO service_role;


--
-- Name: TABLE fixed_expenses; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.fixed_expenses TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.fixed_expenses TO authenticated;
GRANT ALL ON TABLE public.fixed_expenses TO service_role;


--
-- Name: TABLE fund_movements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.fund_movements TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.fund_movements TO authenticated;
GRANT ALL ON TABLE public.fund_movements TO service_role;


--
-- Name: TABLE gami_badges; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.gami_badges TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.gami_badges TO authenticated;
GRANT ALL ON TABLE public.gami_badges TO service_role;


--
-- Name: TABLE gami_missions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.gami_missions TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.gami_missions TO authenticated;
GRANT ALL ON TABLE public.gami_missions TO service_role;


--
-- Name: TABLE gami_points_ledger; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.gami_points_ledger TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.gami_points_ledger TO authenticated;
GRANT ALL ON TABLE public.gami_points_ledger TO service_role;


--
-- Name: TABLE gami_state; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.gami_state TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.gami_state TO authenticated;
GRANT ALL ON TABLE public.gami_state TO service_role;


--
-- Name: TABLE gami_visits; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.gami_visits TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.gami_visits TO authenticated;
GRANT ALL ON TABLE public.gami_visits TO service_role;


--
-- Name: TABLE goal_movements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.goal_movements TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.goal_movements TO authenticated;
GRANT ALL ON TABLE public.goal_movements TO service_role;


--
-- Name: TABLE goals; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.goals TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.goals TO authenticated;
GRANT ALL ON TABLE public.goals TO service_role;


--
-- Name: TABLE google_connections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.google_connections TO service_role;


--
-- Name: TABLE google_connections_public; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.google_connections_public TO authenticated;
GRANT ALL ON TABLE public.google_connections_public TO service_role;


--
-- Name: TABLE google_event_map; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.google_event_map TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.google_event_map TO authenticated;
GRANT ALL ON TABLE public.google_event_map TO service_role;


--
-- Name: TABLE household_invitations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.household_invitations TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.household_invitations TO authenticated;
GRANT ALL ON TABLE public.household_invitations TO service_role;


--
-- Name: TABLE household_members; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.household_members TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.household_members TO authenticated;
GRANT ALL ON TABLE public.household_members TO service_role;


--
-- Name: TABLE household_transfers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.household_transfers TO anon;
GRANT SELECT,MAINTAIN ON TABLE public.household_transfers TO authenticated;
GRANT ALL ON TABLE public.household_transfers TO service_role;


--
-- Name: TABLE households; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.households TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.households TO authenticated;
GRANT ALL ON TABLE public.households TO service_role;


--
-- Name: TABLE income_categories; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.income_categories TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.income_categories TO authenticated;
GRANT ALL ON TABLE public.income_categories TO service_role;


--
-- Name: TABLE incomes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.incomes TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.incomes TO authenticated;
GRANT ALL ON TABLE public.incomes TO service_role;


--
-- Name: TABLE integrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.integrations TO service_role;


--
-- Name: TABLE integrations_public; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.integrations_public TO authenticated;
GRANT ALL ON TABLE public.integrations_public TO service_role;


--
-- Name: TABLE investments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.investments TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.investments TO authenticated;
GRANT ALL ON TABLE public.investments TO service_role;


--
-- Name: TABLE keyword_rules; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.keyword_rules TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.keyword_rules TO authenticated;
GRANT ALL ON TABLE public.keyword_rules TO service_role;


--
-- Name: TABLE liabilities; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.liabilities TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.liabilities TO authenticated;
GRANT ALL ON TABLE public.liabilities TO service_role;


--
-- Name: TABLE loan_payments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.loan_payments TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.loan_payments TO authenticated;
GRANT ALL ON TABLE public.loan_payments TO service_role;


--
-- Name: TABLE loans; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.loans TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.loans TO authenticated;
GRANT ALL ON TABLE public.loans TO service_role;


--
-- Name: TABLE monthly_summaries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.monthly_summaries TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.monthly_summaries TO authenticated;
GRANT ALL ON TABLE public.monthly_summaries TO service_role;


--
-- Name: TABLE net_worth_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.net_worth_snapshots TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.net_worth_snapshots TO authenticated;
GRANT ALL ON TABLE public.net_worth_snapshots TO service_role;


--
-- Name: TABLE notification_log; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.notification_log TO authenticated;
GRANT ALL ON TABLE public.notification_log TO service_role;


--
-- Name: SEQUENCE notification_log_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.notification_log_id_seq TO anon;
GRANT ALL ON SEQUENCE public.notification_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.notification_log_id_seq TO service_role;


--
-- Name: TABLE notification_outbox; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_outbox TO service_role;


--
-- Name: TABLE notification_rules; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.notification_rules TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.notification_rules TO authenticated;
GRANT ALL ON TABLE public.notification_rules TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.notifications TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE payment_methods; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.payment_methods TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.payment_methods TO authenticated;
GRANT ALL ON TABLE public.payment_methods TO service_role;


--
-- Name: TABLE plan_payments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.plan_payments TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.plan_payments TO authenticated;
GRANT ALL ON TABLE public.plan_payments TO service_role;


--
-- Name: TABLE plan_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.plan_subscriptions TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.plan_subscriptions TO authenticated;
GRANT ALL ON TABLE public.plan_subscriptions TO service_role;


--
-- Name: TABLE plans; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.plans TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.plans TO authenticated;
GRANT ALL ON TABLE public.plans TO service_role;


--
-- Name: TABLE platform_admins; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.platform_admins TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.platform_admins TO authenticated;
GRANT ALL ON TABLE public.platform_admins TO service_role;


--
-- Name: TABLE platform_integrations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.platform_integrations TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.platform_integrations TO authenticated;
GRANT ALL ON TABLE public.platform_integrations TO service_role;


--
-- Name: TABLE platform_integrations_public; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.platform_integrations_public TO authenticated;
GRANT ALL ON TABLE public.platform_integrations_public TO service_role;


--
-- Name: TABLE platform_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.platform_settings TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.platform_settings TO authenticated;
GRANT ALL ON TABLE public.platform_settings TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.profiles TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE providers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.providers TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.providers TO authenticated;
GRANT ALL ON TABLE public.providers TO service_role;


--
-- Name: TABLE push_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.push_subscriptions TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;


--
-- Name: TABLE rate_limits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rate_limits TO service_role;


--
-- Name: TABLE ref_fiscal_templates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ref_fiscal_templates TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ref_fiscal_templates TO authenticated;
GRANT ALL ON TABLE public.ref_fiscal_templates TO service_role;


--
-- Name: TABLE ref_holidays; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ref_holidays TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ref_holidays TO authenticated;
GRANT ALL ON TABLE public.ref_holidays TO service_role;


--
-- Name: TABLE ref_municipalities; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ref_municipalities TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ref_municipalities TO authenticated;
GRANT ALL ON TABLE public.ref_municipalities TO service_role;


--
-- Name: TABLE ref_rates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ref_rates TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ref_rates TO authenticated;
GRANT ALL ON TABLE public.ref_rates TO service_role;


--
-- Name: TABLE ref_renta_calendar; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ref_renta_calendar TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ref_renta_calendar TO authenticated;
GRANT ALL ON TABLE public.ref_renta_calendar TO service_role;


--
-- Name: TABLE ref_renta_regimenes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ref_renta_regimenes TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ref_renta_regimenes TO authenticated;
GRANT ALL ON TABLE public.ref_renta_regimenes TO service_role;


--
-- Name: TABLE ref_smmlv; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ref_smmlv TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ref_smmlv TO authenticated;
GRANT ALL ON TABLE public.ref_smmlv TO service_role;


--
-- Name: TABLE ref_trm; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ref_trm TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ref_trm TO authenticated;
GRANT ALL ON TABLE public.ref_trm TO service_role;


--
-- Name: TABLE ref_usury_rate; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ref_usury_rate TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ref_usury_rate TO authenticated;
GRANT ALL ON TABLE public.ref_usury_rate TO service_role;


--
-- Name: TABLE ref_uvt; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ref_uvt TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.ref_uvt TO authenticated;
GRANT ALL ON TABLE public.ref_uvt TO service_role;


--
-- Name: TABLE referral_codes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.referral_codes TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.referral_codes TO authenticated;
GRANT ALL ON TABLE public.referral_codes TO service_role;


--
-- Name: TABLE referrals; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.referrals TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.referrals TO authenticated;
GRANT ALL ON TABLE public.referrals TO service_role;


--
-- Name: TABLE savings_challenges; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.savings_challenges TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.savings_challenges TO authenticated;
GRANT ALL ON TABLE public.savings_challenges TO service_role;


--
-- Name: TABLE shared_group_expenses; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.shared_group_expenses TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.shared_group_expenses TO authenticated;
GRANT ALL ON TABLE public.shared_group_expenses TO service_role;


--
-- Name: TABLE shared_groups; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.shared_groups TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.shared_groups TO authenticated;
GRANT ALL ON TABLE public.shared_groups TO service_role;


--
-- Name: TABLE subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.subscriptions TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.subscriptions TO authenticated;
GRANT ALL ON TABLE public.subscriptions TO service_role;


--
-- Name: TABLE tax_assets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.tax_assets TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.tax_assets TO authenticated;
GRANT ALL ON TABLE public.tax_assets TO service_role;


--
-- Name: TABLE tax_years; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.tax_years TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.tax_years TO authenticated;
GRANT ALL ON TABLE public.tax_years TO service_role;


--
-- Name: TABLE telegram_links; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.telegram_links TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.telegram_links TO authenticated;
GRANT ALL ON TABLE public.telegram_links TO service_role;


--
-- Name: TABLE user_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.user_preferences TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.user_preferences TO authenticated;
GRANT ALL ON TABLE public.user_preferences TO service_role;


--
-- Name: TABLE wishlist; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.wishlist TO anon;
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE public.wishlist TO authenticated;
GRANT ALL ON TABLE public.wishlist TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--



-- Historia ya incluida en esta línea base.
CREATE TABLE IF NOT EXISTS public._mirai_migrations (name text primary key, applied_at timestamptz not null default now());
INSERT INTO public._mirai_migrations(name) VALUES
  ('20261031000100_core.sql'),
  ('20261031000200_security.sql'),
  ('20261031000300_reference.sql'),
  ('20261031000400_fixes_f1.sql'),
  ('20261031000500_fund.sql'),
  ('20261031000600_cat_src.sql'),
  ('20261031000700_fixed_pay.sql'),
  ('20261031000800_fund_ops.sql'),
  ('20261031000900_calendar.sql'),
  ('20261031001000_notify.sql'),
  ('20261031001100_gami.sql'),
  ('20261031001200_smmlv_fuente.sql'),
  ('20261101000100_perfil.sql'),
  ('20261101000200_perfil_mas.sql'),
  ('20261101000300_opiniones.sql'),
  ('20261101000400_planes.sql'),
  ('20261101000500_mantenimiento.sql'),
  ('20261101000600_anuncios.sql'),
  ('20261101000700_consola_admin.sql'),
  ('20261101000800_registro.sql'),
  ('20261101000900_funciones.sql'),
  ('20261101001000_ads_manager.sql'),
  ('20261102000100_reparto_quincenas.sql'),
  ('20261102000200_ingreso_diario.sql'),
  ('20261102000300_nomina_ajustes.sql'),
  ('20261103000100_notificaciones.sql'),
  ('20261103000200_ia_uso.sql'),
  ('20261103000300_automatizaciones.sql'),
  ('20261103000400_centro_ayuda.sql'),
  ('20261103000500_whatsapp_plantillas.sql'),
  ('20261103000600_chat.sql'),
  ('20261103000700_proveedores.sql'),
  ('20261103000900_hogar_roles.sql'),
  ('20261103001000_fijos_miembro.sql'),
  ('20261103001100_fijos_varios_miembros.sql'),
  ('20261103001300_rendimiento.sql'),
  ('20261103001400_seguridad.sql'),
  ('20261103001500_proveedores_mas.sql'),
  ('20261103001600_cuenta_titularidad.sql'),
  ('20261103001700_fix_provider_links.sql'),
  ('20261103001800_prestamos_unico_fiado.sql'),
  ('20261103001900_deudas_tipos.sql'),
  ('20261103002000_deudas_acreedor_registro.sql'),
  ('20261103002100_prestamos_primera_cuota.sql'),
  ('20261103003100_cuentas_metas.sql'),
  ('20261103003200_avisos.sql'),
  ('20261103003200_enlaces.sql'),
  ('20261103003201_avisos_latido.sql'),
  ('20261103003400_planes_automat.sql'),
  ('20261103003600_deducibles.sql'),
  ('20261103003700_audit_borrado_hogar.sql'),
  ('20261103003701_indices_fk.sql'),
  ('20261103003702_indices_fk_todos.sql'),
  ('20261103003800_api_idempotency.sql'),
  ('20261103003801_api_rollout.sql'),
  ('20261103004100_live_notify.sql')
ON CONFLICT (name) DO NOTHING;

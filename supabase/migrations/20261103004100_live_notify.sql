-- v6 F2-G-4 · Fuente de cambios del gateway de tiempo real (docs/arquitectura/v6-separacion-front-back.md §2.8).
-- ESCRITA, NO APLICADA en la base compartida (pruebas = producción). Aunque se aplique, NO cambia nada: solo crea dos
-- funciones. Los triggers se instalan a mano, y solo en Supabase local o en Cloud SQL (fase 4), con:
--     select public.mirai_live_notify_install(true);   -- instala (idempotente)
--     select public.mirai_live_notify_install(false);  -- los quita
-- Mientras la base siga en Supabase, el navegador usa Supabase Realtime (publicación supabase_realtime).
--
-- Cada fila insertada, cambiada o borrada en las tablas en vivo manda por `pg_notify('mirai_live', …)` una carga mínima
-- `{"t": tabla, "op": INSERT|UPDATE|DELETE, "id", "b": book_id, "h": household_id, "u": user_id}` (sin montos ni
-- textos; muy por debajo del tope de 8 000 bytes). El gateway (apps/api, MODE=realtime, REALTIME_PG_LISTEN=1) escucha
-- `LISTEN mirai_live` en una sola instancia (candado consultivo) y lo reparte a las salas por el adaptador de Redis.
-- La lista de tablas = NOTIFY_TABLES de packages/contracts/src/modules/realtime.ts (LIVE_TABLES + HOUSEHOLD_TABLES +
-- notifications + automation_events). La prueba apps/api/src/modules/realtime/migration.test.ts revisa que coincidan.

create or replace function public.mirai_live_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

comment on function public.mirai_live_notify() is
  'v6 F2-G: avisa por pg_notify(mirai_live) qué fila cambió (tabla, operación, id, libro, hogar, persona). Sin montos.';

-- Instala (enable = true) o quita (false) los triggers. Devuelve cuántas tablas tocó; omite las que no existan.
create or replace function public.mirai_live_notify_install(enable boolean default true)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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

comment on function public.mirai_live_notify_install(boolean) is
  'v6 F2-G: instala o quita los triggers mirai_live_notify. Solo Supabase local o Cloud SQL (fase 4), nunca la base compartida.';

revoke execute on function public.mirai_live_notify() from public, anon, authenticated;
revoke execute on function public.mirai_live_notify_install(boolean) from public, anon, authenticated;

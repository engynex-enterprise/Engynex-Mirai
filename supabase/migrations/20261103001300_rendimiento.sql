-- ───────────────────────── Rendimiento (Mirai 5.5) ─────────────────────────
-- Aditiva e idempotente: solo índices nuevos y una función de lectura. No cambia datos, políticas ni el
-- comportamiento de la versión publicada (pruebas y producción comparten esta base).
--
-- Medido antes (EXPLAIN ANALYZE):
--   · loans + loan_payments (lo que pide cada pantalla con préstamos): Seq Scan de loan_payments por cada préstamo.
--   · consola › resumen (audit_log de 30 días): Parallel Seq Scan de toda la tabla, ~18 s en frío.
--   · consola › usuario (audit_log por actor): Seq Scan, ~2,7 s.
--   · borrar o fusionar una categoría (FK expenses.category_id): Seq Scan de todos los gastos, ~3 s en frío.
--   · getAppContext (cada página y cada Server Action): 4 viajes en serie a la base.

-- 1) Hijos que se traen "embebidos" con su padre (PostgREST hace un join por la llave foránea).
create index if not exists loan_payments_loan_idx on public.loan_payments (loan_id);
create index if not exists card_purchases_card_idx on public.card_purchases (card_id);
-- fixed_payments_uidx es parcial (deleted_at is null) y el embebido no filtra por deleted_at: no la puede usar.
create index if not exists fixed_expense_payments_fixed_idx on public.fixed_expense_payments (fixed_expense_id);

-- 2) Auditoría: consola de administración (por fecha y por persona) y borrado en cascada de un hogar.
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor, created_at desc) where actor is not null;
create index if not exists audit_log_household_idx on public.audit_log (household_id, created_at desc) where household_id is not null;

-- 3) Llaves foráneas sin índice en las tablas grandes. Sin índice, borrar o fusionar el padre (categoría,
--    medio de pago, integrante, gasto fijo, contacto…) recorre la tabla hija completa, y filtrar por ellas también.
create index if not exists expenses_category_idx on public.expenses (category_id) where category_id is not null;
create index if not exists expenses_fixed_idx on public.expenses (fixed_expense_id) where fixed_expense_id is not null;
create index if not exists expenses_member_idx on public.expenses (member_id) where member_id is not null;
create index if not exists expenses_payment_method_idx on public.expenses (payment_method_id) where payment_method_id is not null;
create index if not exists loan_payments_expense_idx on public.loan_payments (expense_id) where expense_id is not null;
create index if not exists loans_contact_idx on public.loans (contact_id) where contact_id is not null;
create index if not exists loans_entity_idx on public.loans (entity_id) where entity_id is not null;
create index if not exists fixed_expenses_category_idx on public.fixed_expenses (category_id) where category_id is not null;
create index if not exists keyword_rules_category_idx on public.keyword_rules (category_id) where category_id is not null;
create index if not exists providers_category_idx on public.providers (category_id) where category_id is not null;
create index if not exists incomes_category_idx on public.incomes (category_id) where category_id is not null;
create index if not exists family_members_user_idx on public.family_members (user_id) where user_id is not null;

-- 4) Tablas por libro o por persona sin índice (avisos de la campana, uso de IA, chat, respaldos, automatizaciones).
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_book_idx on public.notifications (book_id) where book_id is not null;
create index if not exists ai_usage_book_idx on public.ai_usage (book_id) where book_id is not null;
create index if not exists ai_usage_user_idx on public.ai_usage (user_id, created_at desc);
create index if not exists chat_messages_book_idx on public.chat_messages (book_id);
create index if not exists backups_book_idx on public.backups (book_id);
create index if not exists automation_runs_book_idx on public.automation_runs (book_id);

-- 5) Contexto de la app en un solo viaje: perfil, hogares (con su plan), libros y si es administrador.
--    SECURITY INVOKER: corre con el JWT de la persona, así que RLS filtra exactamente lo mismo que las
--    consultas sueltas que reemplaza (lib/dal.ts conserva esas consultas como respaldo).
create or replace function public.mirai_app_context()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
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

revoke all on function public.mirai_app_context() from public, anon;
grant execute on function public.mirai_app_context() to authenticated;

-- Estadísticas frescas para que el planificador use los índices nuevos de inmediato.
analyze public.loan_payments, public.card_purchases, public.fixed_expense_payments, public.audit_log, public.expenses;

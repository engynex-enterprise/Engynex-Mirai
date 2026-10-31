-- Mirai 5.0 · Seguridad (RLS), triggers, auditoría, realtime, alta de usuarios y hogares.

-- ───────────────────────── Tablas de datos por libro ─────────────────────────
-- Todas tienen book_id. Lectura: cualquier miembro del hogar. Escritura: editor o dueño.
do $$
declare t text;
  book_tables text[] := array[
    'categories','income_categories','entities','payment_methods','keyword_rules',
    'incomes','extra_incomes','fixed_expenses','expenses','fixed_expense_payments','subscriptions',
    'credit_cards','card_purchases','contacts','loans','loan_payments','assets','liabilities',
    'investments','goals','fund_movements','calendar_events','shared_groups','shared_group_expenses',
    'allowances','allowance_movements','savings_challenges','tax_years','tax_assets','attachments',
    'accountant_shares','accountant_notes','advisor_consultations','monthly_summaries'
  ];
begin
  foreach t in array book_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "leer %1$s" on public.%1$I', t);
    execute format('create policy "leer %1$s" on public.%1$I for select to authenticated using (public.is_book_member(book_id, ''viewer''))', t);
    execute format('drop policy if exists "crear %1$s" on public.%1$I', t);
    execute format('create policy "crear %1$s" on public.%1$I for insert to authenticated with check (public.is_book_member(book_id, ''editor''))', t);
    execute format('drop policy if exists "editar %1$s" on public.%1$I', t);
    execute format('create policy "editar %1$s" on public.%1$I for update to authenticated using (public.is_book_member(book_id, ''editor'')) with check (public.is_book_member(book_id, ''editor''))', t);
    execute format('drop policy if exists "borrar %1$s" on public.%1$I', t);
    execute format('create policy "borrar %1$s" on public.%1$I for delete to authenticated using (public.is_book_member(book_id, ''editor''))', t);
    execute format('create index if not exists %1$s_book_idx on public.%1$I(book_id)', t);
  end loop;
end $$;

-- Tablas 1:1 por libro (PK = book_id)
do $$
declare t text;
begin
  foreach t in array array['book_settings','emergency_funds','gami_state'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "leer %1$s" on public.%1$I', t);
    execute format('create policy "leer %1$s" on public.%1$I for select to authenticated using (public.is_book_member(book_id, ''viewer''))', t);
    execute format('drop policy if exists "escribir %1$s" on public.%1$I', t);
    execute format('create policy "escribir %1$s" on public.%1$I for all to authenticated using (public.is_book_member(book_id, ''editor'')) with check (public.is_book_member(book_id, ''editor''))', t);
  end loop;
end $$;

-- Chat: cada usuario ve solo sus conversaciones
alter table public.chat_threads enable row level security;
drop policy if exists "chat propio" on public.chat_threads;
create policy "chat propio" on public.chat_threads for all to authenticated
  using (user_id = auth.uid() and public.is_book_member(book_id, 'viewer'))
  with check (user_id = auth.uid() and public.is_book_member(book_id, 'viewer'));
alter table public.chat_messages enable row level security;
drop policy if exists "mensajes propios" on public.chat_messages;
create policy "mensajes propios" on public.chat_messages for all to authenticated
  using (exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = auth.uid()));

-- Gamificación: lectura para miembros; escritura la hace el servidor (o miembros editores)
do $$
declare t text;
begin
  foreach t in array array['gami_points_ledger','gami_badges','gami_missions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "leer %1$s" on public.%1$I', t);
    execute format('create policy "leer %1$s" on public.%1$I for select to authenticated using (public.is_book_member(book_id, ''viewer''))', t);
    execute format('drop policy if exists "escribir %1$s" on public.%1$I', t);
    execute format('create policy "escribir %1$s" on public.%1$I for insert to authenticated with check (public.is_book_member(book_id, ''viewer''))', t);
  end loop;
end $$;
alter table public.gami_visits enable row level security;
drop policy if exists "visitas" on public.gami_visits;
create policy "visitas" on public.gami_visits for all to authenticated
  using (public.is_book_member(book_id, 'viewer')) with check (user_id = auth.uid() and public.is_book_member(book_id, 'viewer'));

-- ───────────────────────── Cuentas y hogares ─────────────────────────
alter table public.profiles enable row level security;
drop policy if exists "perfil propio" on public.profiles;
create policy "perfil propio" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "perfil de compañeros de hogar" on public.profiles;
create policy "perfil de compañeros de hogar" on public.profiles for select to authenticated using (
  exists (select 1 from public.household_members a join public.household_members b on a.household_id = b.household_id
          where a.user_id = auth.uid() and b.user_id = profiles.id)
);

alter table public.consents enable row level security;
drop policy if exists "consentimientos propios" on public.consents;
create policy "consentimientos propios" on public.consents for select to authenticated using (user_id = auth.uid());
drop policy if exists "aceptar" on public.consents;
create policy "aceptar" on public.consents for insert to authenticated with check (user_id = auth.uid());

alter table public.user_preferences enable row level security;
drop policy if exists "preferencias propias" on public.user_preferences;
create policy "preferencias propias" on public.user_preferences for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.households enable row level security;
drop policy if exists "ver hogar" on public.households;
create policy "ver hogar" on public.households for select to authenticated using (public.is_household_member(id, 'viewer'));
drop policy if exists "editar hogar" on public.households;
create policy "editar hogar" on public.households for update to authenticated using (public.is_household_member(id, 'owner'));
drop policy if exists "borrar hogar" on public.households;
create policy "borrar hogar" on public.households for delete to authenticated using (public.is_household_member(id, 'owner'));
-- La creación va por la función create_household()

alter table public.household_members enable row level security;
drop policy if exists "ver miembros" on public.household_members;
create policy "ver miembros" on public.household_members for select to authenticated using (public.is_household_member(household_id, 'viewer'));
drop policy if exists "gestionar miembros" on public.household_members;
create policy "gestionar miembros" on public.household_members for update to authenticated using (public.is_household_member(household_id, 'owner'));
drop policy if exists "quitar miembros" on public.household_members;
create policy "quitar miembros" on public.household_members for delete to authenticated
  using (public.is_household_member(household_id, 'owner') or user_id = auth.uid());

alter table public.household_invitations enable row level security;
drop policy if exists "invitaciones" on public.household_invitations;
create policy "invitaciones" on public.household_invitations for all to authenticated
  using (public.is_household_member(household_id, 'owner')) with check (public.is_household_member(household_id, 'owner'));

alter table public.books enable row level security;
drop policy if exists "ver libros" on public.books;
create policy "ver libros" on public.books for select to authenticated using (public.is_household_member(household_id, 'viewer'));
drop policy if exists "crear libros" on public.books;
create policy "crear libros" on public.books for insert to authenticated with check (public.is_household_member(household_id, 'editor'));
drop policy if exists "editar libros" on public.books;
create policy "editar libros" on public.books for update to authenticated using (public.is_household_member(household_id, 'editor'));
drop policy if exists "borrar libros" on public.books;
create policy "borrar libros" on public.books for delete to authenticated using (public.is_household_member(household_id, 'owner'));

alter table public.family_members enable row level security;
drop policy if exists "ver familia" on public.family_members;
create policy "ver familia" on public.family_members for select to authenticated using (public.is_household_member(household_id, 'viewer'));
drop policy if exists "editar familia" on public.family_members;
create policy "editar familia" on public.family_members for all to authenticated
  using (public.is_household_member(household_id, 'editor')) with check (public.is_household_member(household_id, 'editor'));

-- ───────────────────────── Integraciones y avisos ─────────────────────────
-- Las credenciales cifradas nunca llegan al navegador: el cliente lee la vista integrations_public.
alter table public.integrations enable row level security;
revoke all on public.integrations from anon, authenticated;
create or replace view public.integrations_public with (security_invoker = false) as
  select i.id, i.household_id, i.kind, i.enabled, i.config, i.meta, i.updated_at
  from public.integrations i
  where public.is_household_member(i.household_id, 'viewer');
grant select on public.integrations_public to authenticated;

alter table public.google_connections enable row level security;
revoke all on public.google_connections from anon, authenticated;
create or replace view public.google_connections_public with (security_invoker = false) as
  select user_id, email, scopes, updated_at from public.google_connections where user_id = auth.uid();
grant select on public.google_connections_public to authenticated;

alter table public.notification_rules enable row level security;
drop policy if exists "reglas propias" on public.notification_rules;
create policy "reglas propias" on public.notification_rules for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_book_member(book_id, 'viewer'));

alter table public.notifications enable row level security;
drop policy if exists "avisos propios" on public.notifications;
create policy "avisos propios" on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists "marcar leidos" on public.notifications;
create policy "marcar leidos" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "borrar avisos" on public.notifications;
create policy "borrar avisos" on public.notifications for delete to authenticated using (user_id = auth.uid());

alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from anon, authenticated;

alter table public.push_subscriptions enable row level security;
drop policy if exists "push propio" on public.push_subscriptions;
create policy "push propio" on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.telegram_links enable row level security;
drop policy if exists "telegram propio" on public.telegram_links;
create policy "telegram propio" on public.telegram_links for select to authenticated using (user_id = auth.uid());

alter table public.backups enable row level security;
drop policy if exists "ver respaldos" on public.backups;
create policy "ver respaldos" on public.backups for select to authenticated using (public.is_book_member(book_id, 'viewer'));

alter table public.audit_log enable row level security;
drop policy if exists "ver historial" on public.audit_log;
create policy "ver historial" on public.audit_log for select to authenticated
  using ((book_id is not null and public.is_book_member(book_id, 'viewer')) or (household_id is not null and public.is_household_member(household_id, 'viewer')));

-- Referencia: lectura para cualquier usuario autenticado
do $$
declare t text;
begin
  foreach t in array array['ref_uvt','ref_smmlv','ref_renta_calendar','ref_fiscal_templates','ref_municipalities','ref_holidays','ref_trm','ref_usury_rate','ref_rates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "leer %1$s" on public.%1$I', t);
    execute format('create policy "leer %1$s" on public.%1$I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- ───────────────────────── updated_at ─────────────────────────
do $$
declare r record;
begin
  for r in select c.table_name from information_schema.columns c
           join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
           where c.table_schema = 'public' and c.column_name = 'updated_at'
  loop
    execute format('drop trigger if exists trg_touch on public.%I', r.table_name);
    execute format('create trigger trg_touch before update on public.%I for each row execute function public.touch_updated_at()', r.table_name);
  end loop;
end $$;

-- ───────────────────────── Auditoría ("Ana borró el gasto de la luz") ─────────────────────────
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  prev jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  acc text;
  diff jsonb;
  label text;
begin
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
    case when rec ? 'book_id' then (rec->>'book_id')::uuid end,
    case when rec ? 'household_id' then (rec->>'household_id')::uuid end,
    tg_table_name,
    case when rec ? 'id' and (rec->>'id') ~ '^[0-9a-f-]{36}$' then (rec->>'id')::uuid end,
    acc, auth.uid(), label, diff
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'categories','income_categories','entities','payment_methods','keyword_rules','incomes','extra_incomes',
    'fixed_expenses','expenses','fixed_expense_payments','subscriptions','credit_cards','card_purchases','contacts',
    'loans','loan_payments','assets','liabilities','investments','goals','fund_movements','calendar_events',
    'shared_groups','shared_group_expenses','allowances','allowance_movements','savings_challenges','tax_years',
    'tax_assets','attachments','accountant_shares','family_members','books','book_settings','household_members'
  ] loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- ───────────────────────── Alta de usuarios ─────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, nombre, avatar_url)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'nombre', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  insert into public.user_preferences(user_id) values (new.id) on conflict do nothing;
  -- Aceptación de términos y política (Ley 1581) enviada en el registro
  if (new.raw_user_meta_data->>'acepta_version') is not null then
    insert into public.consents(user_id, document, version)
    values (new.id, 'terminos', new.raw_user_meta_data->>'acepta_version'),
           (new.id, 'privacidad', new.raw_user_meta_data->>'acepta_version');
  end if;
  -- Invitaciones pendientes para este correo
  insert into public.household_members(household_id, user_id, role)
  select i.household_id, new.id, i.role from public.household_invitations i
  where lower(i.email) = lower(new.email) and i.accepted_at is null and i.expires_at > now()
  on conflict do nothing;
  update public.household_invitations set accepted_at = now()
  where lower(email) = lower(new.email) and accepted_at is null and expires_at > now();
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ───────────────────────── Catálogos por defecto de un libro ─────────────────────────
create or replace function public.seed_book_defaults(bk uuid) returns void
language plpgsql security definer set search_path = public as $$
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

create or replace function public.create_household(p_nombre text, p_libro text default 'Hogar')
returns uuid language plpgsql security definer set search_path = public as $$
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

create or replace function public.create_book(p_household uuid, p_nombre text, p_tipo text default 'personal', p_icon text default 'book')
returns uuid language plpgsql security definer set search_path = public as $$
declare bk uuid;
begin
  if not public.is_household_member(p_household, 'editor') then raise exception 'No tienes permiso en este hogar'; end if;
  insert into public.books(household_id, nombre, tipo, icon, created_by) values (p_household, p_nombre, p_tipo, p_icon, auth.uid()) returning id into bk;
  perform public.seed_book_defaults(bk);
  return bk;
end $$;

create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.household_invitations;
begin
  select * into inv from public.household_invitations
  where token_hash = encode(digest(p_token, 'sha256'), 'hex') and accepted_at is null and expires_at > now();
  if not found then raise exception 'La invitación no existe o ya venció'; end if;
  insert into public.household_members(household_id, user_id, role) values (inv.household_id, auth.uid(), inv.role)
  on conflict (household_id, user_id) do update set role = excluded.role;
  update public.household_invitations set accepted_at = now() where id = inv.id;
  return inv.household_id;
end $$;

revoke execute on function public.seed_book_defaults(uuid) from anon, authenticated, public;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.create_book(uuid, text, text, text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;

-- ───────────────────────── Realtime ─────────────────────────
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'books','book_settings','family_members','categories','income_categories','entities','payment_methods','keyword_rules',
    'incomes','extra_incomes','fixed_expenses','expenses','fixed_expense_payments','subscriptions','credit_cards','card_purchases',
    'contacts','loans','loan_payments','assets','liabilities','investments','goals','emergency_funds','fund_movements',
    'calendar_events','shared_groups','shared_group_expenses','allowances','allowance_movements','savings_challenges',
    'tax_years','tax_assets','attachments','accountant_notes','advisor_consultations','notifications','gami_badges','household_members'
  ] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ───────────────────────── Storage ─────────────────────────
create or replace function public.try_uuid(t text) returns uuid language plpgsql immutable as $$
begin return t::uuid; exception when others then return null; end $$;

insert into storage.buckets(id, name, public, file_size_limit)
values ('attachments','attachments', false, 15728640), ('backups','backups', false, 52428800), ('logos','logos', false, 2097152)
on conflict (id) do nothing;

-- Ruta: {book_id}/… → acceso según membresía del libro
drop policy if exists "adjuntos leer" on storage.objects;
create policy "adjuntos leer" on storage.objects for select to authenticated
  using (bucket_id in ('attachments','logos','backups') and public.is_book_member(public.try_uuid((storage.foldername(name))[1]), 'viewer'));
drop policy if exists "adjuntos subir" on storage.objects;
create policy "adjuntos subir" on storage.objects for insert to authenticated
  with check (bucket_id in ('attachments','logos') and public.is_book_member(public.try_uuid((storage.foldername(name))[1]), 'editor'));
drop policy if exists "adjuntos editar" on storage.objects;
create policy "adjuntos editar" on storage.objects for update to authenticated
  using (bucket_id in ('attachments','logos') and public.is_book_member(public.try_uuid((storage.foldername(name))[1]), 'editor'));
drop policy if exists "adjuntos borrar" on storage.objects;
create policy "adjuntos borrar" on storage.objects for delete to authenticated
  using (bucket_id in ('attachments','logos') and public.is_book_member(public.try_uuid((storage.foldername(name))[1]), 'editor'));

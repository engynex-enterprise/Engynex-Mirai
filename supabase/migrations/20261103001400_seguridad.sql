-- ───────────────────────── Seguridad (Mirai 5.5) ─────────────────────────
-- Aditiva e idempotente. Pruebas y producción comparten esta base: nada de esto cambia lo que la versión publicada
-- hace desde el navegador (se revisó que no escribe directo en las tablas que aquí se restringen).
--
--  1. Privilegios que la API no usa: TRUNCATE, TRIGGER y REFERENCES fuera de anon/authenticated (TRUNCATE no pasa por RLS).
--  2. Funciones SECURITY DEFINER: sin EXECUTE para anon (salvo invitation_info y registro_abierto, que usan las
--     páginas sin sesión). member_access solo responde a integrantes del hogar.
--  3. Vistas *_public: anon ya no las lee (solo las usa la app con sesión).
--  4. Portal del contador: crear, cambiar o borrar accesos exige "Administra" (como la Server Action); las notas solo
--     se pueden escribir como titular y sobre un acceso del mismo libro.
--  5. Respaldos (Ley 1581): la lista y los archivos solo los ven Dueño y Administra.
--  6. gami_visits: cada persona solo ve y borra sus visitas.
--  7. profiles.email: no se puede cambiar desde el navegador (lo usa Mirai para enviar avisos).
--  8. Storage: tipos de archivo permitidos en adjuntos, logos y respaldos (sin HTML ni SVG).
--  9. Límite de tasa compartido (tabla rate_limits + rate_limit_hit, solo service_role).

-- 1) Privilegios ────────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f') loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t.relname);
  end loop;
end $$;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;

-- 2) Funciones ──────────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  -- Solo con sesión (ninguna página sin sesión las usa).
  foreach f in array array[
    'public.accept_invitation(text)', 'public.ad_reach(date,date)', 'public.ai_creditos_desde(uuid,timestamptz)',
    'public.ai_usage_rollup(date,uuid)', 'public.create_book(uuid,text,text,text)', 'public.create_household(text,text)',
    'public.is_book_member(uuid,text)', 'public.is_household_member(uuid,text)',
    'public.fund_save(uuid,numeric,date,text)', 'public.fund_use(uuid,text,numeric,date,uuid)',
    'public.pay_fixed_expense(uuid,text,date,numeric,uuid,text)', 'public.unpay_fixed_expense(uuid)',
    'public.use_emergency_fund(uuid,numeric)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated, service_role', f);
    end if;
  end loop;
  -- Sin uso en la app: solo el servidor.
  if to_regprocedure('public.book_household(uuid)') is not null then
    revoke execute on function public.book_household(uuid) from public, anon, authenticated;
    grant execute on function public.book_household(uuid) to service_role;
  end if;
end $$;

-- Rol de una persona en un hogar: solo para integrantes de ese hogar (antes cualquiera con sesión podía preguntar
-- por cualquier hogar y persona). Las funciones que la usan (set_member_access, remove_household_member,
-- transfer_household, link_family_member) siempre la llaman con la sesión de un integrante.
create or replace function public.member_access(p_household uuid, p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(m.access_role, m.role) from public.household_members m
  where m.household_id = p_household and m.user_id = p_user
    and (auth.role() = 'service_role' or p_user = auth.uid()
         or exists (select 1 from public.household_members me where me.household_id = p_household and me.user_id = auth.uid()))
$$;
revoke execute on function public.member_access(uuid, uuid) from public, anon;
grant execute on function public.member_access(uuid, uuid) to authenticated, service_role;

-- 3) Vistas que esconden secretos: solo con sesión ───────────────────────────────────────────────────────────────
do $$
declare v text;
begin
  foreach v in array array['public.integrations_public', 'public.platform_integrations_public', 'public.google_connections_public'] loop
    if to_regclass(v) is not null then execute format('revoke all on %s from anon', v); end if;
  end loop;
end $$;

-- 4) Portal del contador ────────────────────────────────────────────────────────────────────────────────────────
drop policy if exists "crear accountant_shares" on public.accountant_shares;
create policy "crear accountant_shares" on public.accountant_shares for insert to authenticated
  with check (public.is_book_member(book_id, 'admin'));
drop policy if exists "editar accountant_shares" on public.accountant_shares;
create policy "editar accountant_shares" on public.accountant_shares for update to authenticated
  using (public.is_book_member(book_id, 'admin')) with check (public.is_book_member(book_id, 'admin'));
drop policy if exists "borrar accountant_shares" on public.accountant_shares;
create policy "borrar accountant_shares" on public.accountant_shares for delete to authenticated
  using (public.is_book_member(book_id, 'admin'));

drop policy if exists "crear accountant_notes" on public.accountant_notes;
create policy "crear accountant_notes" on public.accountant_notes for insert to authenticated
  with check (public.is_book_member(book_id, 'editor') and autor = 'titular'
    and exists (select 1 from public.accountant_shares s where s.id = share_id and s.book_id = accountant_notes.book_id));
drop policy if exists "editar accountant_notes" on public.accountant_notes;
create policy "editar accountant_notes" on public.accountant_notes for update to authenticated
  using (public.is_book_member(book_id, 'editor') and autor = 'titular')
  with check (public.is_book_member(book_id, 'editor') and autor = 'titular'
    and exists (select 1 from public.accountant_shares s where s.id = share_id and s.book_id = accountant_notes.book_id));

-- 5) Respaldos: Dueño y Administra ──────────────────────────────────────────────────────────────────────────────
drop policy if exists "ver respaldos" on public.backups;
create policy "ver respaldos" on public.backups for select to authenticated using (public.is_book_member(book_id, 'admin'));

drop policy if exists "adjuntos leer" on storage.objects;
create policy "adjuntos leer" on storage.objects for select to authenticated
  using (bucket_id = any (array['attachments', 'logos']) and public.is_book_member(public.try_uuid((storage.foldername(name))[1]), 'viewer'));
drop policy if exists "respaldos leer" on storage.objects;
create policy "respaldos leer" on storage.objects for select to authenticated
  using (bucket_id = 'backups' and public.is_book_member(public.try_uuid((storage.foldername(name))[1]), 'admin'));

-- 6) Visitas (racha): solo las propias ─────────────────────────────────────────────────────────────────────────
drop policy if exists "visitas" on public.gami_visits;
create policy "visitas" on public.gami_visits for all to authenticated
  using (user_id = auth.uid() and public.is_book_member(book_id, 'viewer'))
  with check (user_id = auth.uid() and public.is_book_member(book_id, 'viewer'));

-- 7) El correo del perfil sale de la cuenta (auth.users), no del navegador ─────────────────────────────────────────
create or replace function public.profiles_lock_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    new.email := coalesce((select u.email from auth.users u where u.id = new.id), old.email);
  end if;
  return new;
end $$;
revoke execute on function public.profiles_lock_email() from public, anon, authenticated;
drop trigger if exists trg_profiles_lock_email on public.profiles;
create trigger trg_profiles_lock_email before update of email on public.profiles
  for each row execute function public.profiles_lock_email();

-- 8) Storage: tipos de archivo ──────────────────────────────────────────────────────────────────────────────────
update storage.buckets set allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif']
  where id = 'attachments';
update storage.buckets set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
  where id = 'logos';
update storage.buckets set allowed_mime_types = array['application/json']
  where id = 'backups';

-- 9) Límite de tasa ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security; -- sin políticas: solo service_role
revoke all on public.rate_limits from anon, authenticated;

-- Ventana fija alineada al reloj (igual que lib/security/rate-limit-core.ts). Devuelve si el intento cabe.
create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_s integer)
returns table (ok boolean, remaining integer, reset_ms bigint)
language plpgsql security definer set search_path = public as $$
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
revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

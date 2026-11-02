-- Mirai 5.5 · Hogar: roles con nombres simples, invitaciones por correo o celular sin duplicados y vínculo con
-- los integrantes sin cuenta. Aditiva e idempotente: pruebas y producción comparten la base.
--
-- Roles (household_members.access_role):
--   owner    "Dueño del hogar"      todo, incluso borrar el hogar y el plan
--   admin    "Administra"           todo menos borrar o pasar el hogar y cambiar el plan; invita personas
--   editor   "Colabora"             registra y edita movimientos, presupuestos y metas
--   registra "Registra sus gastos"  solo agrega y edita SUS gastos e ingresos (created_by = él); ve todo
--   viewer   "Solo mira"            ve todo, no cambia nada
-- Compatibilidad con la versión publicada (solo conoce owner/editor/viewer): la columna `role` sigue existiendo con el
-- nivel equivalente (admin → editor, registra → viewer) y un trigger la sincroniza con access_role en los dos sentidos.
-- is_household_member/is_book_member comparan con access_role, así que la RLS aplica el rol real a las dos versiones.
-- Pendiente (documentado): "Ve solo lo suyo" (leer solo lo asignado a su integrante) exige cambiar la lectura de las
-- ~40 tablas por libro; no se implementa en esta migración.

-- ───────────────────────── Rangos y nivel equivalente ─────────────────────────
create or replace function public.role_rank(r text) returns int
language sql immutable as $$
  select case r when 'owner' then 50 when 'admin' then 40 when 'editor' then 30 when 'registra' then 20 when 'viewer' then 10 else 0 end
$$;

create or replace function public.legacy_role(r text) returns text
language sql immutable as $$
  select case r when 'owner' then 'owner' when 'admin' then 'editor' when 'editor' then 'editor' else 'viewer' end
$$;

-- ───────────────────────── Miembros: rol fino ─────────────────────────
alter table public.household_members add column if not exists access_role text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'household_members_access_role_check') then
    alter table public.household_members add constraint household_members_access_role_check
      check (access_role in ('owner','admin','editor','registra','viewer'));
  end if;
end $$;
update public.household_members set access_role = role where access_role is null;

create or replace function public.sync_member_access() returns trigger
language plpgsql as $$
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
drop trigger if exists trg_member_access on public.household_members;
create trigger trg_member_access before insert or update on public.household_members
  for each row execute function public.sync_member_access();

-- Autorización con el rol fino (filas sin access_role usan role).
create or replace function public.is_household_member(hh uuid, min_role text default 'viewer')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hh and m.user_id = auth.uid()
      and public.role_rank(coalesce(m.access_role, m.role)) >= public.role_rank(min_role)
  )
$$;

create or replace function public.is_book_member(bk uuid, min_role text default 'viewer')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.books b
    join public.household_members m on m.household_id = b.household_id
    where b.id = bk and m.user_id = auth.uid()
      and public.role_rank(coalesce(m.access_role, m.role)) >= public.role_rank(min_role)
  )
$$;

-- "Registra sus gastos": escribe solo sus propias filas de gastos e ingresos (políticas permisivas que se suman a
-- las de editor; editor y superiores también cumplen 'registra').
do $$
declare t text;
begin
  foreach t in array array['expenses','incomes','extra_incomes'] loop
    execute format('drop policy if exists "propios crear %1$s" on public.%1$I', t);
    execute format('create policy "propios crear %1$s" on public.%1$I for insert to authenticated with check (created_by = auth.uid() and public.is_book_member(book_id, ''registra''))', t);
    execute format('drop policy if exists "propios editar %1$s" on public.%1$I', t);
    execute format('create policy "propios editar %1$s" on public.%1$I for update to authenticated using (created_by = auth.uid() and public.is_book_member(book_id, ''registra'')) with check (created_by = auth.uid() and public.is_book_member(book_id, ''registra''))', t);
    execute format('drop policy if exists "propios borrar %1$s" on public.%1$I', t);
    execute format('create policy "propios borrar %1$s" on public.%1$I for delete to authenticated using (created_by = auth.uid() and public.is_book_member(book_id, ''registra''))', t);
  end loop;
end $$;

-- ───────────────────────── Invitaciones: correo o celular ─────────────────────────
-- Destino normalizado (la misma regla de lib/household/invites.ts): correo en minúsculas o 'tel:' + dígitos.
create or replace function public.invitation_dest_key(p_email text, p_phone text) returns text
language sql immutable as $$
  select case when nullif(btrim(coalesce(p_phone, '')), '') is not null
    then 'tel:' || regexp_replace(p_phone, '\D', '', 'g')
    else 'email:' || lower(btrim(coalesce(p_email, ''))) end
$$;

alter table public.household_invitations alter column email drop not null;
alter table public.household_invitations add column if not exists phone text;
alter table public.household_invitations add column if not exists access_role text;
alter table public.household_invitations add column if not exists nombre text;
alter table public.household_invitations add column if not exists parentesco text;
alter table public.household_invitations add column if not exists family_member_id uuid references public.family_members(id) on delete set null;
alter table public.household_invitations add column if not exists token_enc text;           -- token cifrado (AES-GCM) para copiar y reenviar el enlace
alter table public.household_invitations add column if not exists canceled_at timestamptz;
alter table public.household_invitations add column if not exists canceled_by uuid references auth.users(id) on delete set null;
alter table public.household_invitations add column if not exists accepted_by uuid references auth.users(id) on delete set null;
alter table public.household_invitations add column if not exists last_sent_at timestamptz;
alter table public.household_invitations add column if not exists sends_day date;
alter table public.household_invitations add column if not exists sends_today int not null default 0;
alter table public.household_invitations add column if not exists sent_count int not null default 0;
alter table public.household_invitations add column if not exists last_result jsonb not null default '{}';
alter table public.household_invitations add column if not exists dest_key text
  generated always as (public.invitation_dest_key(email, phone)) stored;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'household_invitations_access_role_check') then
    alter table public.household_invitations add constraint household_invitations_access_role_check
      check (access_role in ('admin','editor','registra','viewer'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'household_invitations_dest_check') then
    alter table public.household_invitations add constraint household_invitations_dest_check
      check (nullif(btrim(coalesce(email, '')), '') is not null or nullif(btrim(coalesce(phone, '')), '') is not null);
  end if;
end $$;
update public.household_invitations set access_role = role where access_role is null;

create or replace function public.sync_invitation_access() returns trigger
language plpgsql as $$
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
drop trigger if exists trg_invitation_access on public.household_invitations;
create trigger trg_invitation_access before insert or update on public.household_invitations
  for each row execute function public.sync_invitation_access();

-- Limpieza de duplicados ya existentes: por hogar y destino se deja la invitación pendiente más reciente y se
-- cancelan las demás (no se borra nada). También se cancelan las pendientes de quien ya es miembro del hogar.
with ranked as (
  select id, row_number() over (partition by household_id, dest_key order by created_at desc, id desc) as rn
  from public.household_invitations
  where accepted_at is null and canceled_at is null
)
update public.household_invitations i
set canceled_at = now(), expires_at = least(i.expires_at, now()), last_result = i.last_result || '{"cancelada":"duplicada"}'
from ranked r where r.id = i.id and r.rn > 1;

update public.household_invitations i
set canceled_at = now(), expires_at = least(i.expires_at, now()), last_result = i.last_result || '{"cancelada":"ya_miembro"}'
where i.accepted_at is null and i.canceled_at is null and i.email is not null
  and exists (select 1 from public.household_members m join public.profiles p on p.id = m.user_id
              where m.household_id = i.household_id and lower(p.email) = lower(btrim(i.email)));

-- Sin duplicados desde ahora: una sola invitación pendiente por hogar y destino, y una por integrante.
create unique index if not exists household_invitations_pending_dest_uq
  on public.household_invitations (household_id, dest_key) where accepted_at is null and canceled_at is null;
create unique index if not exists household_invitations_pending_member_uq
  on public.household_invitations (family_member_id) where accepted_at is null and canceled_at is null and family_member_id is not null;
create index if not exists household_invitations_household_idx on public.household_invitations (household_id, created_at desc);

-- La versión publicada crea una invitación nueva cada vez: en vez de fallar por el índice, la nueva reemplaza a la
-- pendiente anterior del mismo destino (que queda cancelada). La versión nueva ofrece reenviar antes de llegar aquí.
create or replace function public.invitation_replace_pending() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.household_invitations
  set canceled_at = now(), expires_at = least(expires_at, now()), last_result = last_result || '{"cancelada":"reemplazada"}'
  where household_id = new.household_id and accepted_at is null and canceled_at is null
    and dest_key = public.invitation_dest_key(new.email, new.phone);
  return new;
end $$;
drop trigger if exists trg_invitation_replace on public.household_invitations;
create trigger trg_invitation_replace before insert on public.household_invitations
  for each row execute function public.invitation_replace_pending();

-- Administra (admin) también gestiona invitaciones con su sesión.
drop policy if exists "invitaciones" on public.household_invitations;
create policy "invitaciones" on public.household_invitations for all to authenticated
  using (public.is_household_member(household_id, 'admin')) with check (public.is_household_member(household_id, 'admin'));

-- ───────────────────────── Aceptar: sin filas repetidas ─────────────────────────
-- Une a la persona al hogar (si no estaba) y la vincula al integrante de la invitación o, si no tiene integrante,
-- crea uno con el nombre de la invitación. Nunca cambia el rol de quien ya era miembro. Devuelve 'joined' o 'already'.
create or replace function public.join_from_invitation(p_inv uuid, p_uid uuid) returns text
language plpgsql security definer set search_path = public as $$
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
revoke execute on function public.join_from_invitation(uuid, uuid) from anon, authenticated, public;

create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
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
grant execute on function public.accept_invitation(text) to authenticated;

-- Datos para la página /invitacion/<token> (sin sesión): quién invita, a qué hogar, el rol y el estado.
create or replace function public.invitation_info(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
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
grant execute on function public.invitation_info(text) to anon, authenticated;

-- Alta de usuarios: igual que la versión anterior, pero las invitaciones pendientes de su correo se aceptan con
-- join_from_invitation (rol fino, vínculo con el integrante y sin repetir) y se ignoran las canceladas.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
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

-- ───────────────────────── Roles: cambiar, sacar y pasar el hogar ─────────────────────────
-- Se llaman con la sesión de la persona (auth.uid()), así la auditoría registra quién hizo el cambio.
create or replace function public.member_access(p_household uuid, p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(access_role, role) from public.household_members where household_id = p_household and user_id = p_user
$$;

create or replace function public.set_member_access(p_household uuid, p_user uuid, p_access text) returns void
language plpgsql security definer set search_path = public as $$
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

create or replace function public.remove_household_member(p_household uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
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

create or replace function public.transfer_household(p_household uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.member_access(p_household, auth.uid()) is distinct from 'owner' then raise exception 'Solo el dueño puede pasar el hogar a otra persona.'; end if;
  if p_user = auth.uid() then raise exception 'Ya eres el dueño del hogar.'; end if;
  if public.member_access(p_household, p_user) is null then raise exception 'Esa persona no hace parte del hogar.'; end if;
  update public.household_members set access_role = 'owner' where household_id = p_household and user_id = p_user;
  update public.household_members set access_role = 'admin' where household_id = p_household and user_id = auth.uid();
end $$;

-- Vincula a una persona con cuenta con un integrante sin cuenta que ya existía (la misma persona, sin duplicar).
create or replace function public.link_family_member(p_household uuid, p_user uuid, p_family uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_household_member(p_household, 'admin') then raise exception 'Tu rol no permite cambiar las personas del hogar.'; end if;
  if public.member_access(p_household, p_user) is null then raise exception 'Esa persona no hace parte del hogar.'; end if;
  if exists (select 1 from public.family_members where household_id = p_household and user_id = p_user and deleted_at is null and id <> p_family) then
    raise exception 'Esa persona ya está vinculada con otro integrante.';
  end if;
  update public.family_members set user_id = p_user where id = p_family and household_id = p_household and deleted_at is null and (user_id is null or user_id = p_user);
  if not found then raise exception 'Ese integrante ya tiene una cuenta vinculada.'; end if;
end $$;

revoke execute on function public.set_member_access(uuid, uuid, text) from anon, public;
revoke execute on function public.remove_household_member(uuid, uuid) from anon, public;
revoke execute on function public.transfer_household(uuid, uuid) from anon, public;
revoke execute on function public.link_family_member(uuid, uuid, uuid) from anon, public;
revoke execute on function public.member_access(uuid, uuid) from anon, public;
grant execute on function public.set_member_access(uuid, uuid, text) to authenticated;
grant execute on function public.remove_household_member(uuid, uuid) to authenticated;
grant execute on function public.transfer_household(uuid, uuid) to authenticated;
grant execute on function public.link_family_member(uuid, uuid, uuid) to authenticated;
grant execute on function public.member_access(uuid, uuid) to authenticated;

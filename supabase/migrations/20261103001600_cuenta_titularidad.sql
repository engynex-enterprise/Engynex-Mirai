-- Mirai 5.5 · Tu cuenta y titularidad del hogar. Aditiva e idempotente: pruebas y producción comparten la base y
-- la versión publicada sigue funcionando igual (transfer_household conserva su firma y su resultado).
--
--  1. profiles.email sigue al correo de la cuenta (auth.users) cuando se confirma un cambio de correo.
--  2. Actividad de seguridad (account_events): inicios de sesión, cambios de correo y contraseña, formas de entrar
--     conectadas o quitadas. La llenan triggers en auth.users/auth.identities (sin fallar nunca el inicio de sesión)
--     y las Server Actions de Tu cuenta (con la clave secreta).
--  3. Funciones de la propia cuenta (siempre auth.uid(), nunca otra persona): my_account, cancel_my_email_change,
--     ensure_email_identity, remove_my_password, my_sessions, revoke_my_session.
--  4. Pasar el hogar con aceptación: household_transfers (pendiente 7 días), request/respond/cancel y el aviso en la
--     campana. transfer_household (directa, la usa la versión publicada) hace lo mismo con "Administra".

-- 1 y 2) Actividad de seguridad y correo del perfil ─────────────────────────────────────────────────────────────
create table if not exists public.account_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,          -- inicio, correo_cambiado, correo_solicitado, correo_cancelado, contrasena, metodo_conectado,
                               -- metodo_quitado, sesiones_cerradas, sesion_cerrada, hogar_pasado, hogar_recibido, hogar_salida, hogar_borrado
  detail jsonb not null default '{}',
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists account_events_user_idx on public.account_events (user_id, created_at desc);
alter table public.account_events enable row level security;
drop policy if exists "mi actividad" on public.account_events;
create policy "mi actividad" on public.account_events for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.account_events from anon, authenticated;

-- Registra un evento sin que un error aquí bloquee jamás el inicio de sesión o el cambio en Auth.
create or replace function public.log_account_event(p_user uuid, p_kind text, p_detail jsonb default '{}') returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.account_events (user_id, kind, detail) values (p_user, p_kind, coalesce(p_detail, '{}'));
  if random() < 0.01 then delete from public.account_events where created_at < now() - interval '400 days'; end if;
exception when others then null;
end $$;
revoke execute on function public.log_account_event(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.on_auth_user_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.email is distinct from old.email then
      update public.profiles set email = new.email where id = new.id;
      perform public.log_account_event(new.id, 'correo_cambiado', jsonb_build_object('antes', old.email, 'despues', new.email));
    end if;
    if new.encrypted_password is distinct from old.encrypted_password then
      perform public.log_account_event(new.id, 'contrasena', jsonb_build_object('accion',
        case when coalesce(new.encrypted_password, '') = '' then 'quitada' when coalesce(old.encrypted_password, '') = '' then 'creada' else 'cambiada' end));
    end if;
    if new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null then
      perform public.log_account_event(new.id, 'inicio', '{}');
    end if;
  exception when others then null;
  end;
  return new;
end $$;
revoke execute on function public.on_auth_user_change() from public, anon, authenticated;
drop trigger if exists on_auth_user_change on auth.users;
create trigger on_auth_user_change after update of email, encrypted_password, last_sign_in_at on auth.users
  for each row execute function public.on_auth_user_change();

create or replace function public.on_auth_identity_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record := coalesce(new, old);
begin
  begin
    perform public.log_account_event(r.user_id, case when tg_op = 'INSERT' then 'metodo_conectado' else 'metodo_quitado' end,
      jsonb_build_object('provider', r.provider, 'email', r.identity_data->>'email'));
  exception when others then null;
  end;
  return null;
end $$;
revoke execute on function public.on_auth_identity_change() from public, anon, authenticated;
drop trigger if exists on_auth_identity_change on auth.identities;
create trigger on_auth_identity_change after insert or delete on auth.identities
  for each row execute function public.on_auth_identity_change();

-- Perfiles con un correo distinto al de la cuenta (cambios confirmados antes de este trigger).
update public.profiles p set email = u.email
from auth.users u where u.id = p.id and u.email is not null and p.email is distinct from u.email;

-- 3) Funciones de la propia cuenta ──────────────────────────────────────────────────────────────────────────────
-- Estado de la cuenta para "Tu cuenta": correo, cambio pendiente, si tiene contraseña y las formas de entrar.
create or replace function public.my_account() returns jsonb
language sql stable security definer set search_path = public as $$
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

-- Cancela un cambio de correo pendiente (los enlaces que llegaron dejan de servir).
create or replace function public.cancel_my_email_change() returns boolean
language plpgsql security definer set search_path = public as $$
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

-- Quien entró con Google y creó una contraseña no tiene la forma "correo" en Auth: se crea (como la crea Supabase al
-- registrarse con correo) para que pueda quitar Google sin quedarse sin forma de entrar.
create or replace function public.ensure_email_identity() returns boolean
language plpgsql security definer set search_path = public as $$
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

-- Quita la contraseña solo si queda otra forma de entrar (una cuenta de Google conectada).
create or replace function public.remove_my_password() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Debes iniciar sesión.'; end if;
  if not exists (select 1 from auth.identities where user_id = uid and provider <> 'email') then
    raise exception 'Tu contraseña es tu única forma de entrar. Conecta Google antes de quitarla.';
  end if;
  update auth.users set encrypted_password = null where id = uid;
end $$;

-- Sesiones abiertas (dispositivos) de la persona. `actual` marca la de este navegador.
create or replace function public.my_sessions()
returns table (id uuid, created_at timestamptz, last_active timestamptz, user_agent text, ip text, aal text, actual boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.created_at,
         greatest(s.created_at, s.updated_at, (s.refreshed_at at time zone 'UTC')) as last_active,
         s.user_agent, host(s.ip), s.aal::text, s.id::text = coalesce(auth.jwt()->>'session_id', '')
  from auth.sessions s
  where s.user_id = auth.uid() and (s.not_after is null or s.not_after > now())
  order by 3 desc nulls last
  limit 30
$$;

-- Cierra una sesión de otro dispositivo (la actual se cierra con "Cerrar sesión").
create or replace function public.revoke_my_session(p_session uuid) returns boolean
language plpgsql security definer set search_path = public as $$
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

do $$
declare f text;
begin
  foreach f in array array['public.my_account()', 'public.cancel_my_email_change()', 'public.ensure_email_identity()',
    'public.remove_my_password()', 'public.my_sessions()', 'public.revoke_my_session(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- 4) Pasar el hogar con aceptación ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.household_transfers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  from_role text not null default 'admin' check (from_role in ('admin', 'editor', 'registra', 'viewer')),
  plan_action text not null default 'seguir' check (plan_action in ('seguir', 'cancelar')),
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'rechazada', 'cancelada', 'vencida')),
  expires_at timestamptz not null default now() + interval '7 days',
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists household_transfers_pending_uq on public.household_transfers (household_id) where status = 'pendiente';
create index if not exists household_transfers_to_idx on public.household_transfers (to_user, status);
alter table public.household_transfers enable row level security;
drop policy if exists "ver traspasos" on public.household_transfers;
create policy "ver traspasos" on public.household_transfers for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid() or public.is_household_member(household_id, 'admin'));
revoke insert, update, delete, truncate, trigger, references on public.household_transfers from anon, authenticated;
drop trigger if exists trg_touch on public.household_transfers;
create trigger trg_touch before update on public.household_transfers for each row execute function public.touch_updated_at();
drop trigger if exists trg_audit on public.household_transfers;
create trigger trg_audit after insert or update or delete on public.household_transfers for each row execute function public.audit_row();

create or replace function public.person_label(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(p.apodo), ''), nullif(split_part(btrim(p.nombre), ' ', 1), ''), split_part(p.email, '@', 1), 'Alguien')
  from public.profiles p where p.id = p_user
$$;
revoke execute on function public.person_label(uuid) from public, anon, authenticated;

-- Hace el cambio de dueño (uso interno). Nada más cambia de dueño: el plan, la suscripción, los libros, las
-- integraciones y el portal del contador son del HOGAR (household_id/book_id) y siguen igual; desde ahora el plan
-- lo cambia o lo paga el dueño nuevo.
create or replace function public.apply_household_transfer(p_household uuid, p_from uuid, p_to uuid, p_from_role text) returns void
language plpgsql security definer set search_path = public as $$
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
revoke execute on function public.apply_household_transfer(uuid, uuid, uuid, text) from public, anon, authenticated;

-- Directa (la usa la versión publicada): igual que antes, quien pasa el hogar queda como Administra.
create or replace function public.transfer_household(p_household uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.member_access(p_household, auth.uid()) is distinct from 'owner' then raise exception 'Solo el dueño puede pasar el hogar a otra persona.'; end if;
  if p_user = auth.uid() then raise exception 'Ya eres el dueño del hogar.'; end if;
  if public.member_access(p_household, p_user) is null then raise exception 'Esa persona no hace parte del hogar.'; end if;
  perform public.apply_household_transfer(p_household, auth.uid(), p_user, 'admin');
end $$;

-- Pide pasarle el hogar a otra persona con cuenta del hogar. Confirmación: el nombre del hogar escrito.
create or replace function public.request_household_transfer(p_household uuid, p_user uuid, p_from_role text, p_plan_action text, p_confirm text)
returns uuid language plpgsql security definer set search_path = public as $$
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

-- Acepta o rechaza (solo quien recibe). Devuelve el resultado sin lanzar en los casos esperados (venció, ya no aplica).
create or replace function public.respond_household_transfer(p_transfer uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
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

-- Cancela una solicitud pendiente (el dueño que la pidió o el dueño actual).
create or replace function public.cancel_household_transfer(p_transfer uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t public.household_transfers;
begin
  select * into t from public.household_transfers where id = p_transfer;
  if not found or not (t.from_user = uid or public.member_access(t.household_id, uid) = 'owner') then raise exception 'Esa solicitud no existe.'; end if;
  if t.status <> 'pendiente' then return; end if;
  update public.household_transfers set status = 'cancelada', resolved_at = now(), resolved_by = uid where id = t.id;
  delete from public.notifications where user_id = t.to_user and dedupe = 'transfer:' || t.id and read_at is null;
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.request_household_transfer(uuid,uuid,text,text,text)', 'public.respond_household_transfer(uuid,boolean)',
    'public.cancel_household_transfer(uuid)', 'public.transfer_household(uuid,uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- Perfil: apodo, fecha de nacimiento, portada, avatar de cada integrante y fotos de perfil propias.
-- profiles.avatar_url acepta una URL (foto de Google o subida) o "mirai:<clave>" (avatar ilustrado de Mirai).

alter table public.profiles add column if not exists apodo text not null default '';
alter table public.profiles add column if not exists nacimiento date;
alter table public.profiles add column if not exists portada text not null default '';
alter table public.family_members add column if not exists avatar text not null default '';

-- La foto de Google llega como avatar_url o picture según el flujo; se toma la que exista.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
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
  insert into public.household_members(household_id, user_id, role)
  select i.household_id, new.id, i.role from public.household_invitations i
  where lower(i.email) = lower(new.email) and i.accepted_at is null and i.expires_at > now()
  on conflict do nothing;
  update public.household_invitations set accepted_at = now()
  where lower(email) = lower(new.email) and accepted_at is null and expires_at > now();
  return new;
end $$;

-- Quien ya entró con Google y no tiene foto: se toma la de su cuenta de Google.
update public.profiles p
set avatar_url = coalesce(i.identity_data->>'avatar_url', i.identity_data->>'picture')
from auth.identities i
where i.user_id = p.id and i.provider = 'google'
  and coalesce(p.avatar_url, '') = ''
  and coalesce(i.identity_data->>'avatar_url', i.identity_data->>'picture') is not null;

-- Fotos de perfil: bucket público (la ruta lleva un nombre aleatorio) y cada quien escribe solo en su carpeta {user_id}/…
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do nothing;

drop policy if exists "avatar subir" on storage.objects;
create policy "avatar subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar editar" on storage.objects;
create policy "avatar editar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar borrar" on storage.objects;
create policy "avatar borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

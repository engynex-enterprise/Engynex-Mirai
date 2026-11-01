-- Opiniones: calificaciones, errores, ideas de funciones y sugerencias de los usuarios hacia la plataforma.
-- Cada persona ve las suyas (con estado y respuesta); los administradores de la plataforma ven y responden todas.

-- Administradores de la plataforma (no de un hogar). Se agregan a mano:
--   insert into public.platform_admins(user_id) select id from auth.users where email = 'tu@correo';
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
drop policy if exists "saber si soy admin" on public.platform_admins;
create policy "saber si soy admin" on public.platform_admins for select to authenticated using (user_id = auth.uid());

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  tipo text not null check (tipo in ('calificacion', 'error', 'funcion', 'sugerencia', 'pregunta', 'otro')),
  rating smallint check (rating between 1 and 5),
  mensaje text not null default '' check (length(mensaje) <= 4000),
  pagina text,
  contexto jsonb not null default '{}',
  captura text,                                   -- ruta en el bucket privado "feedback"
  estado text not null default 'nuevo' check (estado in ('nuevo', 'revisando', 'planeado', 'hecho', 'descartado')),
  respuesta text check (length(respuesta) <= 4000),
  respondido_at timestamptz,
  respondido_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feedback_calificacion_con_nota check (tipo <> 'calificacion' or rating is not null),
  constraint feedback_mensaje_minimo check (tipo = 'calificacion' or length(btrim(mensaje)) >= 3)
);
create index if not exists feedback_user_idx on public.feedback (user_id, created_at desc);
create index if not exists feedback_estado_idx on public.feedback (estado, created_at desc);

alter table public.feedback enable row level security;
drop policy if exists "enviar opinion" on public.feedback;
create policy "enviar opinion" on public.feedback for insert to authenticated
  with check (user_id = auth.uid() and estado = 'nuevo' and respuesta is null and respondido_at is null and respondido_por is null
    and (household_id is null or public.is_household_member(household_id, 'viewer')));
drop policy if exists "ver opiniones" on public.feedback;
create policy "ver opiniones" on public.feedback for select to authenticated using (user_id = auth.uid() or public.is_platform_admin());
drop policy if exists "responder opiniones" on public.feedback;
create policy "responder opiniones" on public.feedback for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists "borrar opinion" on public.feedback;
create policy "borrar opinion" on public.feedback for delete to authenticated using ((user_id = auth.uid() and estado = 'nuevo') or public.is_platform_admin());

-- Al responder o cambiar el estado: fecha, quién respondió y aviso a la persona.
create or replace function public.feedback_on_update() returns trigger
language plpgsql security definer set search_path = public as $$
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
drop trigger if exists feedback_on_update on public.feedback;
create trigger feedback_on_update before update on public.feedback for each row execute function public.feedback_on_update();

-- Al llegar una opinión nueva: aviso en la app a cada administrador.
create or replace function public.feedback_on_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  quien text := coalesce((select nullif(nombre, '') from public.profiles where id = new.user_id), 'Alguien');
  que text := case new.tipo when 'calificacion' then 'calificó Mirai con ' || new.rating || ' de 5' when 'error' then 'reportó un error'
    when 'funcion' then 'pidió una función' when 'sugerencia' then 'dejó una sugerencia' when 'pregunta' then 'hizo una pregunta' else 'dejó un comentario' end;
begin
  insert into public.notifications (user_id, kind, titulo, cuerpo, href, dedupe)
  select a.user_id, 'opinion', quien || ' ' || que, left(coalesce(nullif(btrim(new.mensaje), ''), 'Sin comentario.'), 200), '/admin/opiniones', 'fb-new-' || new.id
  from public.platform_admins a where a.user_id <> new.user_id
  on conflict (user_id, dedupe) do nothing;
  return new;
end $$;
drop trigger if exists feedback_on_insert on public.feedback;
create trigger feedback_on_insert after insert on public.feedback for each row execute function public.feedback_on_insert();

-- Capturas de pantalla adjuntas (privadas): cada persona sube a su carpeta; las ve ella y los administradores.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback', 'feedback', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
drop policy if exists "captura subir" on storage.objects;
create policy "captura subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "captura ver" on storage.objects;
create policy "captura ver" on storage.objects for select to authenticated
  using (bucket_id = 'feedback' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin()));
drop policy if exists "captura borrar" on storage.objects;
create policy "captura borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'feedback' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin()));

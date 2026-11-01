-- Anuncios propios del plan gratis (los crea el administrador en /admin) y su conteo diario de vistas y clics.
-- El conteo es agregado por anuncio, día y ubicación: no guarda quién vio o tocó el anuncio.

create table if not exists public.ads (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(titulo) between 2 and 80),
  texto text not null default '' check (length(texto) <= 220),
  imagen text,                                       -- URL pública (bucket "ads")
  url text not null check (url ~ '^https://'),
  cta text not null default 'Conocer más' check (length(cta) <= 30),
  anunciante text not null default '' check (length(anunciante) <= 60),
  ubicaciones text[] not null default '{inicio}' check (ubicaciones <@ array['inicio', 'lista', 'reportes']::text[]),
  desde date,
  hasta date,
  prioridad int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ads enable row level security;
drop policy if exists "ver anuncios vigentes" on public.ads;
create policy "ver anuncios vigentes" on public.ads for select to authenticated
  using ((activo and (desde is null or desde <= current_date) and (hasta is null or hasta >= current_date)) or public.is_platform_admin());
drop policy if exists "admin anuncios" on public.ads;
create policy "admin anuncios" on public.ads for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
drop trigger if exists ads_touch on public.ads;
create trigger ads_touch before update on public.ads for each row execute function public.touch_updated_at();

create table if not exists public.ad_events (
  ad_id uuid not null references public.ads(id) on delete cascade,
  dia date not null default current_date,
  slot text not null,
  vistas int not null default 0,
  clics int not null default 0,
  primary key (ad_id, dia, slot)
);
alter table public.ad_events enable row level security;
drop policy if exists "admin metricas anuncios" on public.ad_events;
create policy "admin metricas anuncios" on public.ad_events for select to authenticated using (public.is_platform_admin());

-- Suma una vista o un clic (lo llama el navegador; no se puede leer ni borrar nada con esto).
create or replace function public.ad_track(p_ad uuid, p_slot text, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('vista', 'clic') or p_slot not in ('inicio', 'lista', 'reportes') then return; end if;
  if not exists (select 1 from public.ads where id = p_ad and activo) then return; end if;
  insert into public.ad_events (ad_id, dia, slot, vistas, clics)
  values (p_ad, current_date, p_slot, (p_kind = 'vista')::int, (p_kind = 'clic')::int)
  on conflict (ad_id, dia, slot) do update set vistas = ad_events.vistas + excluded.vistas, clics = ad_events.clics + excluded.clics;
end $$;
revoke all on function public.ad_track(uuid, text, text) from public, anon;
grant execute on function public.ad_track(uuid, text, text) to authenticated;

-- Imágenes de los anuncios (públicas; solo los administradores suben).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ads', 'ads', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
drop policy if exists "anuncio subir" on storage.objects;
create policy "anuncio subir" on storage.objects for insert to authenticated with check (bucket_id = 'ads' and public.is_platform_admin());
drop policy if exists "anuncio borrar" on storage.objects;
create policy "anuncio borrar" on storage.objects for delete to authenticated using (bucket_id = 'ads' and public.is_platform_admin());

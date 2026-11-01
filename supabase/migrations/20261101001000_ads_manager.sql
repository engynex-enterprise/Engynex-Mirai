-- Sistema de anuncios al estilo del Administrador de anuncios de Meta: campañas, formatos, ubicaciones nuevas,
-- alcance y frecuencia por persona, cierres y mezcla con AdSense. Aditiva.

create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(nombre) between 2 and 80),
  anunciante text not null default '' check (length(anunciante) <= 80),
  objetivo text not null default 'trafico' check (objetivo in ('reconocimiento', 'trafico', 'conversion')),
  estado text not null default 'borrador' check (estado in ('borrador', 'activa', 'pausada', 'terminada')),
  desde date,
  hasta date,
  modelo_cobro text not null default 'cpm' check (modelo_cobro in ('cpm', 'cpc', 'fijo')),
  tarifa numeric(14,2) not null default 0 check (tarifa >= 0),   -- por mil impresiones, por clic o total
  presupuesto numeric(14,2),                                     -- tope informativo para el anunciante
  planes text[] not null default '{}',                           -- vacío = todos los planes que muestran anuncios
  dispositivos text[] not null default '{movil,escritorio}' check (dispositivos <@ array['movil', 'escritorio']::text[]),
  frecuencia_max integer not null default 3 check (frecuencia_max between 1 and 50),  -- veces por persona al día
  prioridad integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ad_campaigns enable row level security;
drop policy if exists "ver campañas activas" on public.ad_campaigns;
create policy "ver campañas activas" on public.ad_campaigns for select to authenticated using (estado = 'activa' or public.is_platform_admin());
drop policy if exists "admin campañas" on public.ad_campaigns;
create policy "admin campañas" on public.ad_campaigns for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
drop trigger if exists ad_campaigns_touch on public.ad_campaigns;
create trigger ad_campaigns_touch before update on public.ad_campaigns for each row execute function public.touch_updated_at();

alter table public.ads add column if not exists campaign_id uuid references public.ad_campaigns(id) on delete cascade;
alter table public.ads add column if not exists formato text not null default 'imagen' check (formato in ('imagen', 'carrusel', 'video', 'historia', 'texto', 'modal'));
alter table public.ads add column if not exists media jsonb not null default '{}';  -- {video, poster, color, items:[{imagen,titulo,url}]}
alter table public.ads drop constraint if exists ads_ubicaciones_check;
alter table public.ads add constraint ads_ubicaciones_check check (ubicaciones <@ array['inicio', 'historia', 'consejero', 'lista', 'reportes', 'ticker', 'modal', 'accion']::text[]);
alter table public.ads drop constraint if exists ads_url_check;
alter table public.ads add constraint ads_url_check check (url ~ '^(https://|/)');

alter table public.ad_events add column if not exists cierres int not null default 0;

-- Vistas y clics por persona y día: para el alcance (personas únicas) y para no mostrar un anuncio más veces de las
-- permitidas. Cada persona solo ve sus propias filas; los anunciantes nunca ven datos personales.
create table if not exists public.ad_user_daily (
  ad_id uuid not null references public.ads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dia date not null default current_date,
  vistas int not null default 0,
  clics int not null default 0,
  cierres int not null default 0,
  primary key (ad_id, user_id, dia)
);
alter table public.ad_user_daily enable row level security;
drop policy if exists "mis vistas de anuncios" on public.ad_user_daily;
create policy "mis vistas de anuncios" on public.ad_user_daily for select to authenticated using (user_id = auth.uid() or public.is_platform_admin());

create or replace function public.ad_track(p_ad uuid, p_slot text, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
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

-- Alcance (personas únicas) por anuncio en un rango de días (solo administradores).
create or replace function public.ad_reach(p_desde date, p_hasta date)
returns table (ad_id uuid, alcance bigint, vistas bigint, clics bigint)
language sql stable security definer set search_path = public as $$
  select d.ad_id, count(distinct d.user_id) filter (where d.vistas > 0), sum(d.vistas), sum(d.clics)
  from public.ad_user_daily d where d.dia between p_desde and p_hasta and public.is_platform_admin()
  group by d.ad_id
$$;
grant execute on function public.ad_reach(date, date) to authenticated;

alter table public.platform_settings add column if not exists anuncios_adsense_pct integer not null default 30 check (anuncios_adsense_pct between 0 and 100);
alter table public.platform_settings add column if not exists anuncios_accion_cada integer not null default 3 check (anuncios_accion_cada between 1 and 50);
alter table public.platform_settings add column if not exists anuncios_modal_horas integer not null default 24 check (anuncios_modal_horas between 1 and 720);
alter table public.platform_settings add column if not exists anuncios_ticker boolean not null default true;

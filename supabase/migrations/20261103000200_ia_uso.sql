-- Uso de la inteligencia artificial: registro de cada llamada (tokens, costo, caché, algoritmo), caché de respuestas,
-- cupo mensual de créditos por plan y ajustes de precios desde la consola. Aditiva e idempotente: la versión publicada
-- no lee nada de esto, así que su comportamiento no cambia al migrar (pruebas y producción comparten la base).
-- 1 crédito = platform_settings.ia_credito_usd dólares (por defecto US$ 0,001). Solo gastan créditos las llamadas
-- pagadas por Mirai (proveedor de la plataforma); con la clave propia del hogar se registran pero no descuentan.

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  household_id uuid references public.households(id) on delete cascade,
  book_id uuid references public.books(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  plan text,                                         -- plan del hogar cuando se hizo la llamada
  feature text not null,                             -- chat, categorizar, factura, resumen_mes… (lib/ai/features.ts)
  fuente text not null default 'ia' check (fuente in ('ia', 'cache', 'algoritmo')),
  provider text,                                     -- ai_gateway, ai_gemini…
  model text,
  de_plataforma boolean not null default false,      -- true = lo paga Mirai (descuenta créditos)
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cached_tokens integer not null default 0,          -- tokens de entrada leídos de la caché del proveedor
  tokens_evitados integer not null default 0,        -- estimado de tokens que no se gastaron (caché o algoritmo)
  costo_usd numeric(12,6) not null default 0,
  costo_cop numeric(14,2),
  costo_real boolean not null default false,         -- true = el proveedor informó el costo; false = estimado con la tabla de precios
  creditos numeric(12,3) not null default 0,
  duracion_ms integer not null default 0,
  ok boolean not null default true,
  error text
);
create index if not exists ai_usage_household_idx on public.ai_usage (household_id, created_at desc);
create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);
alter table public.ai_usage enable row level security;
drop policy if exists "ver uso de ia del hogar" on public.ai_usage;
create policy "ver uso de ia del hogar" on public.ai_usage for select to authenticated
  using (public.is_household_member(household_id, 'viewer') or public.is_platform_admin());
-- Solo el servidor (clave de servicio) escribe: no hay políticas de insert/update/delete.

-- Caché de respuestas idénticas (hash de la entrada → resultado) con vencimiento. Solo el servidor la usa.
create table if not exists public.ai_cache (
  key text primary key,                              -- sha256(feature | hogar | entrada normalizada)
  household_id uuid references public.households(id) on delete cascade,
  feature text not null,
  result jsonb not null,
  tokens integer not null default 0,                 -- tokens que costó la respuesta original (para medir el ahorro)
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists ai_cache_expires_idx on public.ai_cache (expires_at);
alter table public.ai_cache enable row level security;

-- Cupo mensual de créditos por plan (null = sin límite).
alter table public.plans add column if not exists ia_creditos integer check (ia_creditos is null or ia_creditos >= 0);
update public.plans set ia_creditos = 1000 where id = 'premium' and ia_creditos is null;
update public.plans set ia_creditos = 100 where id = 'gratis' and ia_creditos is null;

-- Ajustes de la plataforma para la IA.
alter table public.platform_settings add column if not exists ia_credito_usd numeric(10,6) not null default 0.001 check (ia_credito_usd > 0);
alter table public.platform_settings add column if not exists ia_cupos_activo boolean not null default true;   -- bloquear al llegar al 100 %
alter table public.platform_settings add column if not exists ia_aviso_pct integer not null default 80 check (ia_aviso_pct between 1 and 100);
alter table public.platform_settings add column if not exists ia_cache_horas integer not null default 24 check (ia_cache_horas between 0 and 720);
alter table public.platform_settings add column if not exists ia_precios jsonb not null default '{}';            -- {"modelo": {"in": 0.3, "out": 2.5, "cached": 0.075}} USD por millón

-- Créditos usados por un hogar desde una fecha (para el cupo del mes).
create or replace function public.ai_creditos_desde(h uuid, desde timestamptz)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(creditos), 0) from public.ai_usage
  where household_id = h and created_at >= desde
    and (public.is_household_member(h, 'viewer') or public.is_platform_admin() or auth.role() = 'service_role')
$$;
grant execute on function public.ai_creditos_desde(uuid, timestamptz) to authenticated, service_role;

-- Uso agrupado por día (Colombia), función, modelo, fuente y plan. Sin hogar = toda la plataforma (solo administradores).
create or replace function public.ai_usage_rollup(p_desde date, p_household uuid default null)
returns table (dia date, household_id uuid, plan text, feature text, fuente text, provider text, model text, de_plataforma boolean, ok boolean,
  llamadas bigint, input_tokens bigint, output_tokens bigint, cached_tokens bigint, tokens_evitados bigint, costo_usd numeric, costo_cop numeric, creditos numeric, duracion_ms bigint)
language sql stable security definer set search_path = public as $$
  select (u.created_at at time zone 'America/Bogota')::date, u.household_id, u.plan, u.feature, u.fuente, u.provider, u.model, u.de_plataforma, u.ok,
    count(*), sum(u.input_tokens), sum(u.output_tokens), sum(u.cached_tokens), sum(u.tokens_evitados), sum(u.costo_usd), sum(coalesce(u.costo_cop, 0)), sum(u.creditos), sum(u.duracion_ms)
  from public.ai_usage u
  where u.created_at >= (p_desde::timestamp at time zone 'America/Bogota')
    and (case when p_household is null then public.is_platform_admin() or auth.role() = 'service_role'
              else u.household_id = p_household and (public.is_household_member(p_household, 'viewer') or public.is_platform_admin() or auth.role() = 'service_role') end)
  group by 1, 2, 3, 4, 5, 6, 7, 8, 9
$$;
grant execute on function public.ai_usage_rollup(date, uuid) to authenticated, service_role;

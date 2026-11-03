-- v6 F2-B-6 · Idempotencia de la API (docs/arquitectura/v6-separacion-front-back.md §2.7.6).
-- Aditiva: tabla nueva que solo usa apps/api (IDEMPOTENCY_STORE=supabase) con la clave secreta. La versión publicada
-- no la conoce. Sin políticas RLS = ni anon ni authenticated pueden leerla o escribirla; solo service_role.
-- Guarda la respuesta de un comando POST 24 h por (persona, ruta, Idempotency-Key): si la llave se repite con el mismo
-- cuerpo devuelve la misma respuesta; si llega mientras la primera sigue en curso (status null), la API responde 409.
create table if not exists public.api_idempotency (
  key text primary key,                         -- <user_id>|<MÉTODO> <ruta>|<Idempotency-Key>
  user_id uuid,                                 -- null en trabajos del sistema (Scheduler, Cloud Tasks)
  route text not null,
  fingerprint text not null,                    -- sha256 del método, la ruta y el cuerpo
  status integer,                               -- null mientras está en curso
  response jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

alter table public.api_idempotency enable row level security;
revoke all on public.api_idempotency from anon, authenticated;
create index if not exists api_idempotency_expires_idx on public.api_idempotency (expires_at);
create index if not exists api_idempotency_user_idx on public.api_idempotency (user_id);

comment on table public.api_idempotency is 'v6: respuestas guardadas de comandos de la API por Idempotency-Key (24 h). Solo service_role.';

-- Limpieza: la API borra las vencidas al reusarlas; esta función sirve para un cron diario (F2-E).
create or replace function public.api_idempotency_cleanup()
returns integer language sql security definer set search_path = public as $$
  with d as (delete from public.api_idempotency where expires_at < now() - interval '1 hour' returning 1)
  select count(*)::integer from d
$$;
revoke execute on function public.api_idempotency_cleanup() from public, anon, authenticated;
grant execute on function public.api_idempotency_cleanup() to service_role;

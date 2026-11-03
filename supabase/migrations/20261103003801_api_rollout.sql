-- v6 F2-B-8 · Interruptores de la migración a la API (docs/arquitectura/v6-separacion-front-back.md §4.1).
-- Aditiva: columna nueva con valor por defecto vacío = todos los módulos "off" (la web sigue exactamente como hoy).
-- Forma (esquema ApiRollout de packages/contracts/src/rollout.ts):
--   { "_users": ["<uuid QA>", …], "me": "qa", "catalogs": "on", … }   con "off" | "qa" | "on" por módulo.
alter table public.platform_settings add column if not exists api_rollout jsonb not null default '{}'::jsonb;

comment on column public.platform_settings.api_rollout is
  'v6: por módulo de la API, "off" (como hoy), "qa" (solo las personas de _users) u "on". Vacío = todo off.';

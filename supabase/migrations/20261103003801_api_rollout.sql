-- v6 F2-B-8 · Interruptores de la migración a la API (docs/arquitectura/v6-separacion-front-back.md §4.1).
-- Aditiva: columna nueva con valor por defecto vacío = todos los módulos "off" (la web sigue exactamente como hoy).
-- Forma (esquema ApiRollout de packages/contracts/src/rollout.ts):
--   { "_users": ["<uuid QA>", …], "me": "qa", "snapshot": "pct:10", "book-tables:expenses": "off", … }
--   con "off" | "qa" | "admins" | "pct:N" | "on" por módulo (o módulo:detalle) y "_off": true = apagado de emergencia.
--   Lo lee la web solo si MIRAI_API_ROLLOUT=db (docs/arquitectura/v6-f2h-encendido.md).
alter table public.platform_settings add column if not exists api_rollout jsonb not null default '{}'::jsonb;

comment on column public.platform_settings.api_rollout is
  'v6: por módulo de la API, "off" (como hoy), "qa" (solo _users), "admins", "pct:N" u "on"; "_off": true apaga todo. Vacío = todo off.';

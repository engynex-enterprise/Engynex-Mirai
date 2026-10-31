-- Mirai: tablas del servidor. Pégalo en Supabase › SQL Editor › New query › Run.
-- Solo el servidor (service_role) lee y escribe; el navegador nunca toca estas tablas.

create table if not exists public.mirai_integrations (
  kind        text primary key,                 -- email | whatsapp | ai_anthropic | ai_openai | ai_gemini
  config      jsonb not null default '{}',      -- datos no secretos (proveedor, remitente, host…)
  secrets_enc text,                             -- claves cifradas con AES-256-GCM (ENCRYPTION_KEY)
  meta        jsonb not null default '{}',      -- claves enmascaradas (••••1234) para mostrar en Mirai
  updated_at  timestamptz not null default now()
);

create table if not exists public.mirai_alert_snapshots (
  device     text primary key,                  -- id del navegador / dispositivo
  data       jsonb not null default '{}',       -- avisos pendientes, canales, hora, zona horaria
  last_sent  text,                              -- última fecha enviada (YYYY-MM-DD)
  updated_at timestamptz not null default now()
);

alter table public.mirai_integrations    enable row level security;
alter table public.mirai_alert_snapshots enable row level security;
-- Sin políticas = nadie con la clave anon puede leer ni escribir. La service_role las ignora.
revoke all on public.mirai_integrations, public.mirai_alert_snapshots from anon, authenticated;

-- Accesos para tu contador (v2.1). La información va cifrada en el navegador:
-- la llave viaja solo en el enlace (#k=…) y el servidor nunca la conoce.
create table if not exists public.mirai_shares (
  id          text primary key,
  label       text,                              -- nombre del contador
  email       text,
  perms       text not null default 'renta',     -- renta | todo
  expires_at  timestamptz,
  revoked     boolean not null default false,
  verifier    text,                              -- hash para permitir notas del contador
  blob        text,                              -- datos cifrados (AES-256-GCM)
  notes       jsonb not null default '[]',       -- notas cifradas del contador
  views       int not null default 0,
  last_access timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.mirai_shares enable row level security;
revoke all on public.mirai_shares from anon, authenticated;

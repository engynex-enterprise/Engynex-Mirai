-- Notificaciones: registro de envíos (correo, WhatsApp, Telegram, push) e integraciones de mensajería solo del administrador.
-- Aditiva e idempotente: pruebas y producción comparten la base.

-- ── Registro de envíos ──────────────────────────────────────────────────────────────────────────────────────────
-- Una fila por intento de envío (resumen, prueba, invitación…). Sin el contenido del mensaje: solo canal, estado,
-- destino enmascarado y el error legible. Lo lee el administrador en la consola (consola › Registro de envíos).
create table if not exists public.notification_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  household_id uuid references public.households (id) on delete set null,
  channel text not null check (channel in ('email', 'whatsapp', 'telegram', 'push')),
  kind text not null default 'resumen',            -- resumen | prueba | prueba_admin | invitacion | contador
  status text not null check (status in ('enviado', 'fallido')),
  provider text,                                    -- email_resend, whatsapp…
  source text,                                      -- plataforma | hogar
  destino text,                                     -- enmascarado: al•••@gmail.com, +57 315 ••• 4567
  ref text,                                         -- id del mensaje en el proveedor (wamid…)
  error text
);
create index if not exists notification_log_created_idx on public.notification_log (created_at desc);
create index if not exists notification_log_user_idx on public.notification_log (user_id, created_at desc);
alter table public.notification_log enable row level security;
revoke all on public.notification_log from anon;
drop policy if exists "admin lee envios" on public.notification_log;
create policy "admin lee envios" on public.notification_log for select to authenticated using (public.is_platform_admin());

-- ── Credenciales de mensajería: del hogar del administrador a la plataforma ──────────────────────────────────────
-- Desde la v5.5 los hogares solo configuran la IA. Si el administrador de la plataforma ya tenía configurados correo,
-- WhatsApp, Telegram u otros servicios con claves en su propio hogar, se copian a platform_integrations en modo
-- "apagada" (no cambia nada en la versión publicada; el administrador las activa en consola › Integraciones globales).
-- Los secretos ya están cifrados con la misma ENCRYPTION_KEY: se copian tal cual. No se borra ni cambia ninguna fila.
insert into public.platform_integrations (kind, modo, planes, config, meta, secrets_enc, updated_by, updated_at)
select distinct on (i.kind)
  i.kind, 'apagada', '{}', coalesce(i.config, '{}'::jsonb) - 'usa_plataforma',
  coalesce(i.meta, '{}'::jsonb) - 'lastOk' - 'lastMsg' - 'lastTest', i.secrets_enc, i.updated_by, now()
from public.integrations i
join public.household_members m on m.household_id = i.household_id and m.role = 'owner'
join public.platform_admins a on a.user_id = m.user_id
where i.secrets_enc is not null
  and i.kind in ('email_resend', 'email_brevo', 'email_sendgrid', 'email_gmail', 'email_smtp', 'telegram', 'whatsapp', 'coingecko', 'stocks', 'upstash', 'turnstile')
order by i.kind, i.enabled desc, i.updated_at desc nulls last
on conflict (kind) do nothing;

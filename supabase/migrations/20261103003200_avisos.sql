-- Mirai 5.5 · Frente F3: avisos, agenda y calendarios. Aditiva e idempotente (la base la comparte producción).
--  1. notification_log: clave `dedupe` + estado "enviando" para reclamar un envío antes de hacerlo (sin duplicados
--     aunque el cron diario de Vercel y el horario de pg_cron se crucen). La versión publicada no usa ninguna de las dos.
--  2. notify_claim(): reclama un envío de forma atómica (solo la clave del servidor).
--  3. notification_rules.notif: interruptores de cada tipo de aviso POR PERSONA (book_settings.notif queda como valor
--     por defecto del libro).
--  4. google_event_map: eventos que Mirai creó en Google Calendar (para actualizarlos o borrarlos, no duplicarlos).
--  5. platform_settings.cron_horario + mirai_notify_cron_active(): si el cron horario está programado, el resumen
--     sale a la hora que eligió cada persona; si no, en la pasada diaria de las 6 a. m.
--  6. notification_outbox queda sin uso (documentado).

-- 1 ── Registro de envíos con clave de no-duplicado
alter table public.notification_log add column if not exists dedupe text;
alter table public.notification_log add column if not exists book_id uuid;
alter table public.notification_log drop constraint if exists notification_log_status_check;
alter table public.notification_log add constraint notification_log_status_check check (status in ('enviado', 'fallido', 'enviando'));
-- Una sola fila "enviando" o "enviado" por clave: lo que ya salió (o está saliendo) no se vuelve a enviar.
create unique index if not exists notification_log_dedupe_uq on public.notification_log (dedupe) where dedupe is not null and status in ('enviando', 'enviado');
create index if not exists notification_log_dedupe_idx on public.notification_log (dedupe, created_at desc) where dedupe is not null;
comment on column public.notification_log.dedupe is 'Clave de no-duplicado (p. ej. resumen:<usuario>:<libro>:<canal>:<día>). La reclama notify_claim().';

-- 2 ── Reclamar un envío (devuelve el id de la fila "enviando", o null si ya se envió o se está enviando)
create or replace function public.notify_claim(p_dedupe text, p_user uuid, p_household uuid, p_book uuid, p_channel text, p_kind text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint;
begin
  -- Un "enviando" de hace más de 10 minutos quedó interrumpido (se cayó la función): se libera.
  update public.notification_log set status = 'fallido', error = coalesce(error, 'Envío interrumpido')
   where dedupe = p_dedupe and status = 'enviando' and created_at < now() - interval '10 minutes';
  insert into public.notification_log (dedupe, user_id, household_id, book_id, channel, kind, status)
  values (p_dedupe, p_user, p_household, p_book, p_channel, p_kind, 'enviando')
  on conflict (dedupe) where dedupe is not null and status in ('enviando', 'enviado') do nothing
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.notify_claim(text, uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.notify_claim(text, uuid, uuid, uuid, text, text) to service_role;

-- 3 ── Interruptores por persona
alter table public.notification_rules add column if not exists notif jsonb;
comment on column public.notification_rules.notif is 'Interruptores de cada tipo de aviso de esta persona en este libro ({pagos:false,…}). Nulo o sin la clave = usa book_settings.notif.';

-- 4 ── Google Calendar: eventos creados por Mirai
create table if not exists public.google_event_map (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  key text not null,
  event_id text not null,
  calendar_id text not null default 'primary',
  hash text not null,
  fecha date not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id, key)
);
alter table public.google_event_map enable row level security;
drop policy if exists "ve sus eventos de google" on public.google_event_map;
create policy "ve sus eventos de google" on public.google_event_map for select to authenticated using (user_id = auth.uid());
comment on table public.google_event_map is 'Eventos que Mirai creó en el Google Calendar de cada persona (clave estable → id del evento y huella del contenido). Solo escribe el servidor.';

-- 5 ── Cron horario
alter table public.platform_settings add column if not exists cron_horario boolean not null default true;
comment on column public.platform_settings.cron_horario is 'Con el cron horario de pg_cron programado (mirai-notify), el resumen sale a la hora que eligió cada persona. Apagado: todos en la pasada diaria de las 6 a. m.';

create or replace function public.mirai_notify_cron_active()
returns boolean
language sql
stable
security definer
set search_path = public, cron
as $$ select exists (select 1 from cron.job where jobname = 'mirai-notify' and active) $$;
revoke all on function public.mirai_notify_cron_active() from public, anon, authenticated;
grant execute on function public.mirai_notify_cron_active() to service_role;

-- 6 ── Bandeja sin uso
do $$ begin
  if to_regclass('public.notification_outbox') is not null then
    comment on table public.notification_outbox is 'Sin uso desde la v5.5: los envíos se reclaman y registran en notification_log (dedupe + notify_claim). Se puede borrar cuando producción tenga la v5.5.';
  end if;
end $$;

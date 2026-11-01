-- Avisos: interruptores por canal, último envío y programación horaria con pg_cron + pg_net.

alter table public.notification_rules add column if not exists canales jsonb not null default '{"app":true,"popup":true}';
alter table public.notification_rules add column if not exists last_sent jsonb not null default '{}';  -- {canal: "YYYY-MM-DD"}

-- La TRM, la usura y los festivos se actualizan solos desde el cron diario.
alter table public.ref_trm add column if not exists fuente text;

-- Programación horaria (Vercel Hobby solo permite 1 cron al día). Se activa con:
--   select public.mirai_schedule_notify('https://tu-app.vercel.app', '<CRON_SECRET>');
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.mirai_schedule_notify(site_url text, cron_secret text)
returns text language plpgsql security definer set search_path = public, extensions, cron as $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'mirai-notify';
  perform cron.schedule('mirai-notify', '5 * * * *', format(
    $q$select net.http_get(url := %L, headers := jsonb_build_object('Authorization', %L), timeout_milliseconds := 55000)$q$,
    rtrim(site_url, '/') || '/api/cron/notify', 'Bearer ' || cron_secret));
  return 'Programado: cada hora en el minuto 5';
end $$;
revoke all on function public.mirai_schedule_notify(text, text) from public, anon, authenticated;

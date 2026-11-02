-- Mirai 5.5 · F3: "latido" del cron horario. Cada pasada horaria de /api/cron/notify marca la hora; si en 3 horas no
-- llega ninguna (pg_net caído, secreto equivocado…), la pasada diaria de Vercel vuelve a enviar el resumen a todos.
-- Aditiva: la versión publicada no lee esta columna.
alter table public.platform_settings add column if not exists cron_horario_visto timestamptz;
comment on column public.platform_settings.cron_horario_visto is 'Última pasada del cron horario (pg_cron → /api/cron/notify sin daily=1). La escribe la ruta del cron.';

-- Logros: interruptor por libro (S.cfg.gami de la v4).
alter table public.book_settings add column if not exists gami boolean not null default true;

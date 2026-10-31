-- Fase 1 · Ajustes al esquema detectados al portar formularios de la v4.
-- Préstamos: frecuencia "diariohab" (solo días hábiles) y sistema de cuota fija por valor.
alter table public.loans drop constraint if exists loans_frec_check;
alter table public.loans add constraint loans_frec_check check (frec in ('mensual','quincenal','semanal','diario','diariohab'));
alter table public.loans drop constraint if exists loans_sistema_check;
alter table public.loans add constraint loans_sistema_check check (sistema in ('frances','aleman','simple','sin','americano','diario','cuota'));
-- Cuota pactada cuando el usuario escribe el valor de la cuota en vez de la tasa (modoInt = cuota)
alter table public.loans add column if not exists cuota_fija numeric(18,2);
alter table public.loans add column if not exists tasa_ea numeric(10,4);
-- Gastos: razón/fuente de la clasificación automática de categoría
alter table public.expenses add column if not exists cat_src text check (cat_src in ('regla','ia','manual','palabra'));

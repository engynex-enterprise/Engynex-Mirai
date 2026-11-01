-- Calendario fiscal y laboral (FPL de la v4): categoría y fuente oficial de cada fecha.
alter table public.calendar_events add column if not exists cat text check (cat in ('laboral','dian','local','vehiculo','hogar','personal'));
alter table public.calendar_events add column if not exists fuente text;
-- Preferencias del calendario de pagos por usuario (vista y categorías apagadas) viven en user_preferences.calendar_prefs.

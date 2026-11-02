-- Ajustes de nómina del libro (Ajustes › Finanzas › Nómina). Aditiva: vacío = reglas nacionales por defecto.
-- nomina: {
--   retModo: 'auto' | 'proc2',     -- procedimiento de retención por defecto para ingresos nuevos (arts. 385 y 386 E.T.)
--   retPct: number,                -- % fijo del procedimiento 2 (lo calcula la empresa en junio y diciembre)
--   fsp: [[desde_smmlv, pct], …]   -- tabla del Fondo de Solidaridad Pensional (por defecto Ley 797 de 2003, art. 8)
-- }
alter table public.book_settings add column if not exists nomina jsonb not null default '{}';

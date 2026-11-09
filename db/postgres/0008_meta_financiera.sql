-- Tu meta financiera principal deja de ser una frase suelta y pasa a tener tipo, monto, fecha, la meta de ahorro con la
-- que se cumple y los pasos que ya diste. Así Mirai puede mostrarte el avance y ajustar lo que te recomienda.
-- Aditiva: `book_settings.meta` (el texto de siempre) se conserva y sigue siendo el título de la meta.
--
-- Forma de meta_cfg (MetaCfg de packages/domain/src/meta.ts):
--   { "tipo": "fondo|deudas|casa|carro|viaje|estudio|retiro|negocio|otro",
--     "monto": 30000000, "fecha": "2028-12-31", "goal_id": "<uuid de goals>",
--     "pasos": { "<id del paso>": true }, "creada": "2026-11-08" }
alter table public.book_settings add column if not exists meta_cfg jsonb default '{}'::jsonb not null;

comment on column public.book_settings.meta_cfg is 'Meta financiera principal del libro: tipo, monto objetivo, fecha, meta de ahorro enlazada (goals.id) y pasos marcados. El título sigue en book_settings.meta.';

-- PostgREST: que vea la columna nueva sin reiniciar.
notify pgrst, 'reload schema';

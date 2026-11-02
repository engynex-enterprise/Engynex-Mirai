-- Centro de ayuda: dos tipos nuevos de opinión (aditivo, idempotente).
--   elogio  → "Un elogio" en Tu opinión.
--   soporte → "Contactar soporte": un caso con tema y asunto (en contexto.soporte). Lo ve y responde el
--             administrador en la consola › Opiniones, con el mismo estado y aviso de respuesta que las opiniones.
-- La versión publicada no envía estos tipos y muestra cualquier tipo desconocido como "Otro tema".

alter table public.feedback drop constraint if exists feedback_tipo_check;
alter table public.feedback add constraint feedback_tipo_check
  check (tipo in ('calificacion', 'error', 'funcion', 'sugerencia', 'pregunta', 'otro', 'elogio', 'soporte'));

-- Aviso a los administradores al llegar una opinión o un caso de soporte nuevo.
create or replace function public.feedback_on_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  quien text := coalesce((select nullif(nombre, '') from public.profiles where id = new.user_id), 'Alguien');
  que text := case new.tipo when 'calificacion' then 'calificó Mirai con ' || new.rating || ' de 5' when 'error' then 'reportó un error'
    when 'funcion' then 'pidió una función' when 'sugerencia' then 'dejó una sugerencia' when 'pregunta' then 'hizo una pregunta'
    when 'elogio' then 'dejó un elogio' when 'soporte' then 'abrió un caso de soporte' else 'dejó un comentario' end;
begin
  insert into public.notifications (user_id, kind, titulo, cuerpo, href, dedupe)
  select a.user_id, 'opinion', quien || ' ' || que, left(coalesce(nullif(btrim(new.mensaje), ''), 'Sin comentario.'), 200), '/admin/opiniones', 'fb-new-' || new.id
  from public.platform_admins a where a.user_id <> new.user_id
  on conflict (user_id, dedupe) do nothing;
  return new;
end $$;

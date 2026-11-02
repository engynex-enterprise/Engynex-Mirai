-- Chat de Mirai (burbuja y /consejero): historial tipo ChatGPT/Claude. Aditiva e idempotente.
-- Las tablas chat_threads y chat_messages ya existen (20261031000100_core.sql) con borrado lógico (deleted_at) y RLS
-- "chat propio" (solo quien creó la conversación la ve). Aquí solo se agregan columnas con valores por defecto, así la
-- versión publicada sigue funcionando igual.

-- Conversaciones: fijar arriba, archivar, si el título lo puso Mirai (se puede reemplazar) y vista previa.
alter table public.chat_threads add column if not exists fijado boolean not null default false;
alter table public.chat_threads add column if not exists archivado boolean not null default false;
alter table public.chat_threads add column if not exists titulo_auto boolean not null default true;
alter table public.chat_threads add column if not exists ultimo text not null default '';

-- Mensajes: pulgar arriba/abajo (1 / -1) y adjuntos (nombre, tipo y tamaño; el archivo no se guarda).
alter table public.chat_messages add column if not exists feedback smallint;
alter table public.chat_messages add column if not exists adjuntos jsonb not null default '[]';
do $$ begin
  alter table public.chat_messages add constraint chat_messages_feedback_check check (feedback is null or feedback in (-1, 1));
exception when duplicate_object then null; end $$;

-- Consultas frecuentes: historial de la persona en el libro y mensajes de una conversación.
create index if not exists chat_threads_user_idx on public.chat_threads (book_id, user_id, updated_at desc) where deleted_at is null;
create index if not exists chat_messages_thread_idx on public.chat_messages (thread_id, created_at) where deleted_at is null;

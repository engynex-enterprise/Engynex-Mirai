-- v7 · V7-J · Reescribe las URL públicas de Supabase Storage guardadas en la base (§1.5, §3.4).
--   https://<ref>.supabase.co/storage/v1/object/public/<bucket>/…  →  <nuevo>/<bucket>/…
-- Barre TODAS las columnas text, varchar y jsonb de `public` (profiles.avatar_url, family_members.avatar, imágenes
-- de ads/ad_campaigns, la imagen de WhatsApp en platform_integrations.config…), no solo las conocidas, y reemplaza el
-- prefijo donde aparezca (también dentro de un jsonb o de un texto más largo).
-- No toca la historia (audit_log, admin_audit, account_events, notification_log): es registro de lo que pasó.
-- Idempotente (lo ya reescrito no vuelve a coincidir). La función vive en pg_temp: desaparece al cerrar la sesión.
-- Uso: scripts/migrate/rewrite-public-urls.ts (corre este archivo y luego la función, en simulación o aplicando).
create or replace function pg_temp.mirai_rewrite_public_urls(old_prefix text, new_prefix text, aplicar boolean default false)
returns table (tabla text, columna text, filas bigint)
language plpgsql as $$
declare
  c record;
  n bigint;
  pat text;
begin
  if coalesce(old_prefix, '') = '' or coalesce(new_prefix, '') = '' then raise exception 'Faltan los prefijos'; end if;
  pat := '%' || replace(replace(replace(old_prefix, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  for c in
    select k.table_name::text as t, k.column_name::text as col, k.data_type::text as ty
    from information_schema.columns k
    join information_schema.tables x on x.table_schema = k.table_schema and x.table_name = k.table_name and x.table_type = 'BASE TABLE'
    where k.table_schema = 'public' and k.data_type in ('text', 'character varying', 'jsonb') and k.is_generated = 'NEVER'
      and k.table_name not in ('audit_log', 'admin_audit', 'account_events', 'notification_log', '_mirai_migrations')
    order by 1, 2
  loop
    execute format('select count(*) from public.%I where %I::text like $1', c.t, c.col) into n using pat;
    if n > 0 and aplicar then
      if c.ty = 'jsonb' then
        execute format('update public.%I set %I = replace(%I::text, $1, $2)::jsonb where %I::text like $3', c.t, c.col, c.col, c.col) using old_prefix, new_prefix, pat;
      else
        execute format('update public.%I set %I = replace(%I, $1, $2) where %I like $3', c.t, c.col, c.col, c.col) using old_prefix, new_prefix, pat;
      end if;
    end if;
    if n > 0 then
      tabla := c.t; columna := c.col; filas := n;
      return next;
    end if;
  end loop;
end $$;

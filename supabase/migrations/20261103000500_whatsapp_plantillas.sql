-- Plantillas de WhatsApp: archivos públicos de la plataforma (imagen del encabezado de las plantillas).
-- Aditiva e idempotente. La asignación de plantillas por caso vive en platform_integrations.config (kind = 'whatsapp').
-- Por qué Storage y no un "media id" de Meta: los medios subidos a Meta vencen a los 30 días; un enlace público
-- https de Supabase Storage no vence y Meta lo descarga (y guarda en caché) al enviar.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('public-assets', 'public-assets', true, 5242880, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "public-assets subir" on storage.objects;
create policy "public-assets subir" on storage.objects for insert to authenticated with check (bucket_id = 'public-assets' and public.is_platform_admin());
drop policy if exists "public-assets cambiar" on storage.objects;
create policy "public-assets cambiar" on storage.objects for update to authenticated using (bucket_id = 'public-assets' and public.is_platform_admin());
drop policy if exists "public-assets borrar" on storage.objects;
create policy "public-assets borrar" on storage.objects for delete to authenticated using (bucket_id = 'public-assets' and public.is_platform_admin());

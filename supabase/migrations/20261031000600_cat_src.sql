-- Origen de la categoría automática (localCat de la v4): regla del usuario, historial o palabras clave.
alter table public.expenses drop constraint if exists expenses_cat_src_check;
alter table public.expenses add constraint expenses_cat_src_check check (cat_src in ('regla','historial','palabras','palabra','ia','manual'));

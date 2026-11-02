-- Mirai 5.5 · Proveedores: catálogo por libro de las empresas o personas a las que les pagas (Enel, la inmobiliaria,
-- Claro, el colegio…). Aditiva e idempotente: pruebas y producción comparten base.
--   · Tabla `providers` con RLS por libro, borrado lógico, auditoría y Realtime.
--   · `provider_id` nuevo en gastos fijos, suscripciones y gastos. La columna de texto `fixed_expenses.proveedor`
--     NO cambia: un trigger la mantiene sincronizada con la FK (y al revés, si la versión publicada solo escribe el
--     texto, el trigger busca o crea el proveedor y llena la FK).
--   · Migra los textos que ya existen en `fixed_expenses.proveedor` a proveedores (sin duplicar: mayúsculas,
--     tildes, puntos y espacios no cuentan) y los enlaza.

-- ── Normalización del nombre (igual a normProv() en lib/domain/proveedores.ts) ──────────────────────────────────
create or replace function public.provider_norm(s text) returns text
language sql immutable parallel safe as $$
  select btrim(regexp_replace(regexp_replace(lower(translate(coalesce(s, ''),
    'ÁÉÍÓÚÜÀÈÌÒÙáéíóúüàèìòù', 'AEIOUUAEIOUaeiouuaeiou')), '[.,]', '', 'g'), '\s+', ' ', 'g'))
$$;

-- Tipo sugerido por el nombre (igual a tipoSugerido() en lib/domain/proveedores.ts).
create or replace function public.provider_tipo(s text) returns text
language sql immutable parallel safe as $$
  select case
    when n ~ '(acueducto|alcantarillado|energia|\menel\M|\mepm\M|\mvanti\M|\mgas\M|aseo|codensa|electrific|empresas publicas|servicios publicos|\maaa\M|emcali|air-e|afinia|\messa\M|celsia)' then 'servicios'
    when n ~ '(internet|claro|movistar|\mtigo\M|\metb\M|\mwom\M|\mune\M|directv|operador|celular|telefon|fibra)' then 'telecom'
    when n ~ '(inmobiliaria|arriendo|arrendador|conjunto|administracion|propiedad horizontal|edificio|\mph\M)' then 'vivienda'
    when n ~ '(\meps\M|salud|sanitas|\msura\M|compensar|colsanitas|medic|clinica|hospital|odontolog|prepagada|nueva eps|famisanar|salud total)' then 'salud'
    when n ~ '(colegio|universidad|jardin|escuela|instituto|academia|icetex|liceo|gimnasio moderno)' then 'educacion'
    when n ~ '(transporte|transmilenio|\mmetro\M|peaje|parqueadero|gasolina|terpel|primax|\mtaxi\M|ruta escolar)' then 'transporte'
    when n ~ '(seguro|asegurador|aseguradora|allianz|mapfre|axa colpatria|liberty|soat|previsora)' then 'seguros'
    when n ~ '(netflix|spotify|disney|youtube|prime video|\mhbo\M|\mmax\M|apple|icloud|google one|microsoft|suscrip)' then 'suscripciones'
    when n ~ '(exito|carulla|jumbo|olimpica|\md1\M|\mara\M|alkosto|falabella|homecenter|tienda|supermercado|drogueria|colsubsidio|cafam)' then 'comercio'
    else 'otro' end
  from (select public.provider_norm(s) as n) x
$$;

-- ── Tabla ───────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  tipo text not null default 'otro'
    check (tipo in ('servicios','telecom','vivienda','salud','educacion','transporte','seguros','suscripciones','comercio','otro')),
  nit text not null default '',
  telefono text not null default '',
  correo text not null default '',
  sitio_web text not null default '',
  referencia text not null default '',              -- número de contrato, de cliente o de cuenta
  notas text not null default '',
  icon text,                                          -- ícono Lucide propio (si no, el del tipo)
  brand text,                                         -- clave de lib/brands.ts (logo del servicio, solo para identificarlo)
  category_id uuid references public.categories(id) on delete set null,   -- categoría de gasto por defecto
  activo boolean not null default true,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index if not exists providers_book_idx on public.providers(book_id);
-- Sin duplicados por libro (entre los vivos): "ENEL", "Enel " y "enel" son el mismo proveedor.
create unique index if not exists providers_book_norm_uidx on public.providers(book_id, public.provider_norm(nombre)) where deleted_at is null;

alter table public.providers enable row level security;
drop policy if exists "leer providers" on public.providers;
create policy "leer providers" on public.providers for select to authenticated using (public.is_book_member(book_id, 'viewer'));
drop policy if exists "crear providers" on public.providers;
create policy "crear providers" on public.providers for insert to authenticated with check (public.is_book_member(book_id, 'editor'));
drop policy if exists "editar providers" on public.providers;
create policy "editar providers" on public.providers for update to authenticated using (public.is_book_member(book_id, 'editor')) with check (public.is_book_member(book_id, 'editor'));
drop policy if exists "borrar providers" on public.providers;
create policy "borrar providers" on public.providers for delete to authenticated using (public.is_book_member(book_id, 'editor'));

drop trigger if exists trg_touch on public.providers;
create trigger trg_touch before update on public.providers for each row execute function public.touch_updated_at();
drop trigger if exists trg_audit on public.providers;
create trigger trg_audit after insert or update or delete on public.providers for each row execute function public.audit_row();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'providers') then
    alter publication supabase_realtime add table public.providers;
  end if;
end $$;

-- ── FK nuevas (la columna de texto se conserva) ────────────────────────────────────────────────────────────────
alter table public.fixed_expenses add column if not exists provider_id uuid references public.providers(id) on delete set null;
alter table public.subscriptions  add column if not exists provider_id uuid references public.providers(id) on delete set null;
alter table public.expenses       add column if not exists provider_id uuid references public.providers(id) on delete set null;
create index if not exists fixed_expenses_provider_idx on public.fixed_expenses(provider_id) where provider_id is not null;
create index if not exists subscriptions_provider_idx  on public.subscriptions(provider_id) where provider_id is not null;
create index if not exists expenses_provider_idx       on public.expenses(provider_id) where provider_id is not null;

-- ── Datos: textos existentes → proveedores ─────────────────────────────────────────────────────────────────────
-- Se quitan los triggers antes de migrar (si la migración se vuelve a aplicar) para no reescribir los textos.
drop trigger if exists trg_provider_sync on public.fixed_expenses;

-- Un proveedor por libro y nombre normalizado. Nombre: la forma escrita más usada (con los espacios limpios).
-- Categoría por defecto: la más usada en esos gastos fijos. Se omiten los aportes programados (link_type).
insert into public.providers (book_id, nombre, tipo, category_id, created_by)
select g.book_id, g.nombre, public.provider_tipo(g.nombre), g.category_id, g.created_by
from (
  select f.book_id, public.provider_norm(f.proveedor) as k,
    (array_agg(regexp_replace(btrim(f.proveedor), '\s+', ' ', 'g') order by c.n desc, f.proveedor))[1] as nombre,
    (array_agg(f.category_id order by cc.n desc nulls last) filter (where f.category_id is not null))[1] as category_id,
    (array_agg(f.created_by) filter (where f.created_by is not null))[1] as created_by
  from public.fixed_expenses f
  join lateral (select count(*) n from public.fixed_expenses x
    where x.book_id = f.book_id and x.deleted_at is null and x.proveedor = f.proveedor) c on true
  left join lateral (select count(*) n from public.fixed_expenses x
    where x.book_id = f.book_id and x.deleted_at is null and x.category_id = f.category_id
      and public.provider_norm(x.proveedor) = public.provider_norm(f.proveedor)) cc on true
  where f.deleted_at is null and f.link_type is null and public.provider_norm(f.proveedor) <> ''
  group by f.book_id, public.provider_norm(f.proveedor)
) g
on conflict (book_id, public.provider_norm(nombre)) where deleted_at is null do nothing;

-- Enlaza los gastos fijos (también los de la papelera, para que "Deshacer" los traiga enlazados).
update public.fixed_expenses f set provider_id = p.id
from public.providers p
where f.provider_id is null and f.link_type is null and public.provider_norm(f.proveedor) <> ''
  and p.book_id = f.book_id and p.deleted_at is null and public.provider_norm(p.nombre) = public.provider_norm(f.proveedor);

-- Suscripciones con el mismo nombre que un proveedor del libro.
update public.subscriptions s set provider_id = p.id
from public.providers p
where s.provider_id is null and p.book_id = s.book_id and p.deleted_at is null
  and public.provider_norm(p.nombre) = public.provider_norm(s.nombre);

-- Gastos creados al pagar un gasto fijo: heredan el proveedor del gasto fijo.
update public.expenses e set provider_id = f.provider_id
from public.fixed_expenses f
where e.provider_id is null and e.fixed_expense_id = f.id and f.provider_id is not null;

-- ── Sincronización texto ↔ FK en gastos fijos ──────────────────────────────────────────────────────────────────
create or replace function public.fixed_provider_sync() returns trigger
language plpgsql as $$
declare pid uuid; pname text; txt text;
begin
  if tg_op = 'UPDATE' and new.provider_id is not distinct from old.provider_id and new.proveedor is not distinct from old.proveedor then
    return new;
  end if;
  -- Cambió la FK (versión nueva): el texto toma el nombre del proveedor.
  if new.provider_id is not null and (tg_op = 'INSERT' or new.provider_id is distinct from old.provider_id) then
    select nombre into pname from public.providers where id = new.provider_id and book_id = new.book_id;
    if pname is null then new.provider_id := null; else new.proveedor := pname; return new; end if;
  end if;
  -- Cambió solo el texto (versión publicada, importación o restauración antigua): busca o crea el proveedor.
  if new.link_type is not null then return new; end if;
  txt := regexp_replace(btrim(coalesce(new.proveedor, '')), '\s+', ' ', 'g');
  if txt = '' then new.provider_id := null; return new; end if;
  select id into pid from public.providers
    where book_id = new.book_id and deleted_at is null and public.provider_norm(nombre) = public.provider_norm(txt) limit 1;
  if pid is null then
    insert into public.providers (book_id, nombre, tipo, category_id)
      values (new.book_id, left(txt, 120), public.provider_tipo(txt), new.category_id)
      on conflict (book_id, public.provider_norm(nombre)) where deleted_at is null do nothing
      returning id into pid;
    if pid is null then
      select id into pid from public.providers
        where book_id = new.book_id and deleted_at is null and public.provider_norm(nombre) = public.provider_norm(txt) limit 1;
    end if;
  end if;
  new.provider_id := pid;
  return new;
end $$;
create trigger trg_provider_sync before insert or update of proveedor, provider_id on public.fixed_expenses
  for each row execute function public.fixed_provider_sync();

-- Al renombrar un proveedor, el texto de sus gastos fijos cambia también (lo que ve la versión publicada).
create or replace function public.provider_rename_sync() returns trigger
language plpgsql as $$
begin
  if new.nombre is distinct from old.nombre then
    update public.fixed_expenses set proveedor = new.nombre where provider_id = new.id and proveedor is distinct from new.nombre;
  end if;
  return new;
end $$;
drop trigger if exists trg_provider_rename on public.providers;
create trigger trg_provider_rename after update of nombre on public.providers
  for each row execute function public.provider_rename_sync();

-- Gasto nuevo de un gasto fijo (pay_fixed_expense) o de una suscripción sin proveedor: hereda el del origen.
create or replace function public.expense_provider_default() returns trigger
language plpgsql as $$
begin
  if new.provider_id is null and new.fixed_expense_id is not null then
    select provider_id into new.provider_id from public.fixed_expenses where id = new.fixed_expense_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_expense_provider on public.expenses;
create trigger trg_expense_provider before insert on public.expenses
  for each row execute function public.expense_provider_default();

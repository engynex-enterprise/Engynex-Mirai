-- Quien presta siempre es un registro escogible (nunca solo un texto). Aditiva e idempotente:
--   1. entities.tipo acepta 'Casa de empeño' (solo amplía la lista; la versión publicada sigue escribiendo las de antes).
--   2. Las deudas que guardaron el nombre escrito en loans.acreedor sin entidad, contacto ni proveedor quedan enlazadas:
--      · empeño (tipo 'empeno', o sin tipo y con prenda en Le debo) → UNA entidad 'Casa de empeño' por nombre
--        normalizado en cada libro (si ya hay una entidad con ese nombre, se reutiliza);
--      · las demás (gota a gota, préstamos de personas…) → un contacto 'persona' por nombre normalizado (o el que ya exista).
--   loans.acreedor no se toca: la versión publicada lo sigue leyendo. Volver a correrla no crea nada nuevo.
--   Nombres comparados con public.provider_norm() (sin tildes, minúsculas, sin puntos ni comas y con un solo espacio).

alter table public.entities drop constraint if exists entities_tipo_check;
alter table public.entities add constraint entities_tipo_check
  check (tipo in ('Banco','Cooperativa','Fintech','Billetera','Fondo','Casa de empeño','Otro'));

drop table if exists pg_temp._sin_registro;
create temporary table _sin_registro on commit drop as
select l.id, l.book_id, public.provider_norm(l.acreedor) as k, left(regexp_replace(btrim(l.acreedor), '\s+', ' ', 'g'), 60) as nombre,
       (l.kind = 'pagar' and (l.tipo = 'empeno' or (l.tipo is null and l.prenda is not null))) as empeno, l.created_at
from public.loans l
where l.deleted_at is null and l.entity_id is null and l.contact_id is null and l.provider_id is null
  and public.provider_norm(l.acreedor) <> '';

-- Empeños → entidades (una por nombre en cada libro).
insert into public.entities (book_id, nombre, tipo)
select distinct on (s.book_id, s.k) s.book_id, s.nombre, 'Casa de empeño'
from _sin_registro s
where s.empeno
  and not exists (select 1 from public.entities e where e.book_id = s.book_id and e.deleted_at is null and public.provider_norm(e.nombre) = s.k)
order by s.book_id, s.k, s.created_at;

update public.loans l set entity_id = (
  select e.id from public.entities e where e.book_id = s.book_id and e.deleted_at is null and public.provider_norm(e.nombre) = s.k
  order by e.created_at limit 1)
from _sin_registro s
where s.id = l.id and s.empeno;

-- Los demás → contactos (uno por nombre en cada libro).
insert into public.contacts (book_id, tipo, nombre)
select distinct on (s.book_id, s.k) s.book_id, 'persona', s.nombre
from _sin_registro s
where not s.empeno
  and not exists (select 1 from public.contacts c where c.book_id = s.book_id and c.deleted_at is null and public.provider_norm(c.nombre) = s.k)
order by s.book_id, s.k, s.created_at;

update public.loans l set contact_id = (
  select c.id from public.contacts c where c.book_id = s.book_id and c.deleted_at is null and public.provider_norm(c.nombre) = s.k
  order by c.created_at limit 1)
from _sin_registro s
where s.id = l.id and not s.empeno;

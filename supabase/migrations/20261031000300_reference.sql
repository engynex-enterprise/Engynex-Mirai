-- Mirai 5.0 · Datos de referencia verificados (31-oct-2026, subagente finanzas-colombia).
-- Fuentes: Decreto 2229 de 2023 (art. 1.6.1.13.2.15 DUR 1625/2016), Decreto 1226 de 2026 (sismo),
-- Res. DIAN 000193/2024 y 000238/2025 (UVT), Decreto 1469/2025 y 0159/2026 (SMMLV), Ley 51/1983 y Ley 2578/2026 (festivos).

alter table public.ref_renta_calendar add column if not exists regimen text not null default 'general';
alter table public.ref_renta_calendar drop constraint if exists ref_renta_calendar_pkey;
alter table public.ref_renta_calendar add primary key (year, regimen, digitos);

create table if not exists public.ref_renta_regimenes (
  key text primary key,
  nombre text not null,
  descripcion text not null,
  norma text not null,
  seccionales text[] not null default '{}'
);
alter table public.ref_renta_regimenes enable row level security;
drop policy if exists "leer ref_renta_regimenes" on public.ref_renta_regimenes;
create policy "leer ref_renta_regimenes" on public.ref_renta_regimenes for select to anon, authenticated using (true);

insert into public.ref_renta_regimenes(key, nombre, descripcion, norma, seccionales) values
 ('general','Calendario general','Personas naturales según los dos últimos dígitos del NIT.','Decreto 2229 de 2023', '{}'),
 ('sismo_dec1226','Plazo especial por el sismo del 10 de agosto de 2026',
  'Aplica si tu domicilio en el RUT al 10-ago-2026 estaba en un municipio de las seccionales indicadas y tu NIT termina en 01 a 26. No aplica a grandes contribuyentes. Confírmalo con tu contador.',
  'Decreto 1226 de 2026', array['Cali','Palmira','Tuluá','Buenaventura','Pereira','Armenia','Manizales','Quibdó','Popayán'])
on conflict (key) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, norma = excluded.norma, seccionales = excluded.seccionales;

insert into public.ref_uvt(year, valor, fuente) values
 (2024, 47065, 'Resolución DIAN 000187 de 2023'),
 (2025, 49799, 'Resolución DIAN 000193 de 2024'),
 (2026, 52374, 'Resolución DIAN 000238 de 2025')
on conflict (year) do update set valor = excluded.valor, fuente = excluded.fuente;

insert into public.ref_smmlv(year, valor, fuente) values
 (2026, 1750905, 'Decreto 1469 de 2025 / Decreto 0159 de 2026 (transitorio, mismo valor)')
on conflict (year) do update set valor = excluded.valor, fuente = excluded.fuente;

insert into public.ref_holidays(fecha, nombre) values
 ('2026-01-01','Año Nuevo'),('2026-01-12','Reyes Magos'),('2026-03-23','San José'),('2026-04-02','Jueves Santo'),
 ('2026-04-03','Viernes Santo'),('2026-05-01','Día del Trabajo'),('2026-05-18','Ascensión del Señor'),('2026-06-08','Corpus Christi'),
 ('2026-06-15','Sagrado Corazón'),('2026-06-29','San Pedro y San Pablo'),('2026-07-13','Virgen de Chiquinquirá'),
 ('2026-07-20','Día de la Independencia'),('2026-08-07','Batalla de Boyacá'),('2026-08-17','Asunción de la Virgen'),
 ('2026-10-12','Día de la Raza'),('2026-11-02','Todos los Santos'),('2026-11-16','Independencia de Cartagena'),
 ('2026-12-08','Inmaculada Concepción'),('2026-12-25','Navidad')
on conflict (fecha) do update set nombre = excluded.nombre;

insert into public.ref_renta_calendar(year, regimen, digitos, fecha) values
(2026,'general','01','2026-08-12'),
(2026,'general','02','2026-08-12'),
(2026,'general','03','2026-08-13'),
(2026,'general','04','2026-08-13'),
(2026,'general','05','2026-08-14'),
(2026,'general','06','2026-08-14'),
(2026,'general','07','2026-08-18'),
(2026,'general','08','2026-08-18'),
(2026,'general','09','2026-08-19'),
(2026,'general','10','2026-08-19'),
(2026,'general','11','2026-08-20'),
(2026,'general','12','2026-08-20'),
(2026,'general','13','2026-08-21'),
(2026,'general','14','2026-08-21'),
(2026,'general','15','2026-08-24'),
(2026,'general','16','2026-08-24'),
(2026,'general','17','2026-08-25'),
(2026,'general','18','2026-08-25'),
(2026,'general','19','2026-08-26'),
(2026,'general','20','2026-08-26'),
(2026,'general','21','2026-08-27'),
(2026,'general','22','2026-08-27'),
(2026,'general','23','2026-08-28'),
(2026,'general','24','2026-08-28'),
(2026,'general','25','2026-08-31'),
(2026,'general','26','2026-08-31'),
(2026,'general','27','2026-09-01'),
(2026,'general','28','2026-09-01'),
(2026,'general','29','2026-09-02'),
(2026,'general','30','2026-09-02'),
(2026,'general','31','2026-09-03'),
(2026,'general','32','2026-09-03'),
(2026,'general','33','2026-09-04'),
(2026,'general','34','2026-09-04'),
(2026,'general','35','2026-09-07'),
(2026,'general','36','2026-09-07'),
(2026,'general','37','2026-09-08'),
(2026,'general','38','2026-09-08'),
(2026,'general','39','2026-09-09'),
(2026,'general','40','2026-09-09'),
(2026,'general','41','2026-09-10'),
(2026,'general','42','2026-09-10'),
(2026,'general','43','2026-09-11'),
(2026,'general','44','2026-09-11'),
(2026,'general','45','2026-09-14'),
(2026,'general','46','2026-09-14'),
(2026,'general','47','2026-09-15'),
(2026,'general','48','2026-09-15'),
(2026,'general','49','2026-09-16'),
(2026,'general','50','2026-09-16'),
(2026,'general','51','2026-09-17'),
(2026,'general','52','2026-09-17'),
(2026,'general','53','2026-09-18'),
(2026,'general','54','2026-09-18'),
(2026,'general','55','2026-09-21'),
(2026,'general','56','2026-09-21'),
(2026,'general','57','2026-09-22'),
(2026,'general','58','2026-09-22'),
(2026,'general','59','2026-09-23'),
(2026,'general','60','2026-09-23'),
(2026,'general','61','2026-09-24'),
(2026,'general','62','2026-09-24'),
(2026,'general','63','2026-09-25'),
(2026,'general','64','2026-09-25'),
(2026,'general','65','2026-09-28'),
(2026,'general','66','2026-09-28'),
(2026,'general','67','2026-10-01'),
(2026,'general','68','2026-10-01'),
(2026,'general','69','2026-10-02'),
(2026,'general','70','2026-10-02'),
(2026,'general','71','2026-10-05'),
(2026,'general','72','2026-10-05'),
(2026,'general','73','2026-10-06'),
(2026,'general','74','2026-10-06'),
(2026,'general','75','2026-10-07'),
(2026,'general','76','2026-10-07'),
(2026,'general','77','2026-10-08'),
(2026,'general','78','2026-10-08'),
(2026,'general','79','2026-10-09'),
(2026,'general','80','2026-10-09'),
(2026,'general','81','2026-10-13'),
(2026,'general','82','2026-10-13'),
(2026,'general','83','2026-10-14'),
(2026,'general','84','2026-10-14'),
(2026,'general','85','2026-10-15'),
(2026,'general','86','2026-10-15'),
(2026,'general','87','2026-10-16'),
(2026,'general','88','2026-10-16'),
(2026,'general','89','2026-10-19'),
(2026,'general','90','2026-10-19'),
(2026,'general','91','2026-10-20'),
(2026,'general','92','2026-10-20'),
(2026,'general','93','2026-10-21'),
(2026,'general','94','2026-10-21'),
(2026,'general','95','2026-10-22'),
(2026,'general','96','2026-10-22'),
(2026,'general','97','2026-10-23'),
(2026,'general','98','2026-10-23'),
(2026,'general','99','2026-10-26'),
(2026,'general','00','2026-10-26'),
(2026,'sismo_dec1226','01','2026-10-27'),
(2026,'sismo_dec1226','02','2026-10-27'),
(2026,'sismo_dec1226','03','2026-10-28'),
(2026,'sismo_dec1226','04','2026-10-28'),
(2026,'sismo_dec1226','05','2026-10-29'),
(2026,'sismo_dec1226','06','2026-10-29'),
(2026,'sismo_dec1226','07','2026-10-30'),
(2026,'sismo_dec1226','08','2026-10-30'),
(2026,'sismo_dec1226','09','2026-11-03'),
(2026,'sismo_dec1226','10','2026-11-03'),
(2026,'sismo_dec1226','11','2026-11-04'),
(2026,'sismo_dec1226','12','2026-11-04'),
(2026,'sismo_dec1226','13','2026-11-05'),
(2026,'sismo_dec1226','14','2026-11-05'),
(2026,'sismo_dec1226','15','2026-11-06'),
(2026,'sismo_dec1226','16','2026-11-06'),
(2026,'sismo_dec1226','17','2026-11-09'),
(2026,'sismo_dec1226','18','2026-11-09'),
(2026,'sismo_dec1226','19','2026-11-10'),
(2026,'sismo_dec1226','20','2026-11-10'),
(2026,'sismo_dec1226','21','2026-11-11'),
(2026,'sismo_dec1226','22','2026-11-11'),
(2026,'sismo_dec1226','23','2026-11-12'),
(2026,'sismo_dec1226','24','2026-11-12'),
(2026,'sismo_dec1226','25','2026-11-13'),
(2026,'sismo_dec1226','26','2026-11-13')

on conflict (year, regimen, digitos) do update set fecha = excluded.fecha;

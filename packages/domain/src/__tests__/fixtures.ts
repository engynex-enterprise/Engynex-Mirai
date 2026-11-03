// Mutaciones JS (forma v4) que se aplican sobre `sample()` para cubrir más casos en las pruebas:
// tarjetas, ingresos extra, calendario con montos, ingresos semanales/anuales/en dólares, empeños,
// CDT por vencer, meta cercana, gastos con marca manual/IA y categoría inexistente.
export const RICO = `
S.tarjetas=[
 {id:'tc1',nombre:'Visa',entidad:'',cupo:8000000,corte:25,pago:10,tasa:2.1,compras:[
  {id:'c1',fecha:iso(addDays(today(),-50)),desc:'Nevera',valor:2400000,cuotas:12},
  {id:'c2',fecha:iso(addDays(today(),-5)),desc:'Mercado',valor:300000,cuotas:1},
  {id:'c3',fecha:iso(addDays(today(),-100)),desc:'TV',valor:1200000,cuotas:6,pagada:true},
  {id:'c4',fecha:iso(addDays(today(),-20)),desc:'Viaje',valor:900000,cuotas:3}]},
 {id:'tc2',nombre:'Master',entidad:'',cupo:3000000,corte:31,pago:31,tasa:1.9,compras:[
  {id:'c5',fecha:iso(addDays(today(),-200)),desc:'Celular',valor:600000,cuotas:24}]}];
S.extras=[{id:'e1',fecha:iso(addDays(today(),-3)),desc:'Venta bicicleta',valor:450000},{id:'e2',fecha:iso(addDays(today(),20)),desc:'Bono',valor:300000}];
S.calendario.forEach((c,i)=>c.monto=(i+1)*100000);
S.ingresos.push(
 {id:'sem',concepto:'Clases',cat:'Honorarios',valor:120000,frec:'semanal',dia:5,quien:'familia',moneda:'COP'},
 {id:'anu',concepto:'Bonificación anual',cat:'Salario',valor:6000000,frec:'anual',dia:15,quien:'familia',moneda:'COP'},
 {id:'usd',concepto:'Freelance',cat:'Honorarios',valor:500,frec:'mensual',dia:20,quien:'familia',moneda:'USD'});
S.suscripciones[1].comparte=2;
S.pagar[1].prenda={obj:'Reloj',valor:900000,limite:iso(addDays(today(),9)),ref:'B-1'};
S.cobrar[0].prenda={obj:'Moto',valor:3000000,limite:iso(addDays(today(),-4)),ref:''};
S.inversiones.push(
 {id:'cdtx',tipo:'cdt',nombre:'CDT corto',entidad:'',capital:2000000,tasa:10,inicio:iso(addDays(today(),-85)),dias:90,ret:4,moneda:'COP',actual:0},
 {id:'etf',tipo:'acciones',nombre:'ETF',entidad:'',capital:1000,tasa:0,inicio:iso(addDays(today(),-30)),dias:0,ret:0,moneda:'USD',actual:1100});
S.metas.push({id:'mx',nombre:'Regalo',objetivo:500000,ahorrado:100000,fecha:iso(addDays(today(),12)),icon:'gift'});
S.gastos.push(
 {id:'gx1',fecha:iso(today()),desc:'Tinto',cat:'Café',valor:3000,quien:'familia',medio:'Efectivo',hormiga:false,hormigaSrc:'manual'},
 {id:'gx2',fecha:iso(today()),desc:'Regalo cumpleaños',cat:'Regalos',valor:20000,quien:'familia',medio:'Efectivo',hormiga:true,hormigaSrc:'ia'},
 {id:'gx3',fecha:iso(today()),desc:'Algo raro',cat:'Inexistente',valor:15000,quien:'familia',medio:'Efectivo'},
 {id:'gx4',fecha:iso(today()),desc:'Cena de aniversario',cat:'Restaurantes',valor:180000,quien:'familia',medio:'Tarjeta de crédito'});
S.cfg.categorias.find(c=>c.nombre==='Restaurantes').tope=100000;
S.cfg.limite=60000;
`

/** Fechas "hoy" con las que se repiten las pruebas agregadas (fin de mes, quincena, diciembre, febrero, año nuevo). */
export const HOYS = ["2026-10-31", "2026-03-15", "2026-12-24", "2027-02-28", "2027-01-01"]
